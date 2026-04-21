const EventEmitter = require('events');
global.mikrotikEmptyEvent = new EventEmitter();

// Catch routeros !empty exception that crashes node process
process.on('uncaughtException', (err) => {
  if (err.message && (err.message.includes('!empty') || err.message.includes('UNKNOWNREPLY'))) {
    console.warn('[MikroTik] Intercepted !empty reply from node-routeros, ignoring to prevent crash.');
    global.mikrotikEmptyEvent.emit('empty');
    return;
  }
  console.error('UNCAUGHT EXCEPTION:', err);
  process.exit(1);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const config = require('./config');

// Init DB (jalan auto migrate + seed)
require('./db');

const app = express();

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(cors({
  origin: (origin, callback) => {
    callback(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Authorization', 'Content-Type'],
}));

app.use(cookieParser());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ============================================================
// SERVER-SIDE PAGE GUARD
// Semua request ke /pages/*.html (selain login.html) harus
// punya HTTP-Only cookie 'auth_session' yang valid.
// JS dimatikan pun tetap ter-redirect ke login.
// ============================================================
const PUBLIC_PAGES = ['login.html'];

app.use('/pages', (req, res, next) => {
  // Hanya guard file .html
  if (!req.path.endsWith('.html')) return next();

  const page = path.basename(req.path);
  if (PUBLIC_PAGES.includes(page)) return next();

  const token = req.cookies && req.cookies.auth_session;
  if (!token) {
    return res.redirect('/pages/login.html?reason=session_expired');
  }

  try {
    const user = jwt.verify(token, config.jwtSecret);

    // Server-Side Role-Based Access Control (RBAC)
    if (user.role === 'kasir') {
      const allowedKasir = ['index.html', 'customers.html', 'cs-portal.html', 'kasir.html', 'laporan.html', 'setoran.html', 'stok.html', 'whatsapp.html', 'payment.html', 'pppoe.html'];
      if (!allowedKasir.includes(page)) {
        return res.status(403).send('<h1>403 Forbidden</h1><p>Akses ditolak. Halaman ini bukan untuk Kasir.</p><a href="/pages/index.html">Kembali ke Dashboard</a>');
      }
    }

    if (user.role === 'teknisi') {
      const allowedTeknisi = ['index.html', 'customers.html', 'pppoe.html', 'hotspot.html', 'map.html', 'odc.html'];
      if (!allowedTeknisi.includes(page)) {
        return res.status(403).send('<h1>403 Forbidden</h1><p>Akses ditolak. Halaman ini bukan untuk Teknisi.</p><a href="/pages/index.html">Kembali ke Dashboard</a>');
      }
    }

    next(); // token valid dan role sesuai → halaman dilayani
  } catch {
    res.clearCookie('auth_session');
    return res.redirect('/pages/login.html?reason=session_expired');
  }
});

// Serve static frontend files
app.use(express.static(path.join(__dirname, '..')));
app.use('/pages', express.static(path.join(__dirname, '..', 'frontend', 'pages')));
app.use('/assets', express.static(path.join(__dirname, '..', 'frontend', 'assets')));

// ============================================================
// ROUTES
// ============================================================
const { authMiddleware, requireRole } = require('./middleware/auth');
const broadcaster = require('./broadcaster');

// ============================================================
// REAL-TIME SSE ENDPOINT
// ============================================================
app.get('/api/events', authMiddleware, (req, res) => {
  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Nginx: disable buffering
  res.flushHeaders();

  // Send initial connection event
  const user = req.user;
  res.write(`event: connected\ndata: ${JSON.stringify({ userId: user?.id, role: user?.role, ts: Date.now() })}\n\n`);

  const clientId = broadcaster.addClient(res);

  // Cleanup on disconnect
  req.on('close', () => broadcaster.removeClient(clientId));
  req.on('error', () => broadcaster.removeClient(clientId));
});


app.use('/api/auth', require('./routes/auth')); // Public/Auth logic

// Kasir & Admin Only
app.use('/api/customers', authMiddleware, requireRole('admin', 'kasir', 'teknisi'), require('./routes/customers'));
app.use('/api/transactions', authMiddleware, requireRole('admin', 'kasir', 'teknisi'), require('./routes/transactions'));
app.use('/api/reports', authMiddleware, requireRole('admin', 'kasir', 'teknisi'), require('./routes/reports'));
app.use('/api/inventory', authMiddleware, requireRole('admin', 'kasir'), require('./routes/inventory'));
app.use('/api/deposits', authMiddleware, requireRole('admin', 'kasir'), require('./routes/deposits'));
app.use('/api/tickets', authMiddleware, requireRole('admin', 'kasir', 'teknisi'), require('./routes/tickets'));
app.use('/api/ledger', authMiddleware, requireRole('admin', 'kasir'), require('./routes/ledger'));
app.use('/api/payment', authMiddleware, requireRole('admin', 'kasir'), require('./routes/payment'));
app.use('/api/settings', authMiddleware, requireRole('admin'), require('./routes/settings'));

// Infrastruktur & Mikrotik (Teknisi, Admin & Kasir untuk fitur PPPoE Management)
app.use('/api/mikrotik', authMiddleware, requireRole('admin', 'teknisi', 'kasir'), (req, res, next) => {
  if (req.user.role === 'kasir') {
    if (!req.path.startsWith('/pppoe/')) {
      return res.status(403).json({ error: 'Akses ditolak. Kasir hanya diizinkan mengakses menu MikroTik PPPoE.' });
    }
  }
  next();
}, require('./routes/mikrotik'));

app.use('/api/odp', authMiddleware, requireRole('admin', 'teknisi'), require('./routes/odp'));
app.use('/api/whatsapp', authMiddleware, requireRole('admin', 'kasir'), require('./routes/whatsapp'));

// Admin Only (Users management is already protected in its router, but we can double guard)
app.use('/api/users', authMiddleware, requireRole('admin'), require('./routes/users'));

// Resellers/Agents/Attendance - typically admin or kasir based on context, let's allow admin & kasir for now
app.use('/api/resellers', authMiddleware, requireRole('admin', 'kasir'), require('./routes/resellers'));
app.use('/api/agents', authMiddleware, requireRole('admin', 'kasir'), require('./routes/agents'));
app.use('/api/attendance', authMiddleware, require('./routes/attendance')); // Maybe all roles can clock in

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    app: config.app.name,
    version: config.app.version,
    timestamp: new Date().toISOString(),
    mikrotik_host: config.mikrotik.host,
  });
});

