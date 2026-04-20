'use strict';

const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = require('../db');
const evo = require('../services/evolutionApi');
const router = express.Router();

// ── Pastikan tabel wa_history ada ─────────────────────────────────────────────
try {
  db.exec(`
    CREATE TABLE IF NOT EXISTS wa_history (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      subject         TEXT NOT NULL,
      target          TEXT,
      recipient_count INTEGER NOT NULL DEFAULT 0,
      sent_count      INTEGER NOT NULL DEFAULT 0,
      failed_count    INTEGER NOT NULL DEFAULT 0,
      status          TEXT NOT NULL DEFAULT 'Terkirim',
      message         TEXT,
      created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    )
  `);
  // Migrasi: tambah kolom baru jika tabel lama sudah ada
  try { db.prepare('ALTER TABLE wa_history ADD COLUMN sent_count INTEGER NOT NULL DEFAULT 0').run(); } catch(_) {}
  try { db.prepare('ALTER TABLE wa_history ADD COLUMN failed_count INTEGER NOT NULL DEFAULT 0').run(); } catch(_) {}
} catch(e) {}

// ── DB helper settings ────────────────────────────────────────────────────────
function getWaSetting(key, fallback = '') {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key=?").get(key);
    return row ? row.value : fallback;
  } catch(_) { return fallback; }
}
function setWaSetting(key, value) {
  db.prepare(
    "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')"
  ).run(key, String(value == null ? '' : value));
}

