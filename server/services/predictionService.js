const { dbQuery } = require('../db/database');
const { calculateElectricityCost } = require('./billingService');

/**
 * Aggregates raw meter readings into daily kWh consumption buckets.
 */
function aggregateDailyConsumption(readings) {
  const dailyBuckets = {};

  readings.forEach((r) => {
    if (!r.created_at || r.incremental_kwh === undefined || r.incremental_kwh === null) return;
    const dateKey = new Date(r.created_at).toISOString().split('T')[0];
    dailyBuckets[dateKey] = (dailyBuckets[dateKey] || 0) + Number(r.incremental_kwh);
  });

  return Object.entries(dailyBuckets)
    .map(([date, kwh]) => ({ date, kwh: parseFloat(kwh.toFixed(2)) }))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
}

/**
 * Explainable Usage Predictor (Section 3 of Technical Design Guide)
 * Computes 7/14/30-day weighted averages and day-of-week behavior patterns.
 */
function createUsagePredictor(dailyHistory) {
  const totalDays = dailyHistory.length;

  if (totalDays === 0) {
    return {
      predict: () => 4.0, // Default baseline assumption (4.0 kWh / day for average household)
      averageDailyUsageKwh: 4.0,
      confidence: 'LOW',
      method: 'DEFAULT_BASELINE'
    };
  }

  const kwhList = dailyHistory.map((d) => d.kwh);

  // Helper averages
  const getAvg = (sliceLength) => {
    const slice = kwhList.slice(-sliceLength);
    if (slice.length === 0) return 0;
    return slice.reduce((sum, val) => sum + val, 0) / slice.length;
  };

  const last7 = getAvg(7);
  const last14 = getAvg(14);
  const last30 = getAvg(30);

  let recentAverage = 4.0;
  let confidence = 'LOW';
  let method = 'HISTORICAL_AVERAGE';

  if (totalDays >= 30) {
    recentAverage = 0.50 * last7 + 0.30 * last14 + 0.20 * last30;
    confidence = 'HIGH';
    method = 'WEIGHTED_HISTORICAL_30D';
  } else if (totalDays >= 14) {
    recentAverage = 0.60 * last7 + 0.40 * last14;
    confidence = 'MEDIUM';
    method = 'WEIGHTED_HISTORICAL_14D';
  } else if (totalDays >= 7) {
    recentAverage = last7;
    confidence = 'MEDIUM';
    method = 'HISTORICAL_7D';
  } else {
    recentAverage = getAvg(totalDays);
    confidence = 'LOW';
    method = 'LIMITED_HISTORY';
  }

  recentAverage = Math.max(0.5, parseFloat(recentAverage.toFixed(2)));

  // Day-of-week pattern helper
  const sameWeekdayAverages = {};
  for (let dayOfWeek = 0; dayOfWeek < 7; dayOfWeek++) {
    const matchingDays = dailyHistory.filter((d) => new Date(d.date).getDay() === dayOfWeek);
    if (matchingDays.length > 0) {
      const avg = matchingDays.reduce((sum, d) => sum + d.kwh, 0) / matchingDays.length;
      sameWeekdayAverages[dayOfWeek] = parseFloat(avg.toFixed(2));
    }
  }

  const predict = (targetDate) => {
    const dayOfWeek = new Date(targetDate).getDay();
    const sameWeekday = sameWeekdayAverages[dayOfWeek];

    if (sameWeekday !== undefined && totalDays >= 7) {
      const pred = 0.60 * recentAverage + 0.40 * sameWeekday;
      return Math.max(0.5, parseFloat(pred.toFixed(2)));
    }
    return recentAverage;
  };

  return {
    predict,
    averageDailyUsageKwh: recentAverage,
    confidence,
    method
  };
}

/**
 * Day-by-Day Wallet Lifetime Simulator (Section 5 of Technical Design Guide)
 * Simulates day-by-day wallet depletion using the exact deterministic tariff engine.
 */
async function simulateWalletLifetime(
  initialWalletBalance,
  initialCycleKwh,
  initialCharged,
  startDate,
  predictor,
  usageMultiplier = 1.0,
  tariffCategory = 'DOMESTIC'
) {
  let balance = parseFloat(Number(initialWalletBalance).toFixed(2));
  if (balance <= 0) return 0;

  let cycleKwh = parseFloat(Number(initialCycleKwh).toFixed(2));
  let charged = parseFloat(Number(initialCharged).toFixed(2));
  let currentDate = new Date(startDate);
  let daysCompleted = 0;

  while (balance > 0 && daysCompleted < 365) {
    // Check for monthly billing cycle reset (1st day of month)
    const isNewCycle = currentDate.getDate() === 1 && daysCompleted > 0;
    if (isNewCycle) {
      cycleKwh = 0.0;
      charged = 0.0;
    }

    const dateIso = currentDate.toISOString().split('T')[0];
    const predictedKwh = predictor.predict(currentDate) * usageMultiplier;
    cycleKwh = parseFloat((cycleKwh + predictedKwh).toFixed(2));

    // Ask tariff engine for cumulative liability on simulated date
    const billRes = await calculateElectricityCost(cycleKwh, tariffCategory, dateIso);
    const newLiability = billRes.totalCharge;
    const incrementalDebit = parseFloat(Math.max(0, newLiability - charged).toFixed(2));

    if (incrementalDebit > balance) {
      const fraction = incrementalDebit > 0 ? Math.max(0, Math.min(1, balance / incrementalDebit)) : 0;
      return parseFloat((daysCompleted + fraction).toFixed(1));
    }

    balance = parseFloat((balance - incrementalDebit).toFixed(2));
    charged = newLiability;

    currentDate.setDate(currentDate.getDate() + 1);
    daysCompleted++;
  }

  return daysCompleted;
}

/**
 * Main prediction service endpoint handler.
 * Predicts remaining wallet days under Low (0.85x), Normal (1.00x), and High (1.15x) usage scenarios.
 */
async function predictRemainingDays(userId) {
  // 1. Fetch user's wallet
  const wallet = await dbQuery.get('SELECT * FROM wallets WHERE user_id = ?', [userId]);
  if (!wallet) {
    throw new Error(`Wallet not found for user ID ${userId}`);
  }

  const currentBalance = parseFloat((wallet.current_balance || 0).toFixed(2));

  // If balance <= 0, 0 days remaining
  if (currentBalance <= 0) {
    return {
      userId,
      walletBalance: 0.0,
      estimatedDaysRemaining: 0,
      estimatedMinDays: 0,
      estimatedMaxDays: 0,
      averageDailyUsageKwh: 0.0,
      predictedTomorrowKwh: 0.0,
      billingCycleConsumptionKwh: 0.0,
      predictionConfidence: 'HIGH',
      predictionMethod: 'EXHAUSTED',
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
      walletBalance: currentBalance,
      estimatedDaysRemaining: 30,
      estimatedMinDays: 25,
      estimatedMaxDays: 35,
      averageDailyUsageKwh: 4.0,
      predictedTomorrowKwh: 4.0,
      billingCycleConsumptionKwh: 0.0,
      predictionConfidence: 'LOW',
      predictionMethod: 'DEFAULT_BASELINE',
      status: 'NO_METER',
      predictionText: 'No meter assigned yet. Balance intact.',
      calculatedAt: new Date().toISOString()
    };
  }

  // 3. Fetch historical readings to build daily history
  const readings = await dbQuery.all(
    'SELECT incremental_kwh, created_at FROM meter_readings WHERE meter_id = ? ORDER BY id ASC',
    [meter.id]
  );

  const dailyHistory = aggregateDailyConsumption(readings);
  const predictor = createUsagePredictor(dailyHistory);

  // 4. Determine current billing cycle consumption
  const latestReading = readings && readings.length > 0 ? readings[readings.length - 1] : null;
  const referenceDate = latestReading && latestReading.created_at ? new Date(latestReading.created_at) : new Date();
  const currentMonthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1).toISOString();

  const cycleReadings = await dbQuery.all(
    'SELECT incremental_kwh FROM meter_readings WHERE meter_id = ? AND created_at >= ?',
    [meter.id, currentMonthStart]
  );

  let billingCycleConsumptionKwh = 0.0;
  if (cycleReadings && cycleReadings.length > 0) {
    billingCycleConsumptionKwh = cycleReadings.reduce((sum, r) => sum + (r.incremental_kwh || 0), 0);
  }
  billingCycleConsumptionKwh = parseFloat(billingCycleConsumptionKwh.toFixed(2));

  // Current charged liability for cycle
  const currentBill = await calculateElectricityCost(billingCycleConsumptionKwh, 'DOMESTIC');
  const currentCharged = currentBill.totalCharge;

  const today = referenceDate;
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const predictedTomorrowKwh = predictor.predict(tomorrow);

  // 5. Run Day-by-Day Wallet Simulations across 3 scenarios
  // Normal usage (1.00x)
  const rawNormalDays = await simulateWalletLifetime(
    currentBalance,
    billingCycleConsumptionKwh,
    currentCharged,
    today,
    predictor,
    1.00
  );

  // Low usage (0.85x -> longer lifetime)
  const rawMaxDays = await simulateWalletLifetime(
    currentBalance,
    billingCycleConsumptionKwh,
    currentCharged,
    today,
    predictor,
    0.85
  );

  // High usage (1.15x -> shorter lifetime)
  const rawMinDays = await simulateWalletLifetime(
    currentBalance,
    billingCycleConsumptionKwh,
    currentCharged,
    today,
    predictor,
    1.15
  );

  const estimatedDaysRemaining = Math.max(0, Math.round(rawNormalDays));
  const estimatedMinDays = Math.max(0, Math.floor(rawMinDays));
  const estimatedMaxDays = Math.max(estimatedDaysRemaining, Math.ceil(rawMaxDays));

  let status = 'HEALTHY';
  if (estimatedDaysRemaining <= 3) {
    status = 'CRITICAL';
  } else if (estimatedDaysRemaining <= 7) {
    status = 'WARNING';
  }

  return {
    userId,
    meterId: meter.id,
    walletBalance: currentBalance,
    estimatedDaysRemaining,
    estimatedMinDays,
    estimatedMaxDays,
    averageDailyUsageKwh: predictor.averageDailyUsageKwh,
    predictedTomorrowKwh,
    billingCycleConsumptionKwh,
    predictionConfidence: predictor.confidence,
    predictionMethod: predictor.method,
    status,
    predictionText: `Estimated remaining: ~${estimatedDaysRemaining} day${estimatedDaysRemaining === 1 ? '' : 's'} (Range: ${estimatedMinDays}–${estimatedMaxDays} days) based on recent usage of ${predictor.averageDailyUsageKwh} kWh/day.`,
    calculatedAt: new Date().toISOString()
  };
}

module.exports = {
  aggregateDailyConsumption,
  createUsagePredictor,
  simulateWalletLifetime,
  predictRemainingDays
};
