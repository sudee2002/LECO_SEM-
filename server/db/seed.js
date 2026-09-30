const bcrypt = require('bcryptjs');
const { dbQuery, initSchema, resetDBFile } = require('./database');

async function seedDatabase() {
  console.log('Resetting SQLite file...');
  resetDBFile();

  console.log('Initializing SQLite database schema...');
  await initSchema();

  console.log('Seeding fresh initial data...');

  // 1. Hash default passwords
  const passwordHash = await bcrypt.hash('Password123!', 10);

  // 2. Insert Users
  const adminResult = await dbQuery.run(
    `INSERT INTO users (name, email, password_hash, role, account_number) VALUES (?, ?, ?, ?, ?)`,
    ['LECO System Admin', 'admin@leco.lk', passwordHash, 'admin', 'ADM-0001']
  );
  const adminId = adminResult.lastID;

  const customer1Result = await dbQuery.run(
    `INSERT INTO users (name, email, password_hash, role, account_number) VALUES (?, ?, ?, ?, ?)`,
    ['Sunil Perera (Consumer)', 'consumer@leco.lk', passwordHash, 'customer', 'LEC-789012']
  );
  const customer1Id = customer1Result.lastID;

  console.log(`Created Users with IDs: Admin=${adminId}, Customer1=${customer1Id}`);

  // 3. Insert Meters
  await dbQuery.run(
    `INSERT INTO meters (id, user_id, meter_number, location, status, power_state, last_reading_kwh) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    ['MTR-1001', customer1Id, 'MTR-1001-COL', 'No. 45, Galle Road, Colombo 03', 'ACTIVE', 'CONNECTED', 142.5]
  );

  // 4. Insert Sri Lankan Tariff Version and Grouped Structure
  const versionRes = await dbQuery.run(
    `INSERT INTO tariff_versions (version_name, category, effective_from, status) VALUES (?, ?, ?, ?)`,
    ['Domestic Tariff – May 2026', 'DOMESTIC', '2026-05-11 00:00:00', 'ACTIVE']
  );
  const versionId = versionRes.lastID;

  const tariffSlabs = [
    // Group A — Monthly consumption 0–60 kWh
    {
      group: 'DOMESTIC_0_60',
      displayName: 'GROUP A',
      block: 'Low Consumption',
      groupMin: 0,
      groupMax: 60,
      slabMin: 0,
      slabMax: 30,
      rate: 5.00,
      fixed: 80.00
    },
    {
      group: 'DOMESTIC_0_60',
      displayName: 'GROUP A',
      block: 'Low Consumption',
      groupMin: 0,
      groupMax: 60,
      slabMin: 31,
      slabMax: 60,
      rate: 9.00,
      fixed: 210.00
    },
    // Group B — Monthly consumption 61–180 kWh
    {
      group: 'DOMESTIC_61_180',
      displayName: 'GROUP B',
      block: 'Standard',
      groupMin: 61,
      groupMax: 180,
      slabMin: 0,
      slabMax: 60,
      rate: 14.00,
      fixed: 0.00
    },
    {
      group: 'DOMESTIC_61_180',
      displayName: 'GROUP B',
      block: 'Standard',
      groupMin: 61,
      groupMax: 180,
      slabMin: 61,
      slabMax: 90,
      rate: 20.00,
      fixed: 400.00
    },
    {
      group: 'DOMESTIC_61_180',
      displayName: 'GROUP B',
      block: 'Standard',
      groupMin: 61,
      groupMax: 180,
      slabMin: 91,
      slabMax: 120,
      rate: 28.00,
      fixed: 1000.00
    },
    {
      group: 'DOMESTIC_61_180',
      displayName: 'GROUP B',
      block: 'Standard',
      groupMin: 61,
      groupMax: 180,
      slabMin: 121,
      slabMax: 180,
      rate: 44.00,
      fixed: 1500.00
    },
    // Group C — Monthly consumption above 180 kWh
    {
      group: 'DOMESTIC_ABOVE_180',
      displayName: 'GROUP C',
      block: 'High Consumption',
      groupMin: 181,
      groupMax: null,
      slabMin: 0,
      slabMax: 180,
      rate: 32.50,
      fixed: 0.00
    },
    {
      group: 'DOMESTIC_ABOVE_180',
      displayName: 'GROUP C',
      block: 'High Consumption',
      groupMin: 181,
      groupMax: null,
      slabMin: 181,
      slabMax: null,
      rate: 100.00,
      fixed: 2500.00
    }
  ];

  for (const t of tariffSlabs) {
    await dbQuery.run(
      `INSERT INTO tariffs (version_id, category, tariff_group, group_display_name, billing_block, group_min_consumption, group_max_consumption, slab_min, slab_max, energy_rate, fixed_charge, effective_from, is_active) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [versionId, 'DOMESTIC', t.group, t.displayName, t.block, t.groupMin, t.groupMax, t.slabMin, t.slabMax, t.rate, t.fixed, '2026-05-11 00:00:00', 1]
    );
  }

  // 5. Insert Wallets
  const w1 = await dbQuery.run(
    `INSERT INTO wallets (user_id, current_balance) VALUES (?, ?)`,
    [customer1Id, 2500.0]
  );
  const wallet1Id = w1.lastID;

  // 6. Insert Initial Wallet Transactions
  await dbQuery.run(
    `INSERT INTO wallet_transactions (wallet_id, user_id, type, amount, balance_before, balance_after, reference) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [wallet1Id, customer1Id, 'TOPUP', 2500.0, 0.0, 2500.0, 'PAYHERE-INIT-001']
  );

  // 7. Insert Sample Historical Meter Readings
  const baseDate = new Date();
  for (let i = 7; i >= 1; i--) {
    const readingDate = new Date(baseDate.getTime() - i * 24 * 60 * 60 * 1000).toISOString();
    const kwh1 = 142.5 - i * 4.2;
    await dbQuery.run(
      `INSERT INTO meter_readings (meter_id, cumulative_kwh, incremental_kwh, cost_charged, created_at) VALUES (?, ?, ?, ?, ?)`,
      ['MTR-1001', kwh1, 4.2, 4.2 * 15.0, readingDate]
    );
  }

  // 8. Audit Log
  await dbQuery.run(
    `INSERT INTO audit_logs (user_id, actor_role, action, details) VALUES (?, ?, ?, ?)`,
    [adminId, 'admin', 'SYSTEM_INIT', 'Database schema initialized and baseline Sri Lankan tariffs seeded.']
  );

  console.log('Database successfully seeded!');
  console.log('----------------------------------------------------');
  console.log('Demo Accounts Created:');
  console.log('1. Admin:    admin@leco.lk    / Password123!');
  console.log('2. Consumer: consumer@leco.lk / Password123! (Balance: LKR 2,500.00, Meter: MTR-1001)');
  console.log('----------------------------------------------------');
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Error seeding database:', err);
      process.exit(1);
    });
}

module.exports = seedDatabase;