// =============================================================================
// GET /api/whatsapp/settings
// =============================================================================
router.get('/settings', authMiddleware, (req, res) => {
  try {
    res.json({
      // Evolution API config
      evo_base_url:      getWaSetting('evo_base_url'),
      evo_instance_name: getWaSetting('evo_instance_name'),
      evo_api_key:       getWaSetting('evo_api_key'),
      evo_delay_min:     getWaSetting('evo_delay_min',  '2000'),
      evo_delay_max:     getWaSetting('evo_delay_max',  '5000'),
      evo_use_typing:    getWaSetting('evo_use_typing', '1'),
      // Notifikasi otomatis toggles
      auto_h3:           getWaSetting('wa_auto_h3',      '1'),
      auto_lunas:        getWaSetting('wa_auto_lunas',   '1'),
      auto_suspend:      getWaSetting('wa_auto_suspend', '0'),
      auto_baru:         getWaSetting('wa_auto_baru',    '1'),
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// =============================================================================
// POST /api/whatsapp/settings
// =============================================================================
router.post('/settings', authMiddleware, (req, res) => {
  try {
    const {
      evo_base_url, evo_instance_name, evo_api_key,
      evo_delay_min, evo_delay_max, evo_use_typing,
      auto_h3, auto_lunas, auto_suspend, auto_baru,
    } = req.body;

    if (evo_base_url      !== undefined) setWaSetting('evo_base_url',      evo_base_url.trim());
    if (evo_instance_name !== undefined) setWaSetting('evo_instance_name', evo_instance_name.trim());
    if (evo_api_key       !== undefined) setWaSetting('evo_api_key',       evo_api_key.trim());
    if (evo_delay_min     !== undefined) setWaSetting('evo_delay_min',     evo_delay_min);
    if (evo_delay_max     !== undefined) setWaSetting('evo_delay_max',     evo_delay_max);
    if (evo_use_typing    !== undefined) setWaSetting('evo_use_typing',    evo_use_typing ? '1' : '0');

    if (auto_h3      !== undefined) setWaSetting('wa_auto_h3',      auto_h3      ? '1' : '0');
    if (auto_lunas   !== undefined) setWaSetting('wa_auto_lunas',   auto_lunas   ? '1' : '0');
    if (auto_suspend !== undefined) setWaSetting('wa_auto_suspend', auto_suspend ? '1' : '0');
    if (auto_baru    !== undefined) setWaSetting('wa_auto_baru',    auto_baru    ? '1' : '0');

    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// =============================================================================
// GET /api/whatsapp/history
// =============================================================================
router.get('/history', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare(
      'SELECT * FROM wa_history ORDER BY created_at DESC LIMIT 10'
    ).all();
    res.json(rows);
  } catch(err) { res.status(500).json({ error: err.message }); }
});

// =============================================================================
// GET /api/whatsapp/test-connection — Cek koneksi ke Evolution API
// =============================================================================
router.get('/test-connection', authMiddleware, async (req, res) => {
  try {
    const cfg = evo.getConfig();
    if (!cfg.baseUrl || !cfg.instanceName || !cfg.apiKey) {
      return res.status(400).json({ error: 'Konfigurasi Evolution API belum lengkap.' });
    }

    const r = await fetch(`${cfg.baseUrl}/instance/fetchInstances`, {
      headers: { 'apikey': cfg.apiKey },
    });
    const data = await r.json().catch(() => ({}));

    if (!r.ok) {
      return res.status(502).json({ error: 'Koneksi ke Evolution API gagal: ' + (data.message || r.status) });
    }

    // Cari instance kita di daftar
    const instances = Array.isArray(data) ? data : (data.instances || []);
    const myInstance = instances.find(i => i.name === cfg.instanceName || i.instance?.instanceName === cfg.instanceName);

    res.json({
      ok: true,
      instance: myInstance
        ? { name: cfg.instanceName, status: myInstance.instance?.state || myInstance.state || 'unknown' }
        : { name: cfg.instanceName, status: 'not_found' },
      total_instances: instances.length,
    });
  } catch(err) {
    res.status(502).json({ error: 'Tidak dapat terhubung ke Evolution API: ' + err.message });
  }
});

// =============================================================================
// POST /api/whatsapp/send-blast — Kirim blast ke banyak penerima
// =============================================================================
router.post('/send-blast', authMiddleware, async (req, res) => {
  const { message, target, custom_numbers } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ error: 'Isi pesan tidak boleh kosong.' });
  }

  // ── Kumpulkan penerima dari DB ────────────────────────────────────────────
  let recipients = []; // [ { phone, data: { nama, tagihan, tgl, ... } } ]
  let subjectLabel = 'Blast Manual';

  try {
    if (target === 'all') {
      const rows = db.prepare(
        "SELECT name, phone, price, due_date FROM customers WHERE phone IS NOT NULL AND phone != '' AND status != 'Terminated'"
      ).all();
      recipients = rows.map(r => ({
        phone: r.phone,
        data:  { nama: r.name, tagihan: Number(r.price || 0).toLocaleString('id-ID'), tgl: r.due_date || '-' },
      }));
      subjectLabel = 'Blast Semua Pelanggan';

    } else if (target === 'due') {
      const today = new Date().toISOString().slice(0, 10);
      const rows = db.prepare(
        "SELECT name, phone, price, due_date FROM customers WHERE phone IS NOT NULL AND phone != '' AND status='Aktif' AND due_date <= ?"
      ).all(today);
      recipients = rows.map(r => ({
        phone: r.phone,
        data:  { nama: r.name, tagihan: Number(r.price || 0).toLocaleString('id-ID'), tgl: r.due_date },
      }));
      subjectLabel = 'Blast Jatuh Tempo';

    } else if (target === 'suspend') {
      const rows = db.prepare(
        "SELECT name, phone, price, due_date FROM customers WHERE phone IS NOT NULL AND phone != '' AND status='Suspend'"
      ).all();
      recipients = rows.map(r => ({
        phone: r.phone,
        data:  { nama: r.name, tagihan: Number(r.price || 0).toLocaleString('id-ID'), tgl: r.due_date || '-' },
      }));
      subjectLabel = 'Blast Pelanggan Suspend';

    } else if (target === 'custom') {
      const nums = (custom_numbers || '').split(',').map(n => n.trim()).filter(Boolean);
      recipients = nums.map(phone => ({ phone, data: {} }));
      subjectLabel = 'Blast Nomor Tertentu';
    }
  } catch(err) {
    return res.status(500).json({ error: 'Gagal mengambil data penerima: ' + err.message });
  }

  if (recipients.length === 0) {
    db.prepare("INSERT INTO wa_history (subject, target, recipient_count, sent_count, failed_count, status, message) VALUES (?,?,?,?,?,?,?)")
      .run(subjectLabel, target, 0, 0, 0, 'Gagal', message.slice(0, 200));
    return res.status(400).json({ error: 'Tidak ada penerima yang memenuhi kriteria target.' });
  }

  // ── Langsung balas HTTP 202 — proses queue di background ─────────────────
  res.json({
    accepted: true,
    recipient_count: recipients.length,
    message: `Antrian blast dimulai untuk ${recipients.length} penerima. Status akan tersimpan di Riwayat Blast.`,
  });

  // ── Jalankan queue di background (non-blocking) ───────────────────────────
  setImmediate(async () => {
    let sentCount = 0, failedCount = 0;
    try {
      const result = await evo.sendBlastQueue(recipients, message, {
        onProgress: (idx, total, res) => {
          if (res.ok) sentCount++; else failedCount++;
          console.log(`[Blast] ${idx}/${total} — ${res.ok ? '✓' : '✗'}`);
        },
      });
      sentCount   = result.sent;
      failedCount = result.failed;
    } catch(err) {
      console.error('[Blast] Queue error:', err.message);
      failedCount = recipients.length;
    }

    const finalStatus = failedCount === 0 ? 'Terkirim'
      : sentCount === 0 ? 'Gagal' : 'Parsial';

    db.prepare(
      "INSERT INTO wa_history (subject, target, recipient_count, sent_count, failed_count, status, message) VALUES (?,?,?,?,?,?,?)"
    ).run(subjectLabel, target, recipients.length, sentCount, failedCount, finalStatus, message.slice(0, 200));

    console.log(`[Blast] Selesai: ${sentCount} terkirim, ${failedCount} gagal — Status: ${finalStatus}`);
  });
});

module.exports = router;
