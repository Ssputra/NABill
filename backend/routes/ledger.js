const express = require('express');
const { authMiddleware } = require('../middleware/auth');
const db = require('../db');
const broadcaster = require('../broadcaster');
const router = express.Router();

router.get('/', authMiddleware, (req, res) => {
  try {
    res.json(db.prepare('SELECT * FROM ledgers ORDER BY date DESC, id DESC').all());
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /cashflow-chart (backward compat) ───────────────────
router.get('/cashflow-chart', authMiddleware, (req, res) => {
  try {
    const data = { labels: [], pemasukan: [], pengeluaran: [] };
    const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d    = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const yStr = String(d.getFullYear());
      data.labels.push(`${monthNames[d.getMonth()]} ${yStr}`);
      data.pemasukan.push(db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM ledgers WHERE type='in'  AND strftime('%m',date)=? AND strftime('%Y',date)=?`).get(mStr, yStr).t);
      data.pengeluaran.push(db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM ledgers WHERE type='out' AND strftime('%m',date)=? AND strftime('%Y',date)=?`).get(mStr, yStr).t);
    }
    res.json(data);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ── GET /summary — Data lengkap untuk halaman Bookkeeping ───
router.get('/summary', authMiddleware, (req, res) => {
  try {
    const monthNames = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
    const now = new Date();
    const curM = String(now.getMonth() + 1).padStart(2, '0');
    const curY = String(now.getFullYear());

    // ── Bulan ini ──────────────────────────────────────────
    const totalIn   = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM ledgers WHERE type='in'  AND strftime('%m',date)=? AND strftime('%Y',date)=?`).get(curM, curY).t;
    const totalOut  = db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM ledgers WHERE type='out' AND strftime('%m',date)=? AND strftime('%Y',date)=?`).get(curM, curY).t;
    const totalEntri = db.prepare(`SELECT COUNT(*) as c FROM ledgers WHERE strftime('%m',date)=? AND strftime('%Y',date)=?`).get(curM, curY).c;
    const laba       = totalIn - totalOut;
    const margin     = totalIn > 0 ? Math.round((laba / totalIn) * 100) : 0;

    // ── Grafik 6 Bulan ────────────────────────────────────
    const grafik = { labels: [], pemasukan: [], pengeluaran: [] };
    for (let i = 5; i >= 0; i--) {
      const d    = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const yStr = String(d.getFullYear());
      grafik.labels.push(`${monthNames[d.getMonth()]} ${yStr}`);
      grafik.pemasukan.push(db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM ledgers WHERE type='in'  AND strftime('%m',date)=? AND strftime('%Y',date)=?`).get(mStr, yStr).t);
      grafik.pengeluaran.push(db.prepare(`SELECT COALESCE(SUM(amount),0) as t FROM ledgers WHERE type='out' AND strftime('%m',date)=? AND strftime('%Y',date)=?`).get(mStr, yStr).t);
    }

    res.json({
      bulan_ini: { pemasukan: totalIn, pengeluaran: totalOut, laba_bersih: laba, total_entri: totalEntri },
      margin,
      grafik_6_bulan: grafik,
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post('/', authMiddleware, (req, res) => {
  try {
    const { date, description, category, type, amount, status, ref_id } = req.body;
    const stmt = db.prepare('INSERT INTO ledgers (date, description, category, type, amount, status, ref_id) VALUES (?, ?, ?, ?, ?, ?, ?)');
    const info = stmt.run(date||new Date().toISOString().slice(0,10), description||'', category||'', type||'', amount||0, status||'Selesai', ref_id||'');
    res.json({ id: info.lastInsertRowid, success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put('/:id', authMiddleware, (req, res) => {
  try {
    const { date, description, category, type, amount, status, ref_id } = req.body;
    const stmt = db.prepare('UPDATE ledgers SET date=?, description=?, category=?, type=?, amount=?, status=?, ref_id=?, updated_at=strftime("%Y-%m-%dT%H:%M:%SZ","now") WHERE id=?');
    stmt.run(date, description, category, type, amount, status, ref_id, req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete('/:id', authMiddleware, (req, res) => {
  try {
    db.prepare('DELETE FROM ledgers WHERE id=?').run(req.params.id);
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

module.exports = router;
