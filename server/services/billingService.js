const { dbQuery } = require('../db/database');

// Default baseline fallback slabs if database has not been seeded yet
const DEFAULT_DOMESTIC_SLABS = [
  { tariff_group: 'DOMESTIC_0_60', group_display_name: 'GROUP A', billing_block: 'Low Consumption', group_min_consumption: 0, group_max_consumption: 60, slab_min: 0, slab_max: 30, energy_rate: 5.00, fixed_charge: 80.00 },
  { tariff_group: 'DOMESTIC_0_60', group_display_name: 'GROUP A', billing_block: 'Low Consumption', group_min_consumption: 0, group_max_consumption: 60, slab_min: 31, slab_max: 60, energy_rate: 9.00, fixed_charge: 210.00 },
  { tariff_group: 'DOMESTIC_61_180', group_display_name: 'GROUP B', billing_block: 'Standard', group_min_consumption: 61, group_max_consumption: 180, slab_min: 0, slab_max: 60, energy_rate: 14.00, fixed_charge: 0.00 },
  { tariff_group: 'DOMESTIC_61_180', group_display_name: 'GROUP B', billing_block: 'Standard', group_min_consumption: 61, group_max_consumption: 180, slab_min: 61, slab_max: 90, energy_rate: 20.00, fixed_charge: 400.00 },
  { tariff_group: 'DOMESTIC_61_180', group_display_name: 'GROUP B', billing_block: 'Standard', group_min_consumption: 61, group_max_consumption: 180, slab_min: 91, slab_max: 120, energy_rate: 28.00, fixed_charge: 1000.00 },
  { tariff_group: 'DOMESTIC_61_180', group_display_name: 'GROUP B', billing_block: 'Standard', group_min_consumption: 61, group_max_consumption: 180, slab_min: 121, slab_max: 180, energy_rate: 44.00, fixed_charge: 1500.00 },
  { tariff_group: 'DOMESTIC_ABOVE_180', group_display_name: 'GROUP C', billing_block: 'High Consumption', group_min_consumption: 181, group_max_consumption: null, slab_min: 0, slab_max: 180, energy_rate: 32.50, fixed_charge: 0.00 },
  { tariff_group: 'DOMESTIC_ABOVE_180', group_display_name: 'GROUP C', billing_block: 'High Consumption', group_min_consumption: 181, group_max_consumption: null, slab_min: 181, slab_max: null, energy_rate: 100.00, fixed_charge: 2500.00 }
];

/**
 * Pure synchronous electricity calculation logic using provided tariff slab objects.
 */