// API 404
app.use('/api/*splat', (req, res) => {
  res.status(404).json({ error: `Endpoint tidak ditemukan: ${req.originalUrl}` });
});

// Frontend catch-all: cek auth dulu, baru serve index.html
app.get('*splat', (req, res) => {
  const token = req.cookies && req.cookies.auth_session;

  // Tidak ada cookie → redirect ke login
  if (!token) {
    return res.redirect('/pages/login.html');
  }

  // Verifikasi JWT
  try {
    jwt.verify(token, config.jwtSecret);
    res.sendFile(path.join(__dirname, '..', 'frontend', 'pages', 'index.html'));
  } catch {
    res.clearCookie('auth_session');
    return res.redirect('/pages/login.html?reason=session_expired');
  }
});

// ============================================================
// ERROR HANDLER
// ============================================================
app.use((err, req, res, _next) => {
  console.error('[ERROR]', err.message);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ============================================================
// START SERVER & DAEMON
// ============================================================
require('./cron').startBillingDaemon();

const PORT = config.port;
app.listen(PORT, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║       RT/RW NET Billing Backend v2.0                  ║');
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log(`║  Server    : http://localhost:${PORT}                        ║`);
  console.log(`║  Dashboard : http://localhost:${PORT}/pages/index.html       ║`);
  console.log(`║  Login     : http://localhost:${PORT}/pages/login.html       ║`);
  console.log(`║  API Docs  : http://localhost:${PORT}/api/health             ║`);
  console.log(`║  MikroTik  : ${config.mikrotik.host}:${config.mikrotik.port}                     ║`);
  console.log('╠════════════════════════════════════════════════════════╣');
  console.log('║  Security  : HTTP-Only Cookie + JWT Guard aktif       ║');
  console.log('╚════════════════════════════════════════════════════════╝');
  console.log('');
});

module.exports = app;
