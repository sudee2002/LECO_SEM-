const assert = require('assert');
const { createUsagePredictor, aggregateDailyConsumption, simulateWalletLifetime } = require('../services/predictionService');

console.log('====================================================');
console.log('Running Wallet Lifetime Estimator Unit Tests...');
console.log('====================================================');

// 1. Test Aggregation & Predictor Rules
const sampleReadings = [
  { created_at: '2026-09-01T10:00:00Z', incremental_kwh: 4.0 },
  { created_at: '2026-09-02T10:00:00Z', incremental_kwh: 5.0 },
  { created_at: '2026-09-03T10:00:00Z', incremental_kwh: 6.0 },
  { created_at: '2026-09-04T10:00:00Z', incremental_kwh: 5.0 },
  { created_at: '2026-09-05T10:00:00Z', incremental_kwh: 4.0 },
  { created_at: '2026-09-06T10:00:00Z', incremental_kwh: 5.0 },
  { created_at: '2026-09-07T10:00:00Z', incremental_kwh: 6.0 }
];

const dailyHistory = aggregateDailyConsumption(sampleReadings);
assert.strictEqual(dailyHistory.length, 7, 'Expected 7 daily buckets');

const predictor = createUsagePredictor(dailyHistory);
assert.strictEqual(predictor.confidence, 'MEDIUM', '7 days should give MEDIUM confidence');
assert.strictEqual(predictor.averageDailyUsageKwh, 5.0, 'Average daily usage should be 5.0 kWh/day');

console.log('✅ Aggregator & Predictor weighted average test passed');

// 2. Test Wallet Lifetime Day-by-Day Simulation
async function testSimulator() {
  const mockPredictor = {
    predict: () => 5.0 // 5.0 kWh per day constant prediction
  };

  // Balance: LKR 1640.00
  // Current cycle kWh: 0, current charged: 0
  // Group A: 0-30 @ 5, 31-60 @ 9. Fixed charge: 80 (0-30), 210 (31-60).
  // Day 1: 5 kWh -> Bill: 5 * 5 + 80 = LKR 105. Balance: 1640 - 105 = 1535
  // Day 6: 30 kWh -> Bill: 30 * 5 + 80 = LKR 230. Balance: 1640 - 230 = 1410
  // Day 12: 60 kWh -> Bill: 30 * 5 + 30 * 9 + 210 = LKR 630. Balance: 1640 - 630 = 1010
  // Day 13: 65 kWh (Group B transition!) -> Bill: 60 * 14 + 5 * 20 + 400 = 840 + 100 + 400 = 1340. Balance: 1640 - 1340 = 300
  // Day 16: 80 kWh (Group B) -> Bill: 60 * 14 + 20 * 20 + 400 = 840 + 400 + 400 = 1640. Balance: 1640 - 1640 = 0. Total = 16 days!

  const startBalance = 1640.0;
  const startDate = '2026-09-10';

  const normalDays = await simulateWalletLifetime(startBalance, 0, 0, startDate, mockPredictor, 1.0);
  const lowUsageDays = await simulateWalletLifetime(startBalance, 0, 0, startDate, mockPredictor, 0.85);
  const highUsageDays = await simulateWalletLifetime(startBalance, 0, 0, startDate, mockPredictor, 1.15);

  console.log(`Simulation Results for LKR ${startBalance} (5 kWh/day):`);
  console.log(`  Low Usage (0.85x)    : ${lowUsageDays} days`);
  console.log(`  Normal Usage (1.00x) : ${normalDays} days`);
  console.log(`  High Usage (1.15x)   : ${highUsageDays} days`);

  assert.ok(highUsageDays <= normalDays, 'High usage scenario days must be <= normal days');
  assert.ok(normalDays <= lowUsageDays, 'Normal days must be <= low usage (max) days');
  assert.strictEqual(Math.round(normalDays), 16, 'Expected ~16 days for LKR 1,640 at 5 kWh/day');

  console.log('✅ Day-by-Day tariff simulation & scenario ordering test passed');

  // 3. Test Billing Cycle Reset Simulation
  // Start on 28th of month with 2 days left before 1st of next month reset
  const resetStartDate = '2026-09-28';
  const daysAcrossReset = await simulateWalletLifetime(2000.0, 50.0, 500.0, resetStartDate, mockPredictor, 1.0);
  assert.ok(daysAcrossReset > 10, 'Simulation across billing cycle reset completed successfully');
  console.log(`✅ Billing cycle reset simulation test passed (Days: ${daysAcrossReset})`);

  console.log('====================================================');
  console.log('All Wallet Lifetime Estimator tests passed! 🎉');
  console.log('====================================================');
}

testSimulator().catch((err) => {
  console.error('❌ Estimator test failed:', err);
  process.exit(1);
});