function calculateElectricityCostFromSlabs(consumptionKwh, slabs = DEFAULT_DOMESTIC_SLABS) {
  const consumption = Math.max(0, parseFloat(consumptionKwh) || 0);

  if (!slabs || slabs.length === 0) {
    slabs = DEFAULT_DOMESTIC_SLABS;
  }

  // Normalize slab field access to support snake_case & camelCase
  const normalizedSlabs = slabs.map(s => ({
    id: s.id,
    category: s.category || 'DOMESTIC',
    tariffGroup: s.tariff_group || s.tariffGroup || 'DOMESTIC_0_60',
    groupDisplayName: s.group_display_name || s.groupDisplayName || s.tariff_group || s.tariffGroup || 'GROUP A',
    billingBlock: s.billing_block || s.billingBlock || '',
    groupMinConsumption: s.group_min_consumption !== undefined ? Number(s.group_min_consumption) : (s.groupMinConsumption !== undefined ? Number(s.groupMinConsumption) : 0),
    groupMaxConsumption: s.group_max_consumption !== undefined && s.group_max_consumption !== null ? Number(s.group_max_consumption) : (s.groupMaxConsumption !== undefined && s.groupMaxConsumption !== null ? Number(s.groupMaxConsumption) : null),
    slabMin: s.slab_min !== undefined ? Number(s.slab_min) : (s.slabMin !== undefined ? Number(s.slabMin) : 0),
    slabMax: s.slab_max !== undefined && s.slab_max !== null ? Number(s.slab_max) : (s.slabMax !== undefined && s.slabMax !== null ? Number(s.slabMax) : null),
    energyRate: s.energy_rate !== undefined ? Number(s.energy_rate) : (s.energyRate !== undefined ? Number(s.energyRate) : (s.rate_per_kwh !== undefined ? Number(s.rate_per_kwh) : 0)),
    fixedCharge: s.fixed_charge !== undefined ? Number(s.fixed_charge) : (s.fixedCharge !== undefined ? Number(s.fixedCharge) : (s.fixed_charge_monthly !== undefined ? Number(s.fixed_charge_monthly) : 0))
  }));

  // Identify unique tariff groups in configuration
  const uniqueGroups = Array.from(new Set(normalizedSlabs.map(s => s.tariffGroup)));

  // Determine which group applies based on consumption
  let selectedGroup = null;
  for (const g of uniqueGroups) {
    const groupSlabs = normalizedSlabs.filter(s => s.tariffGroup === g);
    const minC = Math.min(...groupSlabs.map(s => s.groupMinConsumption));
    const maxVals = groupSlabs.map(s => s.groupMaxConsumption);
    const hasNullMax = maxVals.includes(null);
    const maxC = hasNullMax ? Infinity : Math.max(...maxVals.map(v => Number(v)));

    if (consumption >= minC && consumption <= maxC) {
      selectedGroup = g;
      break;
    }
  }

  // Fallback if no exact range match
  if (!selectedGroup) {
    if (consumption > 180) {
      selectedGroup = uniqueGroups.find(g => g.includes('180') || g.includes('ABOVE') || g.includes('C')) || uniqueGroups[uniqueGroups.length - 1];
    } else if (consumption > 60) {
      selectedGroup = uniqueGroups.find(g => g.includes('61') || g.includes('B')) || uniqueGroups[1] || uniqueGroups[0];
    } else {
      selectedGroup = uniqueGroups[0];
    }
  }

  // Filter slabs for selected tariff group and sort by slabMin ASC
  const groupSlabs = normalizedSlabs
    .filter(s => s.tariffGroup === selectedGroup)
    .sort((a, b) => a.slabMin - b.slabMin);

  // Compute energy charge breakdown
  const breakdown = [];
  let totalEnergyCharge = 0;

  for (const slab of groupSlabs) {
    const slabMin = slab.slabMin;
    const slabMax = slab.slabMax;
    const blockStart = slabMin > 0 ? slabMin - 1 : 0;
    const slabCapacity = slabMax !== null ? (slabMax - blockStart) : Infinity;

    const unitsInSlab = Math.max(0, Math.min(consumption - blockStart, slabCapacity));

    if (unitsInSlab > 0) {
      const amount = parseFloat((unitsInSlab * slab.energyRate).toFixed(2));
      totalEnergyCharge += amount;

      const rangeLabel = slabMax !== null ? `${slabMin}-${slabMax}` : `>${blockStart}`;

      breakdown.push({
        range: rangeLabel,
        units: parseFloat(unitsInSlab.toFixed(2)),
        rate: slab.energyRate,
        amount
      });
    }
  }

  // Determine fixed charge based on total consumption within selected group
  let matchingFixedSlab = groupSlabs.find(s => {
    const sMin = s.slabMin;
    const sMax = s.slabMax !== null ? s.slabMax : Infinity;
    return consumption >= sMin && consumption <= sMax;
  });

  if (!matchingFixedSlab) {
    if (consumption === 0) {
      matchingFixedSlab = groupSlabs[0];
    } else {
      matchingFixedSlab = groupSlabs[groupSlabs.length - 1];
    }
  }

  const fixedCharge = matchingFixedSlab ? parseFloat(Number(matchingFixedSlab.fixedCharge).toFixed(2)) : 0.0;
  const energyCharge = parseFloat(totalEnergyCharge.toFixed(2));
  const totalCharge = parseFloat((energyCharge + fixedCharge).toFixed(2));

  return {
    consumption,
    tariffGroup: selectedGroup,
    groupDisplayName: groupSlabs[0]?.groupDisplayName || selectedGroup,
    energyCharge,
    fixedCharge,
    totalCharge,
    breakdown
  };
}

/**
 * Main reusable async calculation service for the platform.
 * calculateElectricityCost(consumptionKwh, tariffCategory, billingDate)
 */
