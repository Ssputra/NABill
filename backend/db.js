const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const config = require('./config');
const bcrypt = require('bcryptjs');

// Pastikan folder data/ ada
const dbDir = path.dirname(path.resolve(config.dbPath));
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(path.resolve(config.dbPath));

// Aktifkan WAL mode untuk performa lebih baik
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================================
// SCHEMA MIGRATION
// ============================================================
function migrate() {
  const createTables = db.transaction(() => {
    // ----- USERS -----
    db.exec(`
      CREATE TABLE IF NOT EXISTS users (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        username   TEXT NOT NULL UNIQUE,
        password   TEXT NOT NULL,
        name       TEXT NOT NULL,
        role       TEXT NOT NULL DEFAULT 'kasir', -- admin | kasir | teknisi
        is_active  INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);

    // ----- CUSTOMERS -----
    db.exec(`
      CREATE TABLE IF NOT EXISTS customers (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        name            TEXT NOT NULL,
        address         TEXT,
        phone           TEXT,
        email           TEXT,
        paket           TEXT NOT NULL,
        price           INTEGER NOT NULL DEFAULT 0,
        status          TEXT NOT NULL DEFAULT 'Aktif', -- Aktif | Suspend | Terminated
        due_date        TEXT,
        pppoe_username  TEXT,
        pppoe_password  TEXT,
        mikrotik_host   TEXT,
        notes           TEXT,
        created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);

    // Migration: Add mikrotik_profile helper column to remember original profiles during suspend
    try {
      db.prepare('ALTER TABLE customers ADD COLUMN mikrotik_profile TEXT').run();
    } catch(err) {}

    // Migration: tambahkan kolom koordinat peta jika belum ada
    try { db.prepare('ALTER TABLE customers ADD COLUMN latitude REAL').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE customers ADD COLUMN longitude REAL').run(); } catch(e) {}

    // Migration: Add created_at and updated_at to tickets if missing
    try { db.prepare('ALTER TABLE tickets ADD COLUMN created_at TEXT NOT NULL DEFAULT (strftime("%Y-%m-%dT%H:%M:%SZ","now"))').run(); } catch(err) {}
    try { db.prepare('ALTER TABLE tickets ADD COLUMN updated_at TEXT NOT NULL DEFAULT (strftime("%Y-%m-%dT%H:%M:%SZ","now"))').run(); } catch(err) {}

    // Migration: Add missing columns to odp_infrastructures if table existed before schema was updated
    try { db.prepare('ALTER TABLE odp_infrastructures ADD COLUMN lat TEXT DEFAULT ""').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE odp_infrastructures ADD COLUMN lng TEXT DEFAULT ""').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE odp_infrastructures ADD COLUMN status TEXT DEFAULT "Normal"').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE odp_infrastructures ADD COLUMN updated_at TEXT NOT NULL DEFAULT (strftime("%Y-%m-%dT%H:%M:%SZ","now"))').run(); } catch(e) {}
    try { db.prepare('ALTER TABLE odp_infrastructures ADD COLUMN created_at TEXT NOT NULL DEFAULT (strftime("%Y-%m-%dT%H:%M:%SZ","now"))').run(); } catch(e) {}
    // ----- TRANSACTIONS -----
    db.exec(`
      CREATE TABLE IF NOT EXISTS transactions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_id   INTEGER REFERENCES customers(id) ON DELETE SET NULL,
        customer_name TEXT NOT NULL,
        paket         TEXT NOT NULL,
        amount        INTEGER NOT NULL DEFAULT 0,
        method        TEXT NOT NULL DEFAULT 'Tunai', -- Tunai | Transfer Bank | OVO | GoPay | DANA | QRIS
        status        TEXT NOT NULL DEFAULT 'Lunas', -- Lunas | Pending | Batal
        period_month  INTEGER,
        period_year   INTEGER,
        notes         TEXT,
        kasir_id      INTEGER REFERENCES users(id) ON DELETE SET NULL,
        kasir_name    TEXT,
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);

    // ----- MIKROTIK DEVICES -----
    db.exec(`
      CREATE TABLE IF NOT EXISTS mikrotik_devices (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        host        TEXT NOT NULL,
        port        INTEGER NOT NULL DEFAULT 8728,
        username    TEXT NOT NULL,
        password    TEXT NOT NULL,
        is_active   INTEGER NOT NULL DEFAULT 1,
        last_seen   TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);

    // ----- SETTINGS -----
    db.exec(`
      CREATE TABLE IF NOT EXISTS settings (
        key        TEXT PRIMARY KEY,
        value      TEXT,
        updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);

    // ----- INDEXES -----
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);
      CREATE INDEX IF NOT EXISTS idx_transactions_created ON transactions(created_at);
      CREATE INDEX IF NOT EXISTS idx_transactions_customer ON transactions(customer_id);
      CREATE INDEX IF NOT EXISTS idx_transactions_period ON transactions(period_year, period_month);
    `);

    // ----- INVENTORY -----
    db.exec(`
      CREATE TABLE IF NOT EXISTS inventory (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        category    TEXT,
        stock_in    INTEGER NOT NULL DEFAULT 0,
        stock_out   INTEGER NOT NULL DEFAULT 0,
        unit        TEXT,
        price       INTEGER NOT NULL DEFAULT 0,
        alert       TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);

    // ----- CASHIER DEPOSITS -----
    db.exec(`
      CREATE TABLE IF NOT EXISTS cashier_deposits (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        date        TEXT NOT NULL,
        cashier     TEXT NOT NULL,
        amount      INTEGER NOT NULL DEFAULT 0,
        method      TEXT,
        status      TEXT DEFAULT 'belum', -- setor | belum
        notes       TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);

    // ----- RESELLERS -----
    db.exec(`
      CREATE TABLE IF NOT EXISTS resellers (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        phone       TEXT,
        area        TEXT,
        email       TEXT,
        customers   INTEGER NOT NULL DEFAULT 0,
        commission  INTEGER NOT NULL DEFAULT 0,
        rating      INTEGER NOT NULL DEFAULT 4,
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);

    // ----- AGENTS -----
    db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        phone       TEXT,
        area        TEXT,
        type        TEXT,  -- Pemasang | Teknisi | Sales
        commission  INTEGER NOT NULL DEFAULT 0,
        active      INTEGER NOT NULL DEFAULT 1,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);

    // ----- ODP INFRASTRUCTURES -----
    db.exec(`
      CREATE TABLE IF NOT EXISTS odp_infrastructures (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        name        TEXT NOT NULL,
        type        TEXT, -- ODC | ODP
        location    TEXT,
        total_ports INTEGER NOT NULL DEFAULT 0,
        used_ports  INTEGER NOT NULL DEFAULT 0,
        status      TEXT DEFAULT 'Normal',
        lat         TEXT,
        lng         TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);

    // ----- TICKETS (CS PORTAL) -----
    db.exec(`
      CREATE TABLE IF NOT EXISTS tickets (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        date        TEXT NOT NULL,
        customer    TEXT NOT NULL,
        issue       TEXT,
        priority    TEXT DEFAULT 'Medium',
        status      TEXT DEFAULT 'Open',
        handler     TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);

    // ----- LEDGERS (BOOKKEEPING) -----
    db.exec(`
      CREATE TABLE IF NOT EXISTS ledgers (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        date        TEXT NOT NULL,
        description TEXT NOT NULL,
        category    TEXT,
        type        TEXT, -- Pemasukan | Pengeluaran
        amount      INTEGER NOT NULL DEFAULT 0,
        status      TEXT DEFAULT 'Selesai',
        ref_id      TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);

    // ----- DIGITAL TRANSACTIONS (PAYMENT GATEWAY) -----
    db.exec(`
      CREATE TABLE IF NOT EXISTS digital_transactions (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        customer_name TEXT NOT NULL,
        method        TEXT NOT NULL,
        amount        INTEGER NOT NULL DEFAULT 0,
        status        TEXT DEFAULT 'Success',
        created_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);

    // ----- ATTENDANCE -----
    db.exec(`
      CREATE TABLE IF NOT EXISTS attendance (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        date        TEXT NOT NULL,
        employee    TEXT NOT NULL,
        role        TEXT,
        clock_in    TEXT,
        clock_out   TEXT,
        status      TEXT DEFAULT 'hadir', -- hadir | izin | sakit | alpha
        location    TEXT,
        created_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')),
        updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
      )
    `);
  });

  createTables();
  console.log('[DB] Tables migrated successfully.');
  seedInitialData();
}

// ============================================================
// SEED DATA (hanya jalankan sekali jika DB kosong)
// ============================================================
function seedInitialData() {
  const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get().c;
  if (userCount > 0) return;

  console.log('[DB] Seeding initial data...');

  // Admin default
  const adminPass = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123';
  const hash = bcrypt.hashSync(adminPass, 10);
  db.prepare(`
    INSERT INTO users (username, password, name, role)
    VALUES ('admin', ?, 'Administrator', 'admin')
  `).run(hash);

  // Kasir default
  const kasirPass = process.env.DEFAULT_KASIR_PASSWORD || 'kasir123';
  const hashKasir = bcrypt.hashSync(kasirPass, 10);
  db.prepare(`
    INSERT INTO users (username, password, name, role)
    VALUES ('kasir', ?, 'Kasir Utama', 'kasir')
  `).run(hashKasir);

  // Teknisi default
  const teknisiPass = process.env.DEFAULT_TEKNISI_PASSWORD || 'teknisi123';
  const hashTeknisi = bcrypt.hashSync(teknisiPass, 10);
  db.prepare(`
    INSERT INTO users (username, password, name, role)
    VALUES ('teknisi', ?, 'Teknisi Lapangan', 'teknisi')
  `).run(hashTeknisi);



  // Default settings
  const insertSetting = db.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)`);
  // Tab Umum
  insertSetting.run('app_name',   'RT/RW NET Billing');
  insertSetting.run('isp_name',   'RT/RW NET - Billing Mandiri');
  insertSetting.run('owner_name', 'Admin Utama');
  insertSetting.run('phone',      '0812-3456-7890');
  insertSetting.run('email',      'admin@rtrwnet.id');
  insertSetting.run('address',    'Jl. Merdeka No. 1, RT 01 RW 01, Kec. Sukamaju');
  // Tab MikroTik
  insertSetting.run('mt_default_port', '8728');
  insertSetting.run('mt_default_user', 'admin');
  insertSetting.run('mt_timeout',      '10');
  insertSetting.run('mt_interval',     '30');
  // Tab Billing
  insertSetting.run('bill_date',        '1');
  insertSetting.run('grace_days',       '7');
  insertSetting.run('late_fee',         '0');
  insertSetting.run('currency',         'IDR');
  insertSetting.run('invoice_template', 'Pembayaran tagihan internet bulan {bulan} — {nama_paket}');
  insertSetting.run('monthly_target',   '22000000');
  // Tab Notifikasi
  insertSetting.run('n_wa_due',       '1');
  insertSetting.run('n_auto_suspend', '0');
  insertSetting.run('n_wa_new',       '1');
  insertSetting.run('n_daily_report', '0');
  insertSetting.run('n_router_alert', '1');
  // Tab Sistem
  insertSetting.run('app_url',  'http://localhost:3000');
  insertSetting.run('timezone', 'Asia/Jakarta');
  insertSetting.run('wa_number', '');

  // Seed Mock Data
  const insertInventory = db.prepare(`INSERT INTO inventory (name, category, stock_in, stock_out, unit, price, alert) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insertInventory.run('Kabel UTP Cat.6', 'Kabel', 500, 320, 'Meter', 5000, 'Low Stock');
  insertInventory.run('RJ-45 Connector', 'Aksesoris', 300, 280, 'Pcs', 1500, 'Low Stock');
  insertInventory.run('ODP 8 Port', 'Perangkat', 10, 8, 'Unit', 450000, 'Low Stock');
  insertInventory.run('Patch Panel 24 Port', 'Perangkat', 5, 3, 'Unit', 850000, '');

  const insertDeposit = db.prepare(`INSERT INTO cashier_deposits (date, cashier, amount, method, status, notes) VALUES (?, ?, ?, ?, ?, ?)`);
  let todayStr = new Date().toISOString().slice(0, 10);
  insertDeposit.run(todayStr, 'Kasir Utama', 2850000, 'Tunai', 'setor', 'Setoran harian');
  insertDeposit.run(todayStr, 'Kasir 2', 750000, 'Tunai', 'belum', 'Belum sempat setor');

  const insertReseller = db.prepare(`INSERT INTO resellers (name, phone, area, email, customers, commission, rating, active) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  insertReseller.run('Pak Budi Reseller', '0812-1111-2222', 'Wilayah Barat RT01-03', 'budi@gmail.com', 14, 50000, 5, 1);
  insertReseller.run('Ibu Sari Mitra', '0813-3333-4444', 'Wilayah Timur RT04-06', 'sari@gmail.com', 9, 50000, 4, 1);

  const insertAgent = db.prepare(`INSERT INTO agents (name, phone, area, type, commission, active) VALUES (?, ?, ?, ?, ?, ?)`);
  insertAgent.run('Agus Pemasang', '0812-5555-1111', 'Area Utara', 'Pemasang', 75000, 1);

  const insertOdp = db.prepare(`INSERT INTO odp_infrastructures (name, type, location, total_ports, used_ports, status, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
  insertOdp.run('ODC-Pusat', 'ODC', 'Kantor Utama RT01', 144, 82, 'Normal', '-6.200000', '106.816666');
  insertOdp.run('ODP-Utara-01', 'ODP', 'Tiang Listrik RT02/05', 8, 8, 'Penuh', '-6.201000', '106.817000');

  const insertTicket = db.prepare(`INSERT INTO tickets (date, customer, issue, priority, status, handler) VALUES (?, ?, ?, ?, ?, ?)`);
  insertTicket.run(todayStr, 'Budi Santoso', 'Internet mati sejak pagi', 'High', 'Open', '');
  insertTicket.run(todayStr, 'Ahmad', 'Router restart sendiri', 'Medium', 'In Progress', 'Teknisi A');

  const insertLedger = db.prepare(`INSERT INTO ledgers (date, description, category, type, amount, status, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insertLedger.run(todayStr, 'Pembayaran Tagihan - Budi (April)', 'Tagihan Internet', 'Pemasukan', 150000, 'Selesai', 'TRX-101');
  insertLedger.run(todayStr, 'Beli Kabel UTP', 'Operasional', 'Pengeluaran', 500000, 'Selesai', 'EXP-201');

  // Seed Payment Gateway History
  const insertDigitalParam = db.prepare(`INSERT INTO digital_transactions (customer_name, method, amount, status, created_at) VALUES (?, ?, ?, ?, datetime('now', ?))`);
  insertDigitalParam.run('Budi Santoso', 'Transfer BCA', 200000, 'Success', '-1 days');
  insertDigitalParam.run('Siti Aminah', 'GoPay', 150000, 'Success', '-2 days');
  insertDigitalParam.run('Ahmad Fauzi', 'QRIS', 200000, 'Pending', '-3 days');
  insertDigitalParam.run('Andi Prasetyo', 'Transfer BRI', 175000, 'Success', '-4 days');
  insertDigitalParam.run('Dewi Rahayu', 'GoPay', 200000, 'Failed', '-5 days');

  const insertAbsen = db.prepare(`INSERT INTO attendance (date, employee, role, clock_in, clock_out, status, location) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  insertAbsen.run(todayStr, 'Budi Santoso', 'Teknisi', '08:00', '17:00', 'hadir', 'Kantor Utama');
  insertAbsen.run(todayStr, 'Agus Setiawan', 'Admin', '08:15', '', 'hadir', 'Kantor Utama');

  console.log('[DB] Seed data inserted successfully.');
  console.log('[DB] Default accounts seeded from environment variables.');
}

// Jalankan migrasi saat modul di-load
migrate();

module.exports = db;
