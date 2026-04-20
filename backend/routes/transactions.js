const express = require('express');
const db = require('../db');
const { authMiddleware, requireRole } = require('../middleware/auth');
const broadcaster = require('../broadcaster');

const router = express.Router();

// ---- GET /api/transactions ----
router.get('/', authMiddleware, (req, res) => {
  try {
    const { search, status, month, year, limit = 50, offset = 0 } = req.query;
    let sql = 'SELECT * FROM transactions WHERE 1=1';
    const params = [];

    if (search) {
      sql += ' AND (customer_name LIKE ? OR paket LIKE ? OR method LIKE ?)';
      const like = `%${search}%`;
      params.push(like, like, like);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    if (month) {
      sql += ' AND period_month = ?';
      params.push(parseInt(month));
    }
    if (year) {
      sql += ' AND period_year = ?';
      params.push(parseInt(year));
    }

    // Count
    const total = db.prepare(sql.replace('SELECT *', 'SELECT COUNT(*) as c')).get(...params).c;

    sql += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const transactions = db.prepare(sql).all(...params);
    res.json({ data: transactions, total });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/transactions/:id ----
router.get('/:id', authMiddleware, (req, res) => {
  try {
    const trx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    if (!trx) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
    res.json(trx);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- POST /api/transactions ----
router.post('/', authMiddleware, (req, res) => {
  try {
    const { customer_id, customer_name, paket, amount, method, status, period_month, period_year, notes } = req.body;
    if (!customer_name || !paket || !amount) {
      return res.status(400).json({ error: 'Nama pelanggan, paket, dan jumlah wajib diisi.' });
    }

    const now = new Date();
    const result = db.prepare(`
      INSERT INTO transactions (customer_id, customer_name, paket, amount, method, status, period_month, period_year, notes, kasir_id, kasir_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      customer_id || null,
      customer_name,
      paket,
      parseInt(amount),
      method || 'Tunai',
      status || 'Lunas',
      period_month || (now.getMonth() + 1),
      period_year || now.getFullYear(),
      notes || '',
      req.user.id,
      req.user.name
    );

    // Update customer due_date +1 month if payment Lunas
    if ((status || 'Lunas') === 'Lunas' && customer_id) {
      const customer = db.prepare('SELECT * FROM customers WHERE id = ?').get(customer_id);
      if (customer) {
        // Kalkulasi: jika belum jatuh tempo (bayar di awal), tambah +1 bulan dari tenggat aslinya. Jika sudah telat, tambah +1 bulan dari hari ini.
        let baseDate = now;
        if (customer.due_date) {
           const due = new Date(customer.due_date);
           if (due > now) baseDate = due; 
        }
        const newDue = new Date(baseDate.getFullYear(), baseDate.getMonth() + 1, baseDate.getDate()).toISOString().slice(0, 10);
        
        // UN-ISOLIR MIKROTIK OTOMATIS JIKA SEDANG SUSPEND!
        if (customer.pppoe_username && customer.status === 'Suspend') {
          const { createMikrotikClient } = require('../services/mikrotik');
          const mikrotik = createMikrotikClient(customer.mikrotik_host ? { host: customer.mikrotik_host } : {});
          const targetProfile = customer.mikrotik_profile || customer.paket || 'default';
          // Fire and forget (jangan ngeblok respon UI)
          mikrotik.activatePPPoEUser(customer.pppoe_username, targetProfile)
            .then(() => console.log(`[Auto-Activate] Sukses mengembalikan ${customer.pppoe_username} paska bayar.`))
            .catch(e => console.error(`[Auto-Activate] Gagal: ${e.message}`));
        }

        db.prepare(`UPDATE customers SET due_date = ?, status = 'Aktif', mikrotik_profile = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now') WHERE id = ?`).run(newDue, customer_id);
      }
    }

    const created = db.prepare('SELECT * FROM transactions WHERE id = ?').get(result.lastInsertRowid);
    broadcaster.broadcast('transactions', 'create', { id: created.id, customer_name: created.customer_name, amount: created.amount });
    res.status(201).json(created);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- PUT /api/transactions/:id ----
router.put('/:id', authMiddleware, (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });

    const { customer_name, paket, amount, method, status, notes } = req.body;
    db.prepare(`
      UPDATE transactions SET
        customer_name = ?, paket = ?, amount = ?, method = ?, status = ?, notes = ?,
        updated_at = strftime('%Y-%m-%dT%H:%M:%SZ','now')
      WHERE id = ?
    `).run(
      customer_name ?? existing.customer_name,
      paket ?? existing.paket,
      amount !== undefined ? parseInt(amount) : existing.amount,
      method ?? existing.method,
      status ?? existing.status,
      notes ?? existing.notes,
      req.params.id
    );

    const updated = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    broadcaster.broadcast('transactions', 'update', { id: updated.id });
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- DELETE /api/transactions/:id ----
router.delete('/:id', authMiddleware, requireRole('admin'), (req, res) => {
  try {
    const existing = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Transaksi tidak ditemukan.' });
    db.prepare('DELETE FROM transactions WHERE id = ?').run(req.params.id);
    broadcaster.broadcast('transactions', 'delete', { id: Number(req.params.id) });
    res.json({ message: 'Transaksi berhasil dihapus.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
