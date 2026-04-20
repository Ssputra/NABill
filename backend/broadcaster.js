/**
 * RT/RW NET Billing — Real-Time SSE Broadcaster
 * Singleton yang menyimpan semua koneksi SSE aktif dan broadcast event ke semua client.
 *
 * CARA PAKAI:
 *   const broadcaster = require('./broadcaster');
 *   broadcaster.broadcast('customers', 'update', { id: 5 });
 */

const clients = new Map(); // clientId → res
let _nextId = 1;

/**
 * Tambahkan client SSE baru.
 * @param {import('express').Response} res
 * @returns {number} clientId
 */
function addClient(res) {
  const id = _nextId++;
  clients.set(id, res);
  console.log(`[SSE] Client #${id} connected. Total: ${clients.size}`);
  return id;
}

/**
 * Hapus client SSE (saat koneksi putus).
 * @param {number} id
 */
function removeClient(id) {
  clients.delete(id);
  console.log(`[SSE] Client #${id} disconnected. Total: ${clients.size}`);
}

/**
 * Broadcast event ke semua client yang terhubung.
 * @param {string} entity  - Entitas yang berubah: 'customers'|'transactions'|'tickets'|'inventory'|'deposits'|'ledger'|'users'|'agents'|'resellers'|'odp'
 * @param {string} action  - Aksi: 'create'|'update'|'delete'
 * @param {object} [data]  - Data tambahan (optional)
 */
function broadcast(entity, action, data = {}) {
  if (clients.size === 0) return;

  const payload = JSON.stringify({ entity, action, data, ts: Date.now() });
  const msg = `event: change\ndata: ${payload}\n\n`;

  let dead = [];
  clients.forEach((res, id) => {
    try {
      res.write(msg);
    } catch (e) {
      dead.push(id);
    }
  });

  // Cleanup dead connections
  dead.forEach(id => clients.delete(id));

  console.log(`[SSE] Broadcast → ${entity}:${action} to ${clients.size} client(s)`);
}

/**
 * Kirim ping ke semua client untuk menjaga koneksi tetap hidup.
 */
function sendHeartbeat() {
  const msg = `: heartbeat\n\n`;
  let dead = [];
  clients.forEach((res, id) => {
    try { res.write(msg); }
    catch (e) { dead.push(id); }
  });
  dead.forEach(id => clients.delete(id));
}

// Heartbeat setiap 25 detik untuk cegah timeout proxy/nginx
setInterval(sendHeartbeat, 25000);

module.exports = { addClient, removeClient, broadcast };
