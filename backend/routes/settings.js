/**
 * RT/RW NET Billing — Settings Router
 * Menangani GET dan POST/PUT untuk semua konfigurasi sistem.
 * Menggunakan tabel `settings` dengan format key-value di SQLite.
 */

const express = require('express');
const router  = express.Router();
const db      = require('../db');
const broadcaster = require('../broadcaster');

// ─── Daftar semua key yang diizinkan disimpan ke DB ───────────────────────────
const ALLOWED_KEYS = new Set([
  // Tab Umum
  'isp_name', 'owner_name', 'phone', 'email', 'address',
  // Tab MikroTik Default
  'mt_default_port', 'mt_default_user', 'mt_timeout', 'mt_interval',
  // Tab Billing
  'bill_date', 'grace_days', 'late_fee', 'currency', 'invoice_template',
  'monthly_target',
  // Tab Notifikasi
  'n_wa_due', 'n_auto_suspend', 'n_wa_new', 'n_daily_report', 'n_router_alert',
  // Tab Sistem
  'app_url', 'timezone',
  // Global
  'app_name', 'wa_number',
]);

// ─── Helper: ambil semua settings sebagai object ──────────────────────────────
function getAllSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const obj  = {};
  rows.forEach(r => { obj[r.key] = r.value; });
  return obj;
}

// ─── Helper: upsert satu key ──────────────────────────────────────────────────
const upsert = db.prepare(`
  INSERT INTO settings (key, value, updated_at)
  VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
  ON CONFLICT(key) DO UPDATE SET
    value      = excluded.value,
    updated_at = excluded.updated_at
`);

// ─── GET /api/settings ────────────────────────────────────────────────────────
// Mengembalikan SEMUA settings sebagai satu objek JSON.
router.get('/', (req, res) => {
  try {
    const settings = getAllSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error('[Settings] GET error:', err.message);
    res.status(500).json({ success: false, error: 'Gagal mengambil data settings.' });
  }
});

// ─── GET /api/settings/:key ───────────────────────────────────────────────────
// Mengembalikan satu nilai berdasarkan key.
router.get('/:key', (req, res) => {
  const { key } = req.params;
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
    if (!row) return res.status(404).json({ success: false, error: `Key '${key}' tidak ditemukan.` });
    res.json({ success: true, key, value: row.value });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ─── POST /api/settings ───────────────────────────────────────────────────────
// Body: { key: value, key2: value2, ... }
// Menyimpan banyak key sekaligus dalam satu transaksi.
router.post('/', (req, res) => {
  const payload = req.body;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return res.status(400).json({ success: false, error: 'Body harus berupa JSON object.' });
  }

  const rejected = [];
  const saved    = {};

  try {
    const saveMany = db.transaction((entries) => {
      entries.forEach(([k, v]) => {
        if (!ALLOWED_KEYS.has(k)) { rejected.push(k); return; }
        const value = v === null || v === undefined ? '' : String(v);
        upsert.run(k, value);
        saved[k] = value;
      });
    });

    saveMany(Object.entries(payload));

    // Broadcast perubahan ke klien SSE
    if (Object.keys(saved).length > 0) {
      broadcaster.broadcast('settings', 'update', saved);
    }

    res.json({
      success:  true,
      message:  `${Object.keys(saved).length} pengaturan berhasil disimpan.`,
      saved,
      rejected: rejected.length ? rejected : undefined,
    });
  } catch (err) {
    console.error('[Settings] POST error:', err.message);
    res.status(500).json({ success: false, error: 'Gagal menyimpan settings: ' + err.message });
  }
});

// ─── PUT /api/settings/:key ───────────────────────────────────────────────────
// Body: { value: "..." }
// Update satu key saja.
router.put('/:key', (req, res) => {
  const { key } = req.params;
  const { value } = req.body;

  if (!ALLOWED_KEYS.has(key)) {
    return res.status(400).json({ success: false, error: `Key '${key}' tidak diizinkan.` });
  }

  try {
    upsert.run(key, value === null || value === undefined ? '' : String(value));
    broadcaster.broadcast('settings', 'update', { [key]: value });
    res.json({ success: true, message: `Setting '${key}' berhasil diperbarui.`, key, value });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;
