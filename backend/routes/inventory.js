const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = require('../db');
const broadcaster = require('../broadcaster');

const router = express.Router();

// GET all inventory
router.get('/', authMiddleware, (req, res) => {
  try {
    const data = db.prepare('SELECT * FROM inventory ORDER BY id DESC').all();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST new item
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, category, stock_in, stock_out, unit, price, alert } = req.body;
    if (!name) return res.status(400).json({ error: 'Name is required' });

    const stmt = db.prepare(`
      INSERT INTO inventory (name, category, stock_in, stock_out, unit, price, alert)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(name, category || '', stock_in || 0, stock_out || 0, unit || '', price || 0, alert || '');
    
    res.json({ id: info.lastInsertRowid, success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT update item
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const id = req.params.id;
    const { name, category, stock_in, stock_out, unit, price, alert } = req.body;
    
    const stmt = db.prepare(`
      UPDATE inventory 
      SET name=?, category=?, stock_in=?, stock_out=?, unit=?, price=?, alert=?, updated_at=strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE id=?
    `);
    stmt.run(name, category, stock_in, stock_out, unit, price, alert, id);
    
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE item
router.delete('/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM inventory WHERE id = ?').run(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
