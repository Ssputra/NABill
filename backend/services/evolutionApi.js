/**
 * Evolution API — WhatsApp Messaging Service
 * ============================================
 * Helper terpusat untuk pengiriman pesan WA via Evolution API (self-hosted).
 *
 * Fitur:
 *  - Queue sederhana (FIFO) — tidak spam kirim sekaligus
 *  - Delay acak antar pesan (2–5 detik default) — anti-banned
 *  - Typing/Presence effect sebelum kirim — terlihat alami
 *  - Variable interpolation dari data SQLite ({nama}, {tagihan}, dsb.)
 *  - Konfigurasi dari DB settings (prioritas) atau fallback ke .env
 */

'use strict';

const db = require('../db');

// ──────────────────────────────────────────────────────────────────────────────
// Config helpers — baca dari tabel settings (key: evo_*) atau dari .env
// ──────────────────────────────────────────────────────────────────────────────
function getEvoCfg(key, envKey, fallback = '') {
  try {
    const row = db.prepare("SELECT value FROM settings WHERE key=?").get('evo_' + key);
    if (row && row.value) return row.value;
  } catch (_) { }
  return process.env[envKey] || fallback;
}

function getConfig() {
  return {
    baseUrl: getEvoCfg('base_url', 'EVO_BASE_URL', ''),
    instanceName: getEvoCfg('instance_name', 'EVO_INSTANCE_NAME', ''),
    apiKey: getEvoCfg('api_key', 'EVO_API_KEY', ''),
    // Delay acak antara dua angka ini (milidetik) — anti-spam/banned
    delayMin: parseInt(getEvoCfg('delay_min', 'EVO_DELAY_MIN', '2000')),
    delayMax: parseInt(getEvoCfg('delay_max', 'EVO_DELAY_MAX', '5000')),
    // Apakah tampilkan efek "sedang mengetik" sebelum kirim
    useTyping: getEvoCfg('use_typing', 'EVO_USE_TYPING', '1') === '1',
  };
}

// ──────────────────────────────────────────────────────────────────────────────
// Utilities
// ──────────────────────────────────────────────────────────────────────────────

/** Delay acak antara min dan max ms */
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const randomDelay = (min, max) =>
  sleep(Math.floor(Math.random() * (max - min + 1)) + min);

/**
 * Interpolasi variabel dari objek data ke dalam string pesan.
 * Contoh: "Halo {nama}, tagihan {tagihan}" + { nama:'Budi', tagihan:'150.000' }
 *         → "Halo Budi, tagihan 150.000"
 */
function interpolate(template, data = {}) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    const val = data[key];
    return val !== undefined && val !== null ? String(val) : `{${key}}`;
  });
}

/** Normalisasi nomor HP → format Evolution API (628xxx tanpa + atau spasi) */
function normalizePhone(phone) {
  if (!phone) return null;
  let p = String(phone).replace(/\D/g, '');
  if (!p) return null;
  if (p.startsWith('0')) p = '62' + p.slice(1);
  if (!p.startsWith('62')) p = '62' + p;
  // Evolution API format: "6281234567890@s.whatsapp.net" — atau nomor saja
  // Kita kirim nomor saja, endpoint /message/sendText yang handle
  return p;
}

// ──────────────────────────────────────────────────────────────────────────────
// Evolution API — Core sender
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Kirim satu pesan teks ke satu nomor via Evolution API /message/sendText
 *
 * @param {string} phone   - Nomor HP (akan dinormalisasi otomatis)
 * @param {string} message - Isi pesan (sudah diinterpolasi)
 * @param {object} cfg     - Config (dari getConfig())
 * @returns {{ ok: boolean, data?: object, error?: string }}
 */
