const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = require('../db');
const broadcaster = require('../broadcaster');
const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM attendance ORDER BY date DESC, id DESC').all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authMiddleware, (req, res) => {
  try {
    const { date, employee, role, clock_in, clock_out, status, location } = req.body;
    const stmt = db.prepare('INSERT INTO attendance (date, employee, role, clock_in, clock_out, status, location) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(date||new Date().toISOString().slice(0,10), employee||'', role||'', clock_in||'', clock_out||'', status||'hadir', location||'');
    broadcaster.broadcast('attendance', 'create', { id: info.lastInsertRowid });
    res.json({ id: info.lastInsertRowid, success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authMiddleware, (req, res) => {
  try {
    const { date, employee, role, clock_in, clock_out, status, location } = req.body;
    const stmt = db.prepare('UPDATE attendance SET date=?, employee=?, role=?, clock_in=?, clock_out=?, status=?, location=?, updated_at=strftime("%Y-%m-%dT%H:%M:%SZ","now") WHERE id=?');
    stmt.run(date, employee, role, clock_in, clock_out, status, location, req.params.id);
    broadcaster.broadcast('attendance', 'update', { id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM attendance WHERE id=?').run(req.params.id);
    broadcaster.broadcast('attendance', 'delete', { id: req.params.id });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
