const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db');
const config = require('../config');
const { authMiddleware } = require('../middleware/auth');

const router = express.Router();

// Cookie options — HTTP-Only, tidak bisa diakses JS
const COOKIE_OPTS = {
  httpOnly: true,               // JS tidak bisa baca cookie ini
  sameSite: 'lax',              // CSRF protection
  maxAge: 24 * 60 * 60 * 1000, // 24 jam
  // secure: true,              // Aktifkan ini saat pakai HTTPS/production
};

// ---- POST /api/auth/login ----
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username dan password wajib diisi.' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ? AND is_active = 1').get(username);
  if (!user) {
    return res.status(401).json({ error: 'Username atau password salah.' });
  }

  const valid = bcrypt.compareSync(password, user.password);
  if (!valid) {
    return res.status(401).json({ error: 'Username atau password salah.' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, name: user.name, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiry }
  );

  // Set HTTP-Only cookie — server-side session guard (tidak bisa dimatikan JS)
  res.cookie('auth_session', token, COOKIE_OPTS);

  res.json({
    token,
    user: { id: user.id, username: user.username, name: user.name, role: user.role },
    message: `Selamat datang, ${user.name}!`
  });
});

// ---- POST /api/auth/logout ----
router.post('/logout', (req, res) => {
  res.clearCookie('auth_session');
  res.json({ message: 'Logout berhasil.' });
});

// ---- GET /api/auth/me ----
router.get('/me', authMiddleware, (req, res) => {
  const user = db.prepare('SELECT id, username, name, role, created_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User tidak ditemukan.' });
  res.json(user);
});

// ---- POST /api/auth/change-password ----
router.post('/change-password', authMiddleware, (req, res) => {
  const { old_password, new_password } = req.body;
  if (!old_password || !new_password) {
    return res.status(400).json({ error: 'Password lama dan baru wajib diisi.' });
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(old_password, user.password)) {
    return res.status(401).json({ error: 'Password lama tidak sesuai.' });
  }
  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare(`UPDATE users SET password = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(hash, req.user.id);
  res.json({ message: 'Password berhasil diubah.' });
});

module.exports = router;