async function sendSingleMessage(phone, message, cfg) {
  const number = normalizePhone(phone);
  if (!number) return { ok: false, error: 'Nomor tidak valid: ' + phone };

  const url = `${cfg.baseUrl}/message/sendText/${cfg.instanceName}`;

  // ── 1. Typing presence effect (opsional) ──
  if (cfg.useTyping) {
    try {
      await fetch(`${cfg.baseUrl}/chat/presence/${cfg.instanceName}`, {
        method: 'POST',
        headers: {
          'apikey': cfg.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          number,
          options: { presence: 'composing', delay: 1200 },
        }),
      });
      // Tunggu sebentar agar "mengetik..." terlihat
      await sleep(1200 + Math.floor(Math.random() * 800));
    } catch (e) {
      // Typing effect tidak kritis — lanjut kirim meski gagal
      console.warn('[EVO Typing] Warning:', e.message);
    }
  }

  // ── 2. Kirim pesan ──
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': cfg.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        number,                       // "628123456789"
        text: message,                // isi pesan plain text
        options: {
          delay: 1000,                // delay internal Evolution (ms)
          presence: 'composing',      // efek typing dalam options juga
        },
      }),
    });

    const data = await res.json().catch(() => ({}));

    if (!res.ok) {
      const errMsg = data.message || data.error || `HTTP ${res.status}`;
      console.error(`[EVO Send] ✗ ${number}: ${errMsg}`);
      return { ok: false, error: errMsg };
    }

    console.log(`[EVO Send] ✓ ${number}: key=${data.key?.id}`);
    return { ok: true, data };

  } catch (err) {
    console.error(`[EVO Send] Network error for ${number}:`, err.message);
    return { ok: false, error: err.message };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
// QUEUE BLAST — Kirim ke banyak nomor dengan antrian FIFO + delay
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Kirim blast ke banyak penerima secara berurutan (queue FIFO).
 * Setiap pesan bisa berbeda isinya (mendukung variabel per-penerima dari SQLite).
 *
 * @param {Array<{ phone: string, data?: object }>} recipients
 *   - phone: nomor HP penerima
 *   - data:  objek variabel untuk interpolasi (nama, tagihan, tgl, dsb.)
 * @param {string} messageTemplate - Template pesan dengan variabel {nama}, {tagihan}, dll.
 * @param {object} options
 *   - onProgress?: (index, total, result) => void  — callback per pesan
 *
 * @returns {{ sent: number, failed: number, errors: string[] }}
 */
async function sendBlastQueue(recipients, messageTemplate, options = {}) {
  const cfg = getConfig();

  // Validasi konfigurasi
  if (!cfg.baseUrl || !cfg.instanceName || !cfg.apiKey) {
    throw new Error(
      'Konfigurasi Evolution API belum lengkap. ' +
      'Isi EVO_BASE_URL, EVO_INSTANCE_NAME, dan EVO_API_KEY di .env atau Konfigurasi API.'
    );
  }

  let sent = 0, failed = 0;
  const errors = [];

  console.log(`[EVO Blast] Mulai antrian: ${recipients.length} penerima`);
  console.log(`[EVO Blast] Delay: ${cfg.delayMin}–${cfg.delayMax}ms | Typing: ${cfg.useTyping}`);

  for (let i = 0; i < recipients.length; i++) {
    const { phone, data = {} } = recipients[i];

    // Interpolasi variabel ke dalam template untuk penerima ini
    const message = interpolate(messageTemplate, data);

    // Kirim
    const result = await sendSingleMessage(phone, message, cfg);

    if (result.ok) {
      sent++;
    } else {
      failed++;
      errors.push(`${phone}: ${result.error}`);
    }

    // Callback progress (opsional, untuk logging)
    if (typeof options.onProgress === 'function') {
      options.onProgress(i + 1, recipients.length, result);
    }

    // ── Delay acak sebelum pesan berikutnya (kecuali yang terakhir) ──
    if (i < recipients.length - 1) {
      const delay = Math.floor(Math.random() * (cfg.delayMax - cfg.delayMin + 1)) + cfg.delayMin;
      console.log(`[EVO Blast] Jeda ${delay}ms sebelum nomor berikutnya...`);
      await sleep(delay);
    }
  }

  console.log(`[EVO Blast] Selesai — Terkirim: ${sent} | Gagal: ${failed}`);
  return { sent, failed, errors };
}

// ──────────────────────────────────────────────────────────────────────────────
// PRESET HELPERS — Fungsi siap pakai per jenis notifikasi
// ──────────────────────────────────────────────────────────────────────────────

/**
 * Kirim notifikasi tagihan jatuh tempo ke satu pelanggan.
 * @param {{ phone, name, amount, due_date }} customer
 */
async function notifyTagihan(customer) {
  const cfg = getConfig();
  const template =
    '🔔 Halo *{nama}*,\n\n' +
    'Tagihan internet Anda bulan ini sebesar *Rp {tagihan}* ' +
    'jatuh tempo pada *{tgl}*.\n\n' +
    'Mohon segera lakukan pembayaran agar layanan tetap aktif.\n' +
    'Terima kasih 🙏\n\n_RT/RW NET Billing_';

  const message = interpolate(template, {
    nama: customer.name,
    tagihan: Number(customer.amount || 0).toLocaleString('id-ID'),
    tgl: customer.due_date,
  });

  return sendSingleMessage(customer.phone, message, cfg);
}

/**
 * Kirim notifikasi suspend ke satu pelanggan.
 */
async function notifySuspend(customer) {
  const cfg = getConfig();
  const template =
    '⚠️ Halo *{nama}*,\n\n' +
    'Akun internet Anda telah *disuspend* karena tagihan *Rp {tagihan}* ' +
    'belum dibayar hingga *{tgl}*.\n\n' +
    'Silakan hubungi admin untuk melakukan pembayaran.\n' +
    '📞 _RT/RW NET Billing_';

  const message = interpolate(template, {
    nama: customer.name,
    tagihan: Number(customer.amount || 0).toLocaleString('id-ID'),
    tgl: customer.due_date,
  });

  return sendSingleMessage(customer.phone, message, cfg);
}

/**
 * Kirim konfirmasi pembayaran lunas.
 */
async function notifyLunas(customer) {
  const cfg = getConfig();
  const template =
    '✅ Halo *{nama}*,\n\n' +
    'Pembayaran tagihan Anda sebesar *Rp {tagihan}* telah *kami terima*.\n' +
    'Layanan internet Anda sudah aktif kembali 🚀\n\n' +
    'Terima kasih sudah membayar tepat waktu 😊\n_RT/RW NET Billing_';

  const message = interpolate(template, {
    nama: customer.name,
    tagihan: Number(customer.amount || 0).toLocaleString('id-ID'),
  });

  return sendSingleMessage(customer.phone, message, cfg);
}

// ──────────────────────────────────────────────────────────────────────────────
// Exports
// ──────────────────────────────────────────────────────────────────────────────
module.exports = {
  sendSingleMessage,
  sendBlastQueue,
  notifyTagihan,
  notifySuspend,
  notifyLunas,
  interpolate,
  normalizePhone,
  getConfig,
};
