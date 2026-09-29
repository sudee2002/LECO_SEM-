const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(__dirname, 'leco_sem.sqlite');
let dbInstance = null;

async function getDB() {
  if (dbInstance) return dbInstance;

  const SQL = await initSqlJs();
  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    dbInstance = new SQL.Database(fileBuffer);
  } else {
    dbInstance = new SQL.Database();
    saveDB();
  }
  return dbInstance;
}

function saveDB() {
  if (!dbInstance) return;
  const data = dbInstance.export();
  const buffer = Buffer.from(data);
  fs.writeFileSync(dbPath, buffer);
}

function resetDBFile() {
  dbInstance = null;
  if (fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
}

// Helper query runner converting sql.js output arrays to plain JS objects
const dbQuery = {
  get: async (sql, params = []) => {
    const db = await getDB();
    const stmt = db.prepare(sql);
    stmt.bind(params);
    let row = null;
    if (stmt.step()) {
      row = stmt.getAsObject();
    }
    stmt.free();
    return row;
  },

  all: async (sql, params = []) => {
    const db = await getDB();
    const stmt = db.prepare(sql);
    stmt.bind(params);
    const rows = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  },

  run: async (sql, params = []) => {
    const db = await getDB();
    db.run(sql, params);
    const res = db.exec("SELECT last_insert_rowid() AS id;");
    const lastID = (res && res[0] && res[0].values && res[0].values[0]) ? res[0].values[0][0] : 0;
    const changes = db.getRowsModified();
    saveDB();
    return { lastID, changes };
  },

  exec: async (sql) => {
    const db = await getDB();
    db.exec(sql);
    saveDB();
  }
};

const initSchema = async () => {
  const schemaSql = `
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer', 'admin', 'utility_operator')),
      account_number TEXT UNIQUE NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS meters (
      id TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      meter_number TEXT UNIQUE NOT NULL,
      location TEXT NOT NULL,
      status TEXT DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'INACTIVE', 'FAULT')),
      power_state TEXT DEFAULT 'CONNECTED' CHECK(power_state IN ('CONNECTED', 'DISCONNECTED')),
      last_reading_kwh REAL DEFAULT 0.0,
      last_reading_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tariffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT NOT NULL DEFAULT 'DOMESTIC',
      min_kwh REAL NOT NULL,
      max_kwh REAL,
      rate_per_kwh REAL NOT NULL,
      fixed_charge_monthly REAL DEFAULT 0.0,
      effective_from DATETIME DEFAULT CURRENT_TIMESTAMP,
      is_active INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS wallets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER UNIQUE NOT NULL,
      current_balance REAL DEFAULT 0.0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS wallet_transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      wallet_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('TOPUP', 'CONSUMPTION', 'ADJUSTMENT')),
      amount REAL NOT NULL,
      balance_before REAL NOT NULL,
      balance_after REAL NOT NULL,
      reference TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS meter_readings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      meter_id TEXT NOT NULL,
      cumulative_kwh REAL NOT NULL,
      incremental_kwh REAL NOT NULL,
      cost_charged REAL NOT NULL,
      quality_status TEXT DEFAULT 'NORMAL',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meter_id) REFERENCES meters(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      payment_id TEXT UNIQUE NOT NULL,
      user_id INTEGER NOT NULL,
      order_id TEXT UNIQUE NOT NULL,
      amount REAL NOT NULL,
      gateway TEXT DEFAULT 'PayHere Sandbox',
      gateway_txn_id TEXT,
      status TEXT DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'SUCCESS', 'FAILED')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      confirmed_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS power_commands (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      command_id TEXT UNIQUE NOT NULL,
      meter_id TEXT NOT NULL,
      user_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('DISCONNECT', 'RECONNECT')),
      reason TEXT NOT NULL,
      status TEXT DEFAULT 'EXECUTED' CHECK(status IN ('PENDING', 'EXECUTED', 'FAILED')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      acknowledged_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (meter_id) REFERENCES meters(id) ON DELETE CASCADE,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      actor_role TEXT,
      action TEXT NOT NULL,
      details TEXT,
      ip_address TEXT DEFAULT '127.0.0.1',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `;

  await dbQuery.exec(schemaSql);
};

module.exports = {
  dbQuery,
  initSchema,
  resetDBFile
};
