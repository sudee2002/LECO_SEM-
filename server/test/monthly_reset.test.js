const assert = require('assert');
const { initSchema, resetDBFile, dbQuery } = require('../db/database');
const { processMeterReading } = require('../services/billingService');

async function testMonthlyCycleReset() {
  console.log('====================================================');
  console.log('Running Monthly Billing Cycle Reset Integration Test');
  console.log('====================================================');

  // Reset & initialize fresh DB schema for clean test run
  resetDBFile();
  await initSchema();

  // Seed user, meter, and wallet
  await dbQuery.run(
    `INSERT INTO users (id, name, email, password_hash, role, account_number) VALUES (1, 'Test Consumer', 'test@leco.lk', 'hash', 'customer', 'ACC-TEST-001')`
  );
  await dbQuery.run(
    `INSERT INTO meters (id, user_id, meter_number, location, status, power_state, last_reading_kwh) VALUES ('MTR-TEST-001', 1, 'MTR-TEST-001', 'Test Location', 'ACTIVE', 'CONNECTED', 0.0)`
  );
  await dbQuery.run(
    `INSERT INTO wallets (id, user_id, current_balance) VALUES (1, 1, 50000.0)`
  );

  // 1. Month 1 (September): Meter accumulates 200 kWh total (crossing into Group C >180 kWh)
  console.log('1. Processing Month 1 (September) Telemetry up to 200 kWh...');
  const resSept = await processMeterReading('MTR-TEST-001', 200.0, '2026-09-25T10:00:00Z');
  console.log(`   Sept 25 Reading (200 kWh): Charged LKR ${resSept.costCharged.toFixed(2)}`);
  assert.ok(resSept.costCharged > 0, 'Month 1 charge should be calculated correctly');

  // 2. Month 2 (October): First reading of new month (Oct 1). Meter increases by 5 kWh (200 -> 205 kWh)
  console.log('2. Processing Month 2 (October 1st) First Reading (+5 kWh: 200 -> 205 kWh)...');
  const resOct1 = await processMeterReading('MTR-TEST-001', 205.0, '2026-10-01T10:00:00Z');
  console.log(`   Oct 1 Reading (205 cumulative, 5 kWh for Oct): Charged LKR ${resOct1.costCharged.toFixed(2)}`);

  // Expected charge for 5 kWh in Group A starting from 0 kWh in October:
  // 5 kWh * LKR 5.00 + LKR 80.00 (Group A fixed charge) = LKR 105.00
  // (Before our fix, it charged 5 kWh * LKR 100.00 = LKR 500.00 or >LKR 2000 under Group C!)
  assert.strictEqual(
    resOct1.costCharged,
    105.0,
    `Expected LKR 105.00 (Group A 0-60 kWh tier), but got LKR ${resOct1.costCharged}`
  );

  console.log('✅ Month 2 reset test passed: Calculated 5 kWh starting from 0 kWh in Group A tier!');

  // 3. Month 2 (October 2nd): Second reading (+5 kWh: 205 -> 210 kWh)
  console.log('3. Processing Month 2 (October 2nd) Second Reading (+5 kWh: 205 -> 210 kWh)...');
  const resOct2 = await processMeterReading('MTR-TEST-001', 210.0, '2026-10-02T10:00:00Z');
  console.log(`   Oct 2 Reading (210 cumulative, 10 kWh for Oct): Charged LKR ${resOct2.costCharged.toFixed(2)}`);

  // Expected incremental charge for 5 kWh (5 -> 10 kWh) in Group A: 5 * LKR 5.00 = LKR 25.00
  assert.strictEqual(
    resOct2.costCharged,
    25.0,
    `Expected LKR 25.00 for subsequent Group A reading, but got LKR ${resOct2.costCharged}`
  );

  console.log('✅ Month 2 incremental test passed: Charged LKR 25.00 for 5 kWh incremental in Group A!');
  console.log('====================================================');
  console.log('All Monthly Billing Cycle Reset Integration Tests Passed! 🎉');
  console.log('====================================================');
}

testMonthlyCycleReset().catch((err) => {
  console.error('❌ Monthly reset test failed:', err);
  process.exit(1);
});
