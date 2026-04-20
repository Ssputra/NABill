const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = require('../db');
const broadcaster = require('../broadcaster');
const router = express.Router();

// GET Payment Config
router.get('/config', authMiddleware, (req, res) => {
  try {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('payment_config');
    const config = row ? JSON.parse(row.value) : {};
    res.json(config);
  } catch (err) {
    console.error(">>> ERROR GET /config:", err);
    res.status(500).json({ error: err.message });
  }
});

// POST Payment Config
router.post('/config', authMiddleware, (req, res) => {
  try {
    const configString = JSON.stringify(req.body);
    const stmt = db.prepare(`
      INSERT INTO settings (key, value, updated_at) 
      VALUES ('payment_config', ?, datetime('now'))
      ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=datetime('now')
    `);
    stmt.run(configString);
    broadcaster.broadcast('payment', 'update', {});
    res.json({ success: true });
  } catch (err) {
    console.error(">>> ERROR POST /config:", err);
    res.status(500).json({ error: err.message });
  }
});

// GET Payment History
router.get('/history', authMiddleware, (req, res) => {
  try {
    const history = db.prepare('SELECT * FROM digital_transactions ORDER BY id DESC LIMIT 10').all();
    res.json(history);
  } catch (err) {
    console.error(">>> ERROR GET /history:", err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
