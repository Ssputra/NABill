const db = require('./db');
const { createMikrotikClient } = require('./services/mikrotik');

async function runBillingChecks() {
  console.log('[Cron] Memulai pengecekan penagihan otomatis (Auto-Pilot)...');
  
  // Ambil semua pelanggan yang belum berhenti langganan dan punya tanggal jatuh tempo
  const customers = db.prepare("SELECT * FROM customers WHERE due_date IS NOT NULL AND status != 'Terminated'").all();
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  let countJatuhTempo = 0;
  let countIsolir = 0;
  let countDisable = 0;

  for (const c of customers) {
    const due = new Date(c.due_date);
    due.setHours(0, 0, 0, 0);
    
    const diffTime = today - due;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
    // diffDays > 0 artinya LEWAT TENGGAT. 
    // diffDays <= 0 artinya BELUM TENGGAT (contoh: -3 berarti 3 hari lagi).

    try {
      if (diffDays >= 7 && (!c.notes || !c.notes.includes('Hard Disable'))) {
        // TIER 3: Sudah lewat seminggu. Disable secret secara total (Tidak bisa WA).
        if (c.pppoe_username) {
          const mikrotik = createMikrotikClient(c.mikrotik_host ? { host: c.mikrotik_host } : {});
          await mikrotik.disablePPPoEUser(c.pppoe_username).catch(e => console.log(`[Cron] Skip err disable: ${e.message}`));
        }
        
        let newNotes = (c.notes || '') + ' [System: Hard Disable]';
        db.prepare(`UPDATE customers SET status = 'Suspend', notes = ? WHERE id = ?`).run(newNotes, c.id);
        console.log(`[Cron] H+${diffDays} DISABLE TOTAL eksekusi pada pelanggan: ${c.name}`);
        countDisable++;
      } 
      else if (diffDays > 0 && diffDays < 7 && c.status !== 'Suspend') {
        // TIER 2: Lewat 1-6 hari (Telat). Pindahkan ke Profil "Isolir-WA-2Mbps"
        let originalProfile = null;
        if (c.pppoe_username) {
          const mikrotik = createMikrotikClient(c.mikrotik_host ? { host: c.mikrotik_host } : {});
          const res = await mikrotik.suspendPPPoEUser(c.pppoe_username).catch(e => console.log(`[Cron] Skip err isolir: ${e.message}`));
          if (res && res.originalProfile) originalProfile = res.originalProfile;
        }
        
        db.prepare(`UPDATE customers SET status = 'Suspend', mikrotik_profile = COALESCE(?, mikrotik_profile) WHERE id = ?`).run(originalProfile, c.id);
        console.log(`[Cron] H+${diffDays} ISOLIR PROFIL eksekusi pada pelanggan: ${c.name}`);
        countIsolir++;
      } 
      else if (diffDays >= -3 && diffDays <= 0 && c.status === 'Aktif') {
        // TIER 1: Mepet tenggat (H-3 atau Hari H). Ubah warna teks jadi merah/Jatuh Tempo (Tanpa isolir internet)
        db.prepare(`UPDATE customers SET status = 'Jatuh Tempo' WHERE id = ?`).run(c.id);
        console.log(`[Cron] Peringatan Jatuh Tempo (H${diffDays}) untuk: ${c.name}`);
        countJatuhTempo++;
      }
    } catch (err) {
      console.error(`[Cron] Gagal memproses pelanggan ${c.name}:`, err.message);
    }
  }

  console.log(`[Cron] Pengecekan selesai. Update hari ini: ${countJatuhTempo} Jatuh Tempo, ${countIsolir} Isolir, ${countDisable} Disabled.`);
}

function startBillingDaemon() {
  // Jalankan segera saat server baru nyala
  setTimeout(runBillingChecks, 3000); 
  
  // Jalankan terus menerus setiap 4 Jam secara rahasia di latar belakang
  setInterval(runBillingChecks, 4 * 60 * 60 * 1000); 
}

module.exports = { startBillingDaemon };
