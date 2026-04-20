/**
 * fix-db.js — Jalankan SEKALI di server untuk memperbaiki database.
 * Perintah: node fix-db.js
 */
require('dotenv').config();
const Database = require('better-sqlite3');
const path = require('path');
const config = require('./config');

const db = new Database(path.resolve(config.dbPath));
db.pragma('journal_mode = WAL');

console.log('=== RT/RW NET Billing — DB Fix Script ===');
console.log('Database path:', path.resolve(config.dbPath));
console.log('');

// Fungsi helper: Tambahkan kolom jika belum ada
function addColumnIfMissing(table, column, definition) {
  try {
    db.prepare(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`).run();
    console.log(`[OK] Kolom '${column}' berhasil ditambahkan ke tabel '${table}'.`);
  } catch (e) {
    if (e.message.includes('duplicate column name')) {
      console.log(`[--] Kolom '${column}' sudah ada di tabel '${table}', dilewati.`);
    } else {
      console.error(`[!!] Gagal menambahkan '${column}' ke '${table}':`, e.message);
    }
  }
}

// ----- Fix tabel tickets -----
addColumnIfMissing('tickets', 'created_at', `TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))`);
addColumnIfMissing('tickets', 'updated_at', `TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))`);

// Isi nilai created_at dan updated_at untuk baris yang masih NULL
const ticketsFixed = db.prepare(`UPDATE tickets SET created_at = date, updated_at = date WHERE created_at IS NULL`).run();
console.log(`[OK] ${ticketsFixed.changes} baris di tabel 'tickets' diperbarui (created_at/updated_at).`);

// ----- Fix tabel customers -----
addColumnIfMissing('customers', 'mikrotik_profile', `TEXT`);

// ----- Verifikasi tabel digital_transactions -----
try {
  const count = db.prepare('SELECT COUNT(*) as c FROM digital_transactions').get();
  console.log(`[OK] Tabel 'digital_transactions' ditemukan, ${count.c} data.`);
} catch(e) {
  console.log('[!!] Tabel digital_transactions belum ada, membuat sekarang...');
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
  console.log('[OK] Tabel digital_transactions berhasil dibuat.');
}

// ----- Verifikasi tabel settings -----
try {
  db.prepare('SELECT COUNT(*) as c FROM settings').get();
  console.log(`[OK] Tabel 'settings' ditemukan.`);
} catch(e) {
  db.exec(`CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT, updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now')))`);
  console.log('[OK] Tabel settings berhasil dibuat.');
}

console.log('');
console.log('=== Database repair selesai! ===');
console.log('Silakan restart Node.js Anda (pm2 restart all / node server.js).');
db.close();
