const { dbQuery } = require('../db/database');
const { calculateTariffCost } = require('./billingService');

/**
 * Predicts how many days the customer's current wallet balance will last based on historical usage.
 * Roadmap Page 10 requirement: Version 1 explainable statistical predictor for Sprint 4.
 */
async function predictRemainingDays(userId) {
  // 1. Fetch user's wallet
  const wallet = await dbQuery.get('SELECT * FROM wallets WHERE user_id = ?', [userId]);
  if (!wallet) {
    throw new Error('Wallet not found for user.');
  }

  const currentBalance = wallet.current_balance;

  // If balance <= 0, 0 days remaining
  if (currentBalance <= 0) {
    return {
      userId,
      currentBalance,
      estimatedDaysRemaining: 0,
      dailyAverageKwh: 0.0,
      estimatedDailyCost: 0.0,
      status: 'EXHAUSTED',
      predictionText: 'Wallet balance exhausted (0 days remaining). Top up to restore power supply.',
      calculatedAt: new Date().toISOString()
    };
  }

  // 2. Fetch user's meter
  const meter = await dbQuery.get('SELECT * FROM meters WHERE user_id = ?', [userId]);
  if (!meter) {
    return {
      userId,
      currentBalance,
      estimatedDaysRemaining: 30,
      dailyAverageKwh: 0.0,
      estimatedDailyCost: 0.0,
      status: 'NO_METER',
      predictionText: 'No meter assigned yet. Balance intact.',
      calculatedAt: new Date().toISOString()
    };
  }

  // 3. Calculate average daily kWh from recent readings
  const readings = await dbQuery.all(
    'SELECT incremental_kwh, created_at FROM meter_readings WHERE meter_id = ? ORDER BY id DESC LIMIT 14',
    [meter.id]
  );

  let dailyAverageKwh = 4.0; // Default baseline assumption (4.0 kWh / day for average household)
  if (readings && readings.length > 0) {
    const totalIncremental = readings.reduce((sum, r) => sum + (r.incremental_kwh || 0), 0);
    const avg = totalIncremental / readings.length;
    if (avg > 0) {
      dailyAverageKwh = parseFloat(avg.toFixed(2));
    }
  }

  // 4. Calculate daily cost using current meter kWh position
  const currentTotalKwh = meter.last_reading_kwh || 100.0;
  const estimatedDailyCost = await calculateTariffCost(dailyAverageKwh, currentTotalKwh + dailyAverageKwh);

  const effectiveDailyCost = Math.max(estimatedDailyCost, 10.0); // Minimum guard against zero division
  const daysRemainingRaw = currentBalance / effectiveDailyCost;
  const estimatedDaysRemaining = Math.max(0, Math.floor(daysRemainingRaw));

  let status = 'HEALTHY';
  if (estimatedDaysRemaining <= 3) {
    status = 'CRITICAL';
  } else if (estimatedDaysRemaining <= 7) {
    status = 'WARNING';
  }

  return {
    userId,
    meterId: meter.id,
    currentBalance: parseFloat(currentBalance.toFixed(2)),
    dailyAverageKwh,
    estimatedDailyCost: parseFloat(effectiveDailyCost.toFixed(2)),
    estimatedDaysRemaining,
    status,
    predictionText: `Estimated remaining: ~${estimatedDaysRemaining} day${estimatedDaysRemaining === 1 ? '' : 's'} based on recent usage of ${dailyAverageKwh} kWh/day.`,
    calculatedAt: new Date().toISOString()
  };
}

module.exports = {
  predictRemainingDays
};
