const express = require('express');
const db = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const { createMikrotikClient } = require('../services/mikrotik');
const broadcaster = require('../broadcaster');

const router = express.Router();

// ---- GET /api/customers ----
router.get('/', authMiddleware, (req, res) => {
  try {
    const { search, status, limit, offset } = req.query;
    let sql = 'SELECT * FROM customers WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (name LIKE ? OR address LIKE ? OR phone LIKE ? OR pppoe_username LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like, like);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }

    // Count total
    const countSql = sql.replace('SELECT *', 'SELECT COUNT(*) as total');
    const total = db.prepare(countSql).get(...params).total;

    sql += ' ORDER BY name ASC';
    if (limit) {
      sql += ' LIMIT ?';
      params.push(parseInt(limit));
      if (offset) {
        sql += ' OFFSET ?';
        params.push(parseInt(offset));
      }
    }

    const customers = db.prepare(sql).all(...params);
    res.json({ data: customers, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/customers/map ----
// Khusus untuk halaman peta: ambil id, nama, status, lat, lng semua pelanggan
router.get('/map', authMiddleware, (req, res) => {
  try {
    const customers = db.prepare(`
      SELECT id, name, address, paket, status, latitude, longitude
      FROM customers
      ORDER BY name ASC
    `).all();
    res.json(customers);
  } catch (err) {
    console.error('>>> ERROR GET /customers/map:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/customers/:id ----
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Pelanggan tidak ditemukan.' });
    res.json(customer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /api/customers ----
router.post('/', authMiddleware, (req, res) => {
  try {
    const { name, address, phone, email, paket, price, status, due_date, pppoe_username, pppoe_password, mikrotik_host, notes } = req.body;
    if (!name || !paket || !price) {
      return res.status(400).json({ error: 'Nama, paket, dan harga wajib diisi.' });
    }

    const result = db.prepare(`
      INSERT INTO customers (name, address, phone, email, paket, price, status, due_date, pppoe_username, pppoe_password, mikrotik_host, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(name, address || '', phone || '', email || '', paket, parseInt(price), status || 'Aktif', due_date || null, pppoe_username || '', pppoe_password || '', mikrotik_host || '', notes || '');

    const created = db.prepare('SELECT * FROM customers WHERE id = ?').get(result.lastInsertRowid);
    broadcaster.broadcast('customers', 'create', { id: created.id, name: created.name });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- PUT /api/customers/:id ----
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Pelanggan tidak ditemukan.' });

    const { name, address, phone, email, paket, price, status, due_date, pppoe_username, pppoe_password, mikrotik_host, notes } = req.body;

    db.prepare(`
      UPDATE customers SET
        name = ?, address = ?, phone = ?, email = ?, paket = ?, price = ?,
        status = ?, due_date = ?, pppoe_username = ?, pppoe_password = ?,
        mikrotik_host = ?, notes = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE id = ?
    `).run(
      name ?? existing.name,
      address ?? existing.address,
      phone ?? existing.phone,
      email ?? existing.email,
      paket ?? existing.paket,
      price !== undefined ? parseInt(price) : existing.price,
      status ?? existing.status,
      due_date ?? existing.due_date,
      pppoe_username ?? existing.pppoe_username,
      pppoe_password ?? existing.pppoe_password,
      mikrotik_host ?? existing.mikrotik_host,
      notes ?? existing.notes,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    broadcaster.broadcast('customers', 'update', { id: updated.id, name: updated.name });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- DELETE /api/customers/:id ----
router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Pelanggan tidak ditemukan.' });
    db.prepare('DELETE FROM customers WHERE id = ?').run(req.params.id);
    broadcaster.broadcast('customers', 'delete', { id: Number(req.params.id), name: existing.name });
    res.json({ message: `Pelanggan '${existing.name}' berhasil dihapus.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- PUT /api/customers/:id/location ----
// Simpan/update koordinat GPS pelanggan dari klik peta
router.put('/:id/location', authMiddleware, (req, res) => {
  try {
    const { latitude, longitude } = req.body;
    if (latitude === undefined || longitude === undefined) {
      return res.status(400).json({ error: 'Latitude dan longitude wajib diisi.' });
    }
    const existing = db.prepare('SELECT id, name FROM customers WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Pelanggan tidak ditemukan.' });

    db.prepare(`
      UPDATE customers SET latitude = ?, longitude = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE id = ?
    `).run(parseFloat(latitude), parseFloat(longitude), req.params.id);

    console.log(`[Map] Lokasi ${existing.name} disimpan: ${latitude}, ${longitude}`);
    broadcaster.broadcast('customers', 'update', { id: Number(req.params.id), action: 'location' });
    res.json({ success: true, id: Number(req.params.id), latitude, longitude });
  } catch (err) {
    console.error('>>> ERROR PUT /customers/:id/location:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /api/customers/:id/sync-mikrotik ----
// Sinkronisasi status pelanggan ke PPPoE MikroTik (enable/disable)
router.post('/:id/sync-mikrotik', authMiddleware, async (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Pelanggan tidak ditemukan.' });
    if (!customer.pppoe_username) return res.status(400).json({ error: 'Pelanggan tidak memiliki PPPoE username.' });

    // Gunakan mikrotik_host dari customer atau dari config default
    const mikrotik = createMikrotikClient(
      customer.mikrotik_host ? { host: customer.mikrotik_host } : {}
    );

    let result;
    if (customer.status === 'Aktif') {
      result = await mikrotik.enablePPPoEUser(customer.pppoe_username);
    } else {
      result = await mikrotik.disablePPPoEUser(customer.pppoe_username);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: `Gagal sync MikroTik: ${err.message}` });
  }
});

// ---- POST /api/customers/:id/suspend ----
router.post('/:id/suspend', authMiddleware, async (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Pelanggan tidak ditemukan.' });
    
    let originalProfile = null;
    // 1. Eksekusi Mikrotik jika ada pppoe_username
    if (customer.pppoe_username) {
      const mikrotik = createMikrotikClient(customer.mikrotik_host ? { host: customer.mikrotik_host } : {});
      const suspendRes = await mikrotik.suspendPPPoEUser(customer.pppoe_username);
      if (suspendRes && suspendRes.originalProfile) {
        originalProfile = suspendRes.originalProfile;
      }
    }

    // 2. Update DB (simpan original profile ke helper column)
    if (originalProfile) {
      db.prepare(`UPDATE customers SET status = 'Suspend', mikrotik_profile = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(originalProfile, customer.id);
    } else {
      db.prepare(`UPDATE customers SET status = 'Suspend', updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(customer.id);
    }
    
    broadcaster.broadcast('customers', 'update', { id: customer.id, name: customer.name, action: 'suspend' });
    res.json({ success: true, message: `Pelanggan ${customer.name} berhasil di-isolir.` });
  } catch (err) {
    res.status(500).json({ error: `Gagal isolir: ${err.message}` });
  }
});

// ---- POST /api/customers/:id/activate ----
router.post('/:id/activate', authMiddleware, async (req, res) => {
  try {
    const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
    if (!customer) return res.status(404).json({ error: 'Pelanggan tidak ditemukan.' });
    
    // 1. Eksekusi Mikrotik jika ada pppoe_username (kembalikan ke pakernya)
    if (customer.pppoe_username) {
      const mikrotik = createMikrotikClient(customer.mikrotik_host ? { host: customer.mikrotik_host } : {});
      // Prioritaskan profil asli yang disave sebelum suspend, jika tidak ada fallback ke paket
      const targetProfile = customer.mikrotik_profile || customer.paket || 'default';
      await mikrotik.activatePPPoEUser(customer.pppoe_username, targetProfile);
    }

    // 2. Update DB (hapus mikrotik_profile cache)
    db.prepare(`UPDATE customers SET status = 'Aktif', mikrotik_profile = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(customer.id);
    
    broadcaster.broadcast('customers', 'update', { id: customer.id, name: customer.name, action: 'activate' });
    res.json({ success: true, message: `Pelanggan ${customer.name} berhasil diaktifkan.` });
  } catch (err) {
    res.status(500).json({ error: `Gagal aktivasi: ${err.message}` });
  }
});

// ---- GET /api/customers/:id/transactions ----
router.get('/:id/transactions', authMiddleware, (req, res) => {
  try {
    const trx = db.prepare('SELECT * FROM transactions WHERE customer_id = ? ORDER BY created_at DESC').all(req.params.id);
    res.json({ data: trx });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
