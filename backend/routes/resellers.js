const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = require('../db');
const broadcaster = require('../broadcaster');

const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  try {
    const data = db.prepare('SELECT * FROM resellers ORDER BY id DESC').all();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, phone, area, email, commission, customers, active, rating } = req.body;
    if (!name) return res.status(400).json({ error: 'Name required' });
    const stmt = db.prepare(`INSERT INTO resellers (name, phone, area, email, commission, customers, active, rating) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`);
    const info = stmt.run(name, phone||'', area||'', email||'', commission||0, customers||0, active===false?0:1, rating||4);
    res.json({ id: info.lastInsertRowid, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', authMiddleware, (req, res) => {
  try {
    const { name, phone, area, email, commission, customers, active, rating } = req.body;
    const stmt = db.prepare(`UPDATE resellers SET name=?, phone=?, area=?, email=?, commission=?, customers=?, active=?, rating=?, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=?`);
    stmt.run(name, phone||'', area||'', email||'', commission||0, customers||0, active===false?0:1, rating||4, req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM resellers WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
