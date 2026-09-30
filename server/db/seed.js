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

  // 4. Insert Sri Lankan Tiered Block Tariffs
  const tariffs = [
    { min: 0, max: 30, rate: 8.0, fixed: 150.0 },
    { min: 31, max: 60, rate: 15.0, fixed: 300.0 },
    { min: 61, max: 90, rate: 22.0, fixed: 400.0 },
    { min: 91, max: 180, rate: 35.0, fixed: 1000.0 },
    { min: 181, max: 99999, rate: 50.0, fixed: 1500.0 }
  ];

  for (const t of tariffs) {
    await dbQuery.run(
      `INSERT INTO tariffs (category, min_kwh, max_kwh, rate_per_kwh, fixed_charge_monthly) VALUES (?, ?, ?, ?, ?)`,
      ['DOMESTIC', t.min, t.max, t.rate, t.fixed]
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
