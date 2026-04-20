const express = require('express');
const db = require('../db');
const { authMiddleware } = require('../middleware/auth');
const { createMikrotikClient } = require('../services/mikrotik');

const router = express.Router();

// ---- GET /api/reports/summary ----
// Ringkasan dashboard: stat pelanggan + keuangan bulan ini
router.get('/summary', authMiddleware, async (req, res) => {
  try {
    const now = new Date();
    const currentMonth = parseInt(req.query.month) || (now.getMonth() + 1);
    const currentYear  = parseInt(req.query.year)  || now.getFullYear();
    // Pad untuk query strftime SQLite
    const mm   = String(currentMonth).padStart(2, '0');
    const yyyy = String(currentYear);

    // Stats pelanggan
    const totalCustomers = db.prepare('SELECT COUNT(*) as c FROM customers').get().c;
    const activeCustomers = db.prepare("SELECT COUNT(*) as c FROM customers WHERE status = 'Aktif'").get().c;
    const suspendCustomers = db.prepare("SELECT COUNT(*) as c FROM customers WHERE status IN ('Suspend','Isolir')").get().c;
    const overdueCustomers = db.prepare("SELECT COUNT(*) as c FROM customers WHERE due_date < date('now') AND status = 'Aktif'").get().c;

    // Keuangan bulan ini
    const revenue = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE period_month = ? AND period_year = ? AND status = 'Lunas'"
    ).get(currentMonth, currentYear).total;

    const pendingRevenue = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE period_month = ? AND period_year = ? AND status = 'Pending'"
    ).get(currentMonth, currentYear).total;

    // Pengeluaran operasional bulan ini (dari tabel ledgers)
    const expense = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM ledgers WHERE type = 'Pengeluaran' AND strftime('%m', date) = ? AND strftime('%Y', date) = ?"
    ).get(mm, yyyy).total;

    // Laba Bersih
    const netProfit = revenue - expense;

    const totalTransactions = db.prepare(
      'SELECT COUNT(*) as c FROM transactions WHERE period_month = ? AND period_year = ?'
    ).get(currentMonth, currentYear).c;

    // Target dari settings
    const targetSetting = db.prepare("SELECT value FROM settings WHERE key = 'monthly_target'").get();
    const monthlyTarget = targetSetting ? parseInt(targetSetting.value) : 22000000;

    // Pelanggan baru bulan ini
    const newCustomers = db.prepare(
      "SELECT COUNT(*) as c FROM customers WHERE strftime('%m', created_at) = ? AND strftime('%Y', created_at) = ?"
    ).get(mm, yyyy).c;

    // --- Perangkat Aktif MikroTik (PPPoE + Hotspot) ---
    let onlineDevices = 0;
    try {
      const mikrotik = createMikrotikClient({ timeout: 5 }); // timeout cepat agar dashboard tidak lambat
      const [pppoeActive, hotspotActive] = await Promise.all([
        mikrotik.getPPPoEActive().catch(e => { throw e; }), // Ubah dari .catch(()=>[]) ke throw agar error utuh tertangkap ke catch utama
        mikrotik.getHotspotActive().catch(e => { throw e; })
      ]);
      
      // Hitung dari ukuran array yang dikembalikan
      // (Berdasarkan mikrotik.js, return value adalah array of objects)
      const pppoeCount = Array.isArray(pppoeActive) ? pppoeActive.length : 0;
      const hotspotCount = Array.isArray(hotspotActive) ? hotspotActive.length : 0;
      
      onlineDevices = pppoeCount + hotspotCount;
    } catch (mtErr) {
      console.log('====================================');
      console.log('Error MikroTik:', mtErr);
      console.log('Detail Pesan:', mtErr.message);
      console.log('====================================');
      onlineDevices = 0; // Fallback jika offline
    }

    res.json({
      period: { month: currentMonth, year: currentYear },
      customers: {
        total: totalCustomers,
        active: activeCustomers,
        suspend: suspendCustomers,
        overdue: overdueCustomers,
        new_this_month: newCustomers,
      },
      finance: {
        revenue,                              // total pemasukan (transaksi Lunas)
        expense,                              // total pengeluaran (ledgers)
        net_profit:      netProfit,           // laba bersih
        pending_revenue: pendingRevenue,      // tagihan belum bayar (nominal)
        monthly_target:  monthlyTarget,
        progress_pct:    monthlyTarget > 0
          ? Math.min(Math.round((revenue / monthlyTarget) * 100), 100)
          : 0,
        total_transactions: totalTransactions,
      },
      mikrotik: {
        online_devices: onlineDevices,
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/reports/monthly ----
// Tren pendapatan 6 bulan terakhir
router.get('/monthly', authMiddleware, (req, res) => {
  try {
    const now = new Date();
    const months = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({ month: d.getMonth() + 1, year: d.getFullYear() });
    }

    const data = months.map(({ month, year }) => {
      const revenue = db.prepare(
        "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE period_month = ? AND period_year = ? AND status = 'Lunas'"
      ).get(month, year).total;

      const count = db.prepare(
        "SELECT COUNT(*) as c FROM transactions WHERE period_month = ? AND period_year = ? AND status = 'Lunas'"
      ).get(month, year).c;

      const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
      return { month, year, label: `${monthNames[month - 1]} ${year}`, revenue, transactions: count };
    });

    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/reports/by-paket ----
// Distribusi pelanggan per paket
router.get('/by-paket', authMiddleware, (req, res) => {
  try {
    const data = db.prepare(
      "SELECT paket, COUNT(*) as total, SUM(price) as potential_revenue FROM customers WHERE status = 'Aktif' GROUP BY paket ORDER BY total DESC"
    ).all();
    res.json({ data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/reports/overdue-customers ----
// Pelanggan yang sudah lewat jatuh tempo
router.get('/overdue-customers', authMiddleware, (req, res) => {
  try {
    const data = db.prepare(
      "SELECT * FROM customers WHERE due_date < date('now') AND status = 'Aktif' ORDER BY due_date ASC"
    ).all();
    res.json({ data, total: data.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/reports/export/excel ----
// Export transaksi ke Excel
router.get('/export/excel', authMiddleware, (req, res) => {
  try {
    const XLSX = require('xlsx');
    const { month, year } = req.query;
    const now = new Date();
    const m = parseInt(month) || (now.getMonth() + 1);
    const y = parseInt(year) || now.getFullYear();

    const transactions = db.prepare(
      'SELECT * FROM transactions WHERE period_month = ? AND period_year = ? ORDER BY created_at DESC'
    ).all(m, y);

    const customers = db.prepare('SELECT * FROM customers ORDER BY name').all();

    const wsTransactions = XLSX.utils.json_to_sheet(
      transactions.map((t, i) => ({
        'No': i + 1,
        'Nama Pelanggan': t.customer_name,
        'Paket': t.paket,
        'Jumlah (Rp)': t.amount,
        'Metode': t.method,
        'Status': t.status,
        'Kasir': t.kasir_name || '-',
        'Tanggal': t.created_at ? t.created_at.slice(0, 10) : '-',
      }))
    );

    const wsCustomers = XLSX.utils.json_to_sheet(
      customers.map((c, i) => ({
        'No': i + 1,
        'Nama': c.name,
        'Alamat': c.address,
        'No HP': c.phone,
        'Paket': c.paket,
        'Harga (Rp)': c.price,
        'Status': c.status,
        'Jatuh Tempo': c.due_date || '-',
        'PPPoE Username': c.pppoe_username || '-',
      }))
    );

    const wb = XLSX.utils.book_new();
    const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    XLSX.utils.book_append_sheet(wb, wsTransactions, `Transaksi ${monthNames[m-1]} ${y}`);
    XLSX.utils.book_append_sheet(wb, wsCustomers, 'Data Pelanggan');

    const buffer = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="billing_${m}_${y}.xlsx"`);
    res.send(buffer);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- GET /api/reports/settings ----
router.get('/settings', authMiddleware, (req, res) => {
  try {
    const rows = db.prepare('SELECT key, value FROM settings').all();
    const settings = {};
    rows.forEach(r => settings[r.key] = r.value);
    res.json(settings);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---- PUT /api/reports/settings ----
router.put('/settings', authMiddleware, (req, res) => {
  try {
    const updateSetting = db.prepare(`
      INSERT OR REPLACE INTO settings (key, value, updated_at)
      VALUES (?, ?, strftime('%Y-%m-%dT%H:%M:%SZ','now'))
    `);
    const updateMany = db.transaction((data) => {
      for (const [key, value] of Object.entries(data)) {
        updateSetting.run(key, String(value));
      }
    });
    updateMany(req.body);
    res.json({ message: 'Settings berhasil diupdate.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
