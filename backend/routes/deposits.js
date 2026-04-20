const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = require('../db');
const broadcaster = require('../broadcaster');

const router = express.Router();

// GET all deposits
router.get('/', authMiddleware, (req, res) => {
  try {
    const data = db.prepare('SELECT * FROM cashier_deposits ORDER BY date DESC, id DESC').all();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new deposit
router.post('/', authMiddleware, (req, res) => {
  try {
    const { date, amount, method, status, notes } = req.body;
    
    // Security: get cashier directly from server-side JWT session
    // ignoring any manual 'cashier' payload submitted by the frontend
    const cashier = req.user.name || 'Unknown';

    if (!amount) return res.status(400).json({ error: 'Amount is required' });

    const stmt = db.prepare(`
      INSERT INTO cashier_deposits (date, cashier, amount, method, status, notes)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(date || new Date().toISOString().slice(0, 10), cashier, amount, method || 'Tunai', status || 'belum', notes || '');
    
    res.json({ id: info.lastInsertRowid, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update deposit status (e.g. konfirmasi)
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const { status } = req.body;
    const stmt = db.prepare(`UPDATE cashier_deposits SET status=?, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=?`);
    stmt.run(status, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE deposit
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM cashier_deposits WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
