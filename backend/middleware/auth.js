const jwt = require('jsonwebtoken');
const config = require('../config');

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;
  const cookieToken = req.cookies && req.cookies.auth_session ? req.cookies.auth_session : null;

  // Coba Bearer token dulu, fallback ke cookie jika gagal
  const tokens = [];
  if (authHeader && authHeader.startsWith('Bearer ')) tokens.push(authHeader.slice(7));
  if (cookieToken) tokens.push(cookieToken);

  if (!tokens.length) {
    return res.status(401).json({ error: 'Token tidak ditemukan. Silakan login.' });
  }

  // Coba setiap token sampai ada yang valid
  for (const token of tokens) {
    try {
      const payload = jwt.verify(token, config.jwtSecret);
      req.user = payload;
      return next();
    } catch (_) {
      // Coba token berikutnya
    }
  }

  return res.status(401).json({ error: 'Token tidak valid atau sudah kadaluarsa.' });
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Tidak terautentikasi.' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Akses ditolak. Dibutuhkan role: ${roles.join(' atau ')}.` });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole };
