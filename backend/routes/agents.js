const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = require('../db');
const broadcaster = require('../broadcaster');
const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM agents ORDER BY id DESC').all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, phone, area, type, commission, active } = req.body;
    const stmt = db.prepare('INSERT INTO agents (name, phone, area, type, commission, active) VALUES (?, ?, ?, ?, ?, ?)');
    const info = stmt.run(name, phone||'', area||'', type||'', commission||0, active===false?0:1);
    res.json({ id: info.lastInsertRowid, success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authMiddleware, (req, res) => {
  try {
    const { name, phone, area, type, commission, active } = req.body;
    const stmt = db.prepare('UPDATE agents SET name=?, phone=?, area=?, type=?, commission=?, active=?, updated_at=strftime("%Y-%m-%dT%H:%M:%SZ","now") WHERE id=?');
    stmt.run(name, phone, area, type, commission, active, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM agents WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
