const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const { createMikrotikClient } = require('../services/mikrotik');
const db = require('../db');

const router = express.Router();

// Helper: ambil MikroTik config dari DB atau default
function getMikrotikOptions(req) {
  const { host, port, user, password } = req.query;
  const opts = {};
  if (host) opts.host = host;
  if (port) opts.port = parseInt(port);
  if (user) opts.user = user;
  if (password) opts.password = password;
  return opts;
}

// ---- GET /api/mikrotik/status ----
// Cek koneksi ke router
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const result = await mikrotik.ping();
    res.json(result);
  } catch (err) {
    res.status(500).json({ connected: false, error: err.message });
  }
});

// ---- GET /api/mikrotik/resources ----
router.get('/resources', authMiddleware, async (req, res) => {
  try {
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const data = await mikrotik.getResources();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/mikrotik/interfaces ----
router.get('/interfaces', authMiddleware, async (req, res) => {
  try {
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const data = await mikrotik.getInterfaces();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/mikrotik/traffic ----
router.get('/traffic', authMiddleware, async (req, res) => {
  try {
    const iface = req.query.interface || 'ether1';
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const data = await mikrotik.getTrafficData(iface);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/mikrotik/pppoe/active ----
router.get('/pppoe/active', authMiddleware, async (req, res) => {
  try {
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const data = await mikrotik.getPPPoEActive();
    res.json({ data, total: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/mikrotik/pppoe/secrets ----
router.get('/pppoe/secrets', authMiddleware, async (req, res) => {
  try {
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const data = await mikrotik.getPPPoESecrets();
    res.json({ data, total: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/mikrotik/pppoe/profiles ----
router.get('/pppoe/profiles', authMiddleware, async (req, res) => {
  try {
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const data = await mikrotik.getPPPProfiles();
    res.json({ data, total: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /api/mikrotik/pppoe/secrets ----
router.post('/pppoe/secrets', authMiddleware, async (req, res) => {
  try {
    const { username, password, profile, localAddr, remoteAddr, comment } = req.body;
    if (!username) return res.status(400).json({ error: 'Username wajib diisi' });
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const result = await mikrotik.createPPPoESecret({ username, password, profile, localAddr, remoteAddr, comment });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- PUT /api/mikrotik/pppoe/secrets/:id ----
router.put('/pppoe/secrets/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id; // '.id' in mikrotik looks like '*1B'
    const { username, password, profile, localAddr, remoteAddr, comment } = req.body;
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    // id could be passed with an asterisk but express params might not capture it well if URL encoded, 
    // it usually is fine since it's just a string like '*4'. Let's ensure it's not trimmed
    const mikrotikId = decodeURIComponent(id);
    const result = await mikrotik.updatePPPoESecret(mikrotikId, { username, password, profile, localAddr, remoteAddr, comment });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- DELETE /api/mikrotik/pppoe/secrets/:id ----
router.delete('/pppoe/secrets/:id', authMiddleware, async (req, res) => {
  try {
    const mikrotikId = decodeURIComponent(req.params.id);
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const result = await mikrotik.removePPPoESecret(mikrotikId);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /api/mikrotik/pppoe/enable ----
router.post('/pppoe/enable', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username wajib diisi.' });
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const result = await mikrotik.enablePPPoEUser(username);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /api/mikrotik/pppoe/disable ----
router.post('/pppoe/disable', authMiddleware, async (req, res) => {
  try {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'username wajib diisi.' });
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const result = await mikrotik.disablePPPoEUser(username);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/mikrotik/hotspot/active ----
router.get('/hotspot/active', authMiddleware, async (req, res) => {
  try {
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const data = await mikrotik.getHotspotActive();
    res.json({ data, total: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/mikrotik/hotspot/profiles ----
router.get('/hotspot/profiles', authMiddleware, async (req, res) => {
  try {
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const data = await mikrotik.getHotspotUserProfiles();
    res.json({ data, total: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/mikrotik/ip-addresses ----
router.get('/ip-addresses', authMiddleware, async (req, res) => {
  try {
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const data = await mikrotik.getIPAddresses();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/mikrotik/summary ----
// Format data resources ke struktur yang diharapkan frontend monitoring
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));

    // Ambil resources dan identity paralel
    const [resData, identityData] = await Promise.all([
      mikrotik.getResources().catch(() => null),
      mikrotik.getIdentity().catch(() => null),
    ]);

    if (!resData) throw new Error('Tidak dapat terhubung ke MikroTik');

    const freeMemory  = resData.free_memory  || 0;
    const totalMemory = resData.total_memory || 1;
    const usedMemory  = totalMemory - freeMemory;
    const memPct      = Math.round((usedMemory / totalMemory) * 100);

    const freeHdd  = resData.free_hdd  || 0;
    const totalHdd = resData.total_hdd || 1;
    const usedHdd  = totalHdd - freeHdd;
    const hddPct   = Math.round((usedHdd / totalHdd) * 100);

    const fmtBytes = (b) => {
      if (b >= 1073741824) return (b / 1073741824).toFixed(1) + ' GiB';
      if (b >= 1048576)    return (b / 1048576).toFixed(1) + ' MiB';
      return (b / 1024).toFixed(0) + ' KiB';
    };

    res.json({
      identity: {
        name    : identityData?.name || resData.platform || 'MikroTik',
        version : resData.version    || 'unknown',
        board   : resData.board_name || resData.architecture || 'unknown',
      },
      time: {
        uptime: { human: resData.uptime || '-' },
      },
      resources: {
        cpu: {
          load  : resData.cpu_load || 0,
          cores : 1,
        },
        memory: {
          usedFormatted  : fmtBytes(usedMemory),
          totalFormatted : fmtBytes(totalMemory),
          usagePercent   : memPct,
        },
        storage: {
          usedFormatted  : fmtBytes(usedHdd),
          totalFormatted : fmtBytes(totalHdd),
          usagePercent   : hddPct,
        },
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/mikrotik/instances ----
// Kembalikan perangkat MikroTik sebagai instances untuk frontend monitoring
router.get('/instances', authMiddleware, async (req, res) => {
  try {
    // Coba ambil dari DB dulu
    let devices = db.prepare('SELECT id, name, host, port, username, is_active FROM mikrotik_devices WHERE is_active = 1').all();

    // Kalau DB kosong, gunakan config dari .env sebagai single device
    if (!devices.length) {
      const config = require('../config');
      devices = [{
        id       : 'env-default',
        name     : 'MikroTik Utama',
        host     : config.mikrotik.host,
        port     : config.mikrotik.port,
        username : config.mikrotik.user,
        is_active: 1,
      }];
    }

    res.json(devices);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/mikrotik/interfaces-list ----
// Return interfaces dengan format yang kompatibel frontend
router.get('/interfaces-list', authMiddleware, async (req, res) => {
  try {
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const data = await mikrotik.getInterfaces();
    // Tambah field 'label' yang diharapkan frontend
    const result = data.map(i => ({ ...i, label: i.name }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/mikrotik/interfaces/:iface/traffic ----
// Traffic per interface dalam format downloadMbps/uploadMbps
router.get('/interfaces/:iface/traffic', authMiddleware, async (req, res) => {
  try {
    const iface    = req.params.iface;
    const mikrotik = createMikrotikClient(getMikrotikOptions(req));
    const data     = await mikrotik.getTrafficData(iface);
    res.json({
      downloadMbps : parseFloat(((data.rx_bits || 0) / 1_000_000).toFixed(3)),
      uploadMbps   : parseFloat(((data.tx_bits || 0) / 1_000_000).toFixed(3)),
      interface    : data.interface,
      timestamp    : new Date().toISOString(),
      status       : 'ok',
    });
  } catch (err) {
    res.status(500).json({ downloadMbps: 0, uploadMbps: 0, status: err.message });
  }
});

module.exports = router;

