const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = require('../db');
const broadcaster = require('../broadcaster');
const router = express.Router();

// ============================================================
// GET semua tiket
// ============================================================
router.get('/', authMiddleware, (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM tickets ORDER BY id DESC').all());
  } catch (err) {
    console.error('>>> ERROR GET /tickets:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST — Buat tiket baru
// ============================================================
router.post('/', authMiddleware, (req, res) => {
  try {
    const { date, customer, issue, priority, status, handler } = req.body;
    const stmt = db.prepare('INSERT INTO tickets (date, customer, issue, priority, status, handler) VALUES (?, ?, ?, ?, ?, ?)');
    const info = stmt.run(
      date || new Date().toISOString().slice(0, 10),
      customer || '',
      issue || '',
      priority || 'Medium',
      status || 'Open',
      handler || ''
    );
    res.json({ id: info.lastInsertRowid, success: true });
  } catch (err) {
    console.error('>>> ERROR POST /tickets:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// Helper: Auto-tambahkan kolom yang mungkin belum ada di DB server
// ============================================================
function ensureTicketColumns() {
  const cols = db.prepare('PRAGMA table_info(tickets)').all().map(c => c.name);
  if (!cols.includes('updated_at')) {
    try {
      db.prepare(`ALTER TABLE tickets ADD COLUMN updated_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))`).run();
      db.prepare(`UPDATE tickets SET updated_at = date WHERE updated_at IS NULL`).run();
      console.log('[DB] Kolom updated_at ditambahkan ke tabel tickets.');
    } catch (e) {}
  }
  if (!cols.includes('created_at')) {
    try {
      db.prepare(`ALTER TABLE tickets ADD COLUMN created_at TEXT DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))`).run();
      db.prepare(`UPDATE tickets SET created_at = date WHERE created_at IS NULL`).run();
      console.log('[DB] Kolom created_at ditambahkan ke tabel tickets.');
    } catch (e) {}
  }
}

// ============================================================
// POST /process/:id — Tandai tiket sebagai "In Progress"
// Dipanggil dari tombol "Tandai Proses" (status: Open → In Progress)
// ============================================================
router.post('/process/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan.' });
    if (ticket.status === 'In Progress' || ticket.status === 'Done') {
      return res.status(400).json({ error: `Tiket sudah berstatus "${ticket.status}".` });
    }

    ensureTicketColumns();
    db.prepare(`UPDATE tickets SET status = 'In Progress', updated_at = ? WHERE id = ?`)
      .run(new Date().toISOString(), id);

    console.log(`[Tickets] Tiket #${id}: ${ticket.status} → In Progress`);
    res.json({ success: true, id: Number(id), newStatus: 'In Progress' });
  } catch (err) {
    console.error('>>> ERROR POST /tickets/process/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// POST /resolve/:id — Selesaikan tiket (In Progress → Done)
// ============================================================
router.post('/resolve/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const ticket = db.prepare('SELECT * FROM tickets WHERE id = ?').get(id);
    if (!ticket) return res.status(404).json({ error: 'Tiket tidak ditemukan.' });
    if (ticket.status === 'Done') {
      return res.status(400).json({ error: 'Tiket sudah selesai.' });
    }

    ensureTicketColumns();

    // Open langsung → Done jika sudah di-resolve langsung
    const newStatus = 'Done';
    db.prepare(`UPDATE tickets SET status = ?, updated_at = ? WHERE id = ?`)
      .run(newStatus, new Date().toISOString(), id);

    console.log(`[Tickets] Tiket #${id}: ${ticket.status} → Done`);
    res.json({ success: true, id: Number(id), newStatus });
  } catch (err) {
    console.error('>>> ERROR POST /tickets/resolve/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// PUT /:id — Update tiket lengkap (kompatibel semua versi DB)
// ============================================================
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const { date, customer, issue, priority, status, handler } = req.body;
    const cols = db.prepare('PRAGMA table_info(tickets)').all().map(c => c.name);
    if (cols.includes('updated_at')) {
      db.prepare('UPDATE tickets SET date=?, customer=?, issue=?, priority=?, status=?, handler=?, updated_at=strftime("%Y-%m-%dT%H:%M:%SZ","now") WHERE id=?')
        .run(date ?? null, customer ?? null, issue ?? null, priority ?? null, status ?? null, handler ?? null, req.params.id);
    } else {
      db.prepare('UPDATE tickets SET date=?, customer=?, issue=?, priority=?, status=?, handler=? WHERE id=?')
        .run(date ?? null, customer ?? null, issue ?? null, priority ?? null, status ?? null, handler ?? null, req.params.id);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('>>> ERROR PUT /tickets/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// DELETE /:id
// ============================================================
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM tickets WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error('>>> ERROR DELETE /tickets/:id:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================
// GET /avg-response-time — Rata-rata waktu respons
// ============================================================
router.get('/avg-response-time', authMiddleware, (req, res) => {
  try {
    const cols = db.prepare('PRAGMA table_info(tickets)').all().map(c => c.name);
    if (!cols.includes('updated_at') || !cols.includes('created_at')) {
      return res.json({ avg_hours: 0 });
    }
    const row = db.prepare(`
      SELECT AVG((julianday(updated_at) - julianday(created_at)) * 24) as avg_hours
      FROM tickets
      WHERE status = 'Done' AND updated_at IS NOT NULL AND created_at IS NOT NULL AND updated_at != created_at
    `).get();
    const hours = Math.round((row.avg_hours || 0) * 10) / 10;
    res.json({ avg_hours: hours });
  } catch (err) {
    console.error('>>> ERROR GET /tickets/avg-response-time:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
