const express = require('express');
const bcrypt  = require('bcryptjs');
const db      = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const broadcaster = require('../broadcaster');

const router = express.Router();

// ---- GET /api/users ---- list all users (no password)
router.get('/', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const users = db.prepare(`
      SELECT id, username, name, role, is_active, created_at, updated_at
      FROM users ORDER BY id ASC
    `).all();
    res.json({ data: users, total: users.length });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- GET /api/users/:id ----
router.get('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const user = db.prepare(
      'SELECT id, username, name, role, is_active, created_at FROM users WHERE id = ?'
    ).get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
    res.json(user);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- POST /api/users ---- create user
router.post('/', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const { username, name, password, role } = req.body;
    if (!username || !name || !password) {
      return res.status(400).json({ error: 'Username, nama, dan password wajib diisi.' });
    }
    const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
    if (existing) return res.status(409).json({ error: 'Username sudah digunakan.' });

    const hashed = bcrypt.hashSync(password, 10);
    const result = db.prepare(`
      INSERT INTO users (username, name, password, role, is_active)
      VALUES (?, ?, ?, ?, 1)
    `).run(username, name, hashed, role || 'kasir');

    broadcaster.broadcast('users', 'create', {});
    res.status(201).json({ id: result.lastInsertRowid, message: 'User berhasil dibuat.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- PUT /api/users/:id ---- update user info
router.put('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const { name, role, is_active } = req.body;
    const user = db.prepare('SELECT id FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });

    db.prepare(`
      UPDATE users SET
        name       = COALESCE(?, name),
        role       = COALESCE(?, role),
        is_active  = COALESCE(?, is_active),
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE id = ?
    `).run(name || null, role || null, is_active !== undefined ? (is_active ? 1 : 0) : null, req.params.id);

    broadcaster.broadcast('users', 'update', { id: req.params.id });
    res.json({ message: 'User berhasil diupdate.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- PUT /api/users/:id/reset-password ----
router.put('/:id/reset-password', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const { password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ error: 'Password minimal 6 karakter.' });
    }
    const hashed = bcrypt.hashSync(password, 10);
    db.prepare(`
      UPDATE users SET password = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?
    `).run(hashed, req.params.id);
    broadcaster.broadcast('users', 'update', { id: req.params.id, action: 'reset-password' });
    res.json({ message: 'Password berhasil direset.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- PUT /api/users/:id/toggle-status ----
router.put('/:id/toggle-status', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const user = db.prepare('SELECT id, is_active FROM users WHERE id = ?').get(req.params.id);
    if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
    // Prevent deactivating own account
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Tidak bisa menonaktifkan akun sendiri.' });
    }
    db.prepare(`
      UPDATE users SET is_active = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?
    `).run(user.is_active ? 0 : 1, req.params.id);
    broadcaster.broadcast('users', 'update', { id: req.params.id, action: 'toggle-status' });
    res.json({ message: user.is_active ? 'User dinonaktifkan.' : 'User diaktifkan.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ---- DELETE /api/users/:id ----
router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    if (parseInt(req.params.id) === req.user.id) {
      return res.status(400).json({ error: 'Tidak bisa menghapus akun sendiri.' });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
    broadcaster.broadcast('users', 'delete', {});
    res.json({ message: 'User berhasil dihapus.' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
