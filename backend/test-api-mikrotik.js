require('dotenv').config();
const { createMikrotikClient } = require('./services/mikrotik');

async function testMikrotikConnection() {
  console.log('================================================');
  console.log('       TEST KONEKSI MIKROTIK NODEJS API         ');
  console.log('================================================\n');

  console.log('Memuat Konfigurasi...');
  const options = {
    host: process.env.MIKROTIK_HOST || '192.168.88.1',
    port: parseInt(process.env.MIKROTIK_PORT) || 8728,
    user: process.env.MIKROTIK_USER || 'admin',
    password: process.env.MIKROTIK_PASS || '',
    timeout: 10 // timeout 10 detik
  };

  console.log(`- IP / Host : ${options.host}`);
  console.log(`- Port      : ${options.port}`);
  console.log(`- User      : ${options.user}`);
  // Sembunyikan password
  console.log(`- Password  : ${options.password ? '****' : '(Kosong)'}`);
  console.log('\nMencoba terhubung...');

  const mikrotik = createMikrotikClient(options);

  try {
    // Test 1: Uji Ping / Identitas Router
    console.log('\n[Tahap 1] Mengirim request basic (Identity)...');
    const pingRes = await mikrotik.ping();
    if (pingRes.connected) {
      console.log('✅ BENAR! Berhasil masuk ke router.');
      console.log(`   └─ Identity Router: ${pingRes.identity}`);
    } else {
      console.log('❌ GAGAL! Router menolak atau tidak ditemukan.');
      console.log(`   └─ Reason: ${pingRes.error}`);
      return; // Berhenti jika bahkan ping saja gagal
    }

    // Test 2: Uji Tarik Data PPPoE Active
    console.log('\n[Tahap 2] Membaca data /ppp/active/print ...');
    const pppoeList = await mikrotik.getPPPoEActive();
    const pppoeCount = Array.isArray(pppoeList) ? pppoeList.length : 0;
    console.log(`✅ BENAR! Ditemukan ${pppoeCount} user PPPoE sedang online.`);

    // Test 3: Uji Tarik Data Hotspot Active
    console.log('\n[Tahap 3] Membaca data /ip/hotspot/active/print ...');
    const hotspotList = await mikrotik.getHotspotActive();
    const hotspotCount = Array.isArray(hotspotList) ? hotspotList.length : 0;
    console.log(`✅ BENAR! Ditemukan ${hotspotCount} user Hotspot sedang online.`);
    
    // Kesimpulan
    console.log('\n================================================');
    console.log('KESIMPULAN:');
    console.log('Koneksi tidak ada masalah.');
    console.log(`Total User Aktif Keseluruhan: ${pppoeCount + hotspotCount}`);
    console.log('================================================\n');

  } catch (err) {
    console.log('\n❌ GAGAL EKSEKUSI API!');
    console.log('================================================');
    console.log('Error MikroTik:');
    console.log(err);
    console.log('================================================\n');
    console.log('Saran Pengecekan:');
    console.log('1. Pastikan IP Host MikroTik sudah benar dan satu jaringan dengan server Node.js');
    console.log('2. Pastikan port API (default 8728) di MikroTik aktif (IP > Services)');
    console.log('3. Pastikan tidak ada Rule Firewall yang memblokir IP server Node.js ini menuju port 8728');
    console.log('4. Cek kredensial username & password');
  } finally {
    process.exit(0); // akhiri dengan elegan
  }
}

testMikrotikConnection();