async function calculateElectricityCost(consumptionKwh, tariffCategory = 'DOMESTIC', billingDate = null) {
  let query = 'SELECT * FROM tariffs WHERE category = ? AND is_active = 1';
  const params = [tariffCategory];

  if (billingDate) {
    query += ' AND (effective_from <= ? OR effective_from IS NULL) AND (effective_to IS NULL OR effective_to >= ?)';
    params.push(billingDate, billingDate);
  }

  query += ' ORDER BY slab_min ASC';

  let slabs = [];
  try {
    slabs = await dbQuery.all(query, params);
  } catch (err) {
    console.error('Error fetching tariffs for calculation:', err);
  }

  if (!slabs || slabs.length === 0) {
    slabs = DEFAULT_DOMESTIC_SLABS;
  }

  return calculateElectricityCostFromSlabs(consumptionKwh, slabs);
}

/**
 * Calculates incremental tariff cost for a meter reading pulse.
 */
async function calculateTariffCost(incrementalKwh, currentTotalKwh) {
  if (incrementalKwh <= 0) return 0.0;
  const prevTotal = Math.max(0, currentTotalKwh - incrementalKwh);
  const prevBill = await calculateElectricityCost(prevTotal);
  const currentBill = await calculateElectricityCost(currentTotalKwh);
  
  const incrementalCost = Math.max(0, currentBill.totalCharge - prevBill.totalCharge);
  return parseFloat(incrementalCost.toFixed(2));
}

/**
 * Process new incoming meter reading.
 * Daily telemetry accumulates kWh & incremental charges in meter_readings without deducting daily wallet balance.
 * When the month cycle ends (crossover to a new calendar month), the total monthly balance/cost for the completed month
 * is deducted from the wallet balance in a single cycle settlement transaction.
 */
