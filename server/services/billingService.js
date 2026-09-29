const { dbQuery } = require('../db/database');

/**
 * Calculates tariff cost for a given incremental kWh based on active tariff slabs.
 */
async function calculateTariffCost(incrementalKwh, currentTotalKwh) {
  if (incrementalKwh <= 0) return 0.0;

  // Get active domestic tariffs ordered by min_kwh ascending
  const tariffs = await dbQuery.all(
    'SELECT * FROM tariffs WHERE is_active = 1 ORDER BY min_kwh ASC'
  );

  if (!tariffs || tariffs.length === 0) {
    // Fallback default flat rate if database table is empty
    return incrementalKwh * 25.0;
  }

  // Determine effective unit rate based on current block usage
  let applicableRate = tariffs[0].rate_per_kwh;
  for (const t of tariffs) {
    if (currentTotalKwh >= t.min_kwh) {
      applicableRate = t.rate_per_kwh;
    }
  }

  const cost = incrementalKwh * applicableRate;
  return parseFloat(cost.toFixed(2));
}

/**
 * Process new incoming meter reading:
 * 1. Calculates energy consumption & billing cost.
 * 2. Updates wallet balance and inserts ledger transaction.
 * 3. Checks if balance depleted <= 0 and triggers automatic power DISCONNECT.
 */
async function processMeterReading(meterId, cumulativeKwh) {
  // 1. Fetch meter details
  const meter = await dbQuery.get('SELECT * FROM meters WHERE id = ?', [meterId]);
  if (!meter) {
    throw new Error(`Meter '${meterId}' not found.`);
  }

  const lastReadingKwh = meter.last_reading_kwh || 0.0;
  const incrementalKwh = Math.max(0, parseFloat((cumulativeKwh - lastReadingKwh).toFixed(3)));

  // Calculate billing cost
  const costCharged = await calculateTariffCost(incrementalKwh, cumulativeKwh);

  // 2. Fetch user's wallet
  const wallet = await dbQuery.get('SELECT * FROM wallets WHERE user_id = ?', [meter.user_id]);
  if (!wallet) {
    throw new Error(`Wallet not found for user ID ${meter.user_id}`);
  }

  const balanceBefore = wallet.current_balance;
  const balanceAfter = parseFloat((balanceBefore - costCharged).toFixed(2));

  // 3. Record meter reading
  const readingRes = await dbQuery.run(
    `INSERT INTO meter_readings (meter_id, cumulative_kwh, incremental_kwh, cost_charged) VALUES (?, ?, ?, ?)`,
    [meterId, cumulativeKwh, incrementalKwh, costCharged]
  );
  const readingId = readingRes.lastID;

  // 4. Update meter last reading
  await dbQuery.run(
    `UPDATE meters SET last_reading_kwh = ?, last_reading_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [cumulativeKwh, meterId]
  );

  // 5. Update wallet balance & add ledger entry if cost > 0
  if (costCharged > 0) {
    await dbQuery.run(
      `UPDATE wallets SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [balanceAfter, wallet.id]
    );

    await dbQuery.run(
      `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_before, balance_after, reference) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [wallet.id, meter.user_id, 'CONSUMPTION', -costCharged, balanceBefore, balanceAfter, `MTR-BILL-${readingId}`]
    );
  }

  // 6. Check power state control logic (Exhaustion Disconnect)
  let updatedPowerState = meter.power_state;
  let powerCommandExecuted = null;

  if (balanceAfter <= 0 && meter.power_state === 'CONNECTED') {
    updatedPowerState = 'DISCONNECTED';

    // Update meter power state
    await dbQuery.run(
      `UPDATE meters SET power_state = 'DISCONNECTED' WHERE id = ?`,
      [meterId]
    );

    // Create disconnect power command
    const cmdId = 'CMD-DISC-' + Date.now();
    await dbQuery.run(
      `INSERT INTO power_commands (command_id, meter_id, user_id, action, reason, status) VALUES (?, ?, ?, ?, ?, ?)`,
      [cmdId, meterId, meter.user_id, 'DISCONNECT', `Automatic cutoff: Wallet balance exhausted (LKR ${balanceAfter.toFixed(2)})`, 'EXECUTED']
    );

    powerCommandExecuted = {
      commandId: cmdId,
      action: 'DISCONNECT',
      reason: `Automatic cutoff: Wallet balance exhausted (LKR ${balanceAfter.toFixed(2)})`
    };

    // Audit log
    await dbQuery.run(
      `INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)`,
      [meter.user_id, 'system', 'POWER_DISCONNECTED', `Meter ${meterId} relay opened. Balance: LKR ${balanceAfter.toFixed(2)}`]
    );
  }

  return {
    meterId,
    previousReadingKwh: lastReadingKwh,
    cumulativeKwh,
    incrementalKwh,
    costCharged,
    balanceBefore,
    balanceAfter,
    powerState: updatedPowerState,
    powerCommand: powerCommandExecuted
  };
}

module.exports = {
  calculateTariffCost,
  processMeterReading
};
