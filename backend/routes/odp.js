const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = require('../db');
const broadcaster = require('../broadcaster');
const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM odp_infrastructures ORDER BY id DESC').all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, type, location, total_ports, used_ports, status, lat, lng } = req.body;
    const stmt = db.prepare('INSERT INTO odp_infrastructures (name, type, location, total_ports, used_ports, status, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(name, type||'', location||'', total_ports||0, used_ports||0, status||'Normal', lat||'', lng||'');
    res.json({ id: info.lastInsertRowid, success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authMiddleware, (req, res) => {
  try {
    const { name, type, location, total_ports, used_ports, status, lat, lng } = req.body;
    // Defensive: gunakan nilai fallback agar tidak ada undefined yang masuk ke SQLite
    const stmt = db.prepare(
      'UPDATE odp_infrastructures SET name=?, type=?, location=?, total_ports=?, used_ports=?, status=?, lat=?, lng=? WHERE id=?'
    );
    stmt.run(
      name || '',
      type || 'ODP',
      location || '',
      parseInt(total_ports) || 0,
      parseInt(used_ports) || 0,
      status || 'Normal',
      lat || '',
      lng || '',
      req.params.id
    );
    // Update updated_at secara terpisah agar tidak crash jika kolom belum ada
    try {
      db.prepare("UPDATE odp_infrastructures SET updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id=?").run(req.params.id);
    } catch(e) { /* kolom mungkin belum ada di DB lama — tidak masalah */ }
    res.json({ success: true });
  } catch (err) {
    console.error('[ODP PUT Error]', err.message);
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM odp_infrastructures WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