async function processMeterReading(meterId, cumulativeKwh, customTimestamp = null) {
  const meter = await dbQuery.get('SELECT * FROM meters WHERE id = ?', [meterId]);
  if (!meter) {
    throw new Error(`Meter '${meterId}' not found.`);
  }

  const lastReadingKwh = meter.last_reading_kwh || 0.0;
  const incrementalKwh = Math.max(0, parseFloat((cumulativeKwh - lastReadingKwh).toFixed(3)));
  const readingTimestamp = customTimestamp || new Date().toISOString();

  // Determine monthly billing cycle start for the reading date (1st of month at 00:00:00)
  const readingDate = new Date(readingTimestamp);
  const monthStart = new Date(readingDate.getFullYear(), readingDate.getMonth(), 1).toISOString();
  const currentMonthKey = `${readingDate.getFullYear()}-${String(readingDate.getMonth() + 1).padStart(2, '0')}`;

  // Check for month cycle crossover (settle completed previous month if unbilled)
  const lastReading = await dbQuery.get(
    'SELECT created_at FROM meter_readings WHERE meter_id = ? AND created_at < ? ORDER BY created_at DESC LIMIT 1',
    [meterId, readingTimestamp]
  );

  let settlementOccurred = false;
  let settledAmount = 0.0;

  if (lastReading && lastReading.created_at) {
    const prevDate = new Date(lastReading.created_at);
    const prevMonthKey = `${prevDate.getFullYear()}-${String(prevDate.getMonth() + 1).padStart(2, '0')}`;

    if (prevMonthKey !== currentMonthKey) {
      // Check if previous month cycle was already settled
      const existingSettlement = await dbQuery.get(
        'SELECT id FROM wallet_transactions WHERE user_id = ? AND reference = ?',
        [meter.user_id, `MONTHLY-SETTLEMENT-${prevMonthKey}`]
      );

      if (!existingSettlement) {
        // Calculate total consumption for the completed month cycle
        const prevMonthReadings = await dbQuery.all(
          "SELECT incremental_kwh FROM meter_readings WHERE meter_id = ? AND strftime('%Y-%m', created_at) = ?",
          [meterId, prevMonthKey]
        );

        const prevMonthTotalKwh = prevMonthReadings.reduce((sum, r) => sum + (r.incremental_kwh || 0), 0);
        const prevCostObj = await calculateElectricityCost(prevMonthTotalKwh);
        settledAmount = prevCostObj ? prevCostObj.totalCharge : 0.0;

        if (settledAmount > 0) {
          const walletToSettle = await dbQuery.get('SELECT * FROM wallets WHERE user_id = ?', [meter.user_id]);
          if (walletToSettle) {
            const balBefore = walletToSettle.current_balance;
            const balAfter = parseFloat((balBefore - settledAmount).toFixed(2));

            await dbQuery.run(
              'UPDATE wallets SET current_balance = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
              [balAfter, walletToSettle.id]
            );

            await dbQuery.run(
              'INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_before, balance_after, reference, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
              [walletToSettle.id, meter.user_id, 'CONSUMPTION', -settledAmount, balBefore, balAfter, `MONTHLY-SETTLEMENT-${prevMonthKey}`, readingTimestamp]
            );

            settlementOccurred = true;

            if (balAfter <= 0 && meter.power_state === 'CONNECTED') {
              await dbQuery.run("UPDATE meters SET power_state = 'DISCONNECTED' WHERE id = ?", [meterId]);
              const cmdId = 'CMD-DISC-' + Date.now();
              await dbQuery.run(
                'INSERT INTO power_commands (command_id, meter_id, user_id, action, reason, status) VALUES (?, ?, ?, ?, ?, ?)',
                [cmdId, meterId, meter.user_id, 'DISCONNECT', `Monthly Cycle Settlement Cutoff: Balance exhausted (LKR ${balAfter.toFixed(2)})`, 'EXECUTED']
              );
              await dbQuery.run(
                'INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)',
                [meter.user_id, 'system', 'POWER_DISCONNECTED', `Meter ${meterId} disconnected upon monthly cycle settlement (${prevMonthKey}). Balance: LKR ${balAfter.toFixed(2)}`]
              );
            }
          }
        }
      }
    }
  }

  // Fetch previous readings in the same calendar month for incremental cost calculation
  const monthReadings = await dbQuery.all(
    'SELECT incremental_kwh FROM meter_readings WHERE meter_id = ? AND created_at >= ? AND created_at <= ?',
    [meterId, monthStart, readingTimestamp]
  );

  const monthKwhBefore = parseFloat(
    monthReadings.reduce((sum, r) => sum + (r.incremental_kwh || 0), 0).toFixed(3)
  );
  const monthKwhAfter = parseFloat((monthKwhBefore + incrementalKwh).toFixed(3));

  const prevCostObj = await calculateElectricityCost(monthKwhBefore);
  const newCostObj = await calculateElectricityCost(monthKwhAfter);

  let costCharged = 0.0;
  if (monthKwhBefore === 0 && monthKwhAfter > 0) {
    costCharged = newCostObj.totalCharge;
  } else {
    costCharged = Math.max(0, parseFloat((newCostObj.totalCharge - prevCostObj.totalCharge).toFixed(2)));
  }

  // Save reading entry
  await dbQuery.run(
    `INSERT INTO meter_readings (meter_id, cumulative_kwh, incremental_kwh, cost_charged, created_at) VALUES (?, ?, ?, ?, ?)`,
    [meterId, cumulativeKwh, incrementalKwh, costCharged, readingTimestamp]
  );

  await dbQuery.run(
    `UPDATE meters SET last_reading_kwh = ?, last_reading_at = ? WHERE id = ?`,
    [cumulativeKwh, readingTimestamp, meterId]
  );

  // 14-Day Deficit Disconnection Logic:
  // Disconnect power relay if wallet balance is less than the accumulated monthly usage cost for 14 consecutive days.
  const totalMonthCostObj = await calculateElectricityCost(monthKwhAfter);
  const presentMonthCostLkr = totalMonthCostObj ? totalMonthCostObj.totalCharge : 0.0;
  const currentWallet = await dbQuery.get('SELECT * FROM wallets WHERE user_id = ?', [meter.user_id]);
  const walletBalance = currentWallet ? currentWallet.current_balance : 0.0;

  const activeMeter = await dbQuery.get('SELECT * FROM meters WHERE id = ?', [meterId]);
  let deficitSince = activeMeter.deficit_since;

  if (walletBalance < presentMonthCostLkr) {
    if (!deficitSince) {
      deficitSince = readingTimestamp;
      await dbQuery.run('UPDATE meters SET deficit_since = ? WHERE id = ?', [readingTimestamp, meterId]);
    }

    const deficitStartTime = new Date(deficitSince).getTime();
    const currentReadingTime = new Date(readingTimestamp).getTime();
    const daysInDeficit = (currentReadingTime - deficitStartTime) / (1000 * 60 * 60 * 24);

    if (daysInDeficit >= 14 && activeMeter.power_state === 'CONNECTED') {
      await dbQuery.run("UPDATE meters SET power_state = 'DISCONNECTED' WHERE id = ?", [meterId]);
      const cmdId = 'CMD-DISC-DEFICIT-' + Date.now();
      await dbQuery.run(
        'INSERT INTO power_commands (command_id, meter_id, user_id, action, reason, status) VALUES (?, ?, ?, ?, ?, ?)',
        [
          cmdId,
          meterId,
          meter.user_id,
          'DISCONNECT',
          `Automatic 14-day deficit cutoff: Monthly usage (LKR ${presentMonthCostLkr.toFixed(2)}) exceeded wallet balance (LKR ${walletBalance.toFixed(2)}) for 14 days`,
          'EXECUTED'
        ]
      );
      await dbQuery.run(
        'INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)',
        [
          meter.user_id,
          'system',
          'POWER_DISCONNECTED',
          `Meter ${meterId} disconnected after 14-day deficit (Usage: LKR ${presentMonthCostLkr.toFixed(2)} vs Balance: LKR ${walletBalance.toFixed(2)}).`
        ]
      );
    }
  } else {
    if (deficitSince) {
      await dbQuery.run('UPDATE meters SET deficit_since = NULL WHERE id = ?', [meterId]);
      deficitSince = null;
    }
    if (activeMeter.power_state === 'DISCONNECTED' && walletBalance > 0) {
      await dbQuery.run("UPDATE meters SET power_state = 'CONNECTED' WHERE id = ?", [meterId]);
    }
  }

  // Fetch current wallet & power state
  const updatedWallet = await dbQuery.get('SELECT * FROM wallets WHERE user_id = ?', [meter.user_id]);
  const currentBalance = updatedWallet ? updatedWallet.current_balance : 0.0;
  const finalPowerState = (await dbQuery.get('SELECT power_state FROM meters WHERE id = ?', [meterId]))?.power_state || meter.power_state;

  return {
    meterId,
    previousReadingKwh: lastReadingKwh,
    cumulativeKwh,
    incrementalKwh,
    costCharged,
    balanceBefore: currentBalance,
    balanceAfter: currentBalance,
    settlementOccurred,
    settledAmount,
    powerState: finalPowerState
  };
}

/**
 * Pure calculation of total kWh usage for the present month from reading records.
 */
function calculatePresentMonthKwhFromReadings(readings) {
  if (!readings || readings.length === 0) return 0.0;

  const sorted = [...readings].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  const latestReading = sorted[sorted.length - 1];
  const refDate = latestReading && latestReading.created_at ? new Date(latestReading.created_at) : new Date();
  const year = refDate.getFullYear();
  const month = refDate.getMonth();

  const presentMonthReadings = sorted.filter(r => {
    if (!r.created_at) return false;
    const d = new Date(r.created_at);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const totalKwh = presentMonthReadings.reduce((sum, r) => sum + (Number(r.incremental_kwh) || 0), 0);
  return parseFloat(totalKwh.toFixed(2));
}

/**
 * Fetch total present month kWh usage for a meter from DB.
 */
async function getPresentMonthKwh(meterId) {
  if (!meterId) return 0.0;
  const readings = await dbQuery.all(
    'SELECT incremental_kwh, created_at FROM meter_readings WHERE meter_id = ? ORDER BY created_at ASC',
    [meterId]
  );
  return calculatePresentMonthKwhFromReadings(readings);
}

module.exports = {
  calculateElectricityCostFromSlabs,
  calculateElectricityCost,
  calculateTariffCost,
  processMeterReading,
  calculatePresentMonthKwhFromReadings,
  getPresentMonthKwh
};

