const { RouterOSAPI } = require('node-routeros');
const config = require('../config');

// ============================================================
// MikroTik Service — Wrapper untuk RouterOS API
// ============================================================

class MikrotikService {
  constructor(options = {}) {
    this.options = {
      host: options.host || config.mikrotik.host,
      user: options.user || config.mikrotik.user,
      password: options.password || config.mikrotik.password,
      port: options.port || config.mikrotik.port,
      timeout: options.timeout || config.mikrotik.timeout,
    };
    this.client = null;
    this.connected = false;
  }

  // ---- Connect ----
  async connect() {
    return new Promise((resolve, reject) => {
      try {
        this.client = new RouterOSAPI({
          host: this.options.host,
          user: this.options.user,
          password: this.options.password,
          port: this.options.port,
          timeout: this.options.timeout,
        });

        // WAJIB: pasang error listener agar tidak crash saat timeout/disconnect
        this.client.on('error', (err) => {
          this.connected = false;
          // Error sudah ditangani — tidak perlu throw ke atas
        });

        this.client.connect()
          .then(() => {
            this.connected = true;
            resolve(true);
          })
          .catch((err) => {
            this.connected = false;
            reject(new Error(`MikroTik connect failed: ${err.message || err}`));
          });
      } catch (err) {
        reject(new Error(`MikroTik init error: ${err.message}`));
      }
    });
  }

  // ---- Disconnect ----
  async disconnect() {
    if (this.client && this.connected) {
      try {
        await this.client.close();
      } catch (_) {}
      this.connected = false;
    }
  }

  // ---- Run command safely ----
  async run(command, params = []) {
    if (!this.connected) await this.connect();
    
    // Fallback wrapper on timeout if `Channel` in node-routeros throws !empty and hangs the promise loop
    return new Promise((resolve, reject) => {
      let resolved = false;
      const timeoutSec = 2000; // Fast timeout 2s for hanging empty responses
      
      const timer = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          resolve([]); 
        }
      }, timeoutSec);

      this.client.write(command, params)
        .then((results) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            resolve(Array.isArray(results) ? results : (results ? [results] : []));
          }
        })
        .catch((err) => {
          if (!resolved) {
            resolved = true;
            clearTimeout(timer);
            reject(new Error(`MikroTik command error [${command}]: ${err.message}`));
          }
        });
    });
  }

  // ---- Ping / Status ----
  async ping() {
    try {
      await this.connect();
      const res = await this.run('/system/identity/print');
      await this.disconnect();
      return {
        connected: true,
        identity: res[0] ? res[0].name : 'Unknown',
        host: this.options.host,
      };
    } catch (err) {
      return { connected: false, error: err.message, host: this.options.host };
    }
  }

  // ---- System Resources ----
  async getResources() {
    try {
      await this.connect();
      const res = await this.run('/system/resource/print');
      await this.disconnect();
      if (!res || res.length === 0) throw new Error('Empty response');
      const r = res[0];
      return {
        uptime: r.uptime || '0s',
        cpu_load: parseInt(r['cpu-load']) || 0,
        free_memory: parseInt(r['free-memory']) || 0,
        total_memory: parseInt(r['total-memory']) || 0,
        free_hdd: parseInt(r['free-hdd-space']) || 0,
        total_hdd: parseInt(r['total-hdd-space']) || 0,
        architecture: r['architecture-name'] || 'unknown',
        board_name: r['board-name'] || 'unknown',
        version: r.version || 'unknown',
        platform: r.platform || 'MikroTik',
      };
    } catch (err) {
      throw new Error(`getResources: ${err.message}`);
    }
  }

  // ---- Interfaces ----
  async getInterfaces() {
    try {
      await this.connect();
      const interfaces = await this.run('/interface/print');
      await this.disconnect();
      return interfaces.map((iface) => ({
        name: iface.name,
        type: iface.type,
        mtu: iface.mtu,
        mac: iface['mac-address'],
        running: iface.running === 'true',
        disabled: iface.disabled === 'true',
        comment: iface.comment || '',
      }));
    } catch (err) {
      throw new Error(`getInterfaces: ${err.message}`);
    }
  }

  // ---- Traffic (bytes/sec) per interface ----
  async getTrafficData(interfaceName = 'ether1') {
    try {
      await this.connect();
      const res = await this.run('/interface/monitor-traffic', [
        `=interface=${interfaceName}`,
        `=once=`
      ]);
      await this.disconnect();
      if (!res || res.length === 0) return { rx: 0, tx: 0 };
      const r = res[0];
      return {
        interface: interfaceName,
        rx_bits: parseInt(r['rx-bits-per-second']) || 0,
        tx_bits: parseInt(r['tx-bits-per-second']) || 0,
        rx_bytes: Math.floor((parseInt(r['rx-bits-per-second']) || 0) / 8),
        tx_bytes: Math.floor((parseInt(r['tx-bits-per-second']) || 0) / 8),
      };
    } catch (err) {
      throw new Error(`getTrafficData: ${err.message}`);
    }
  }

  // ---- PPPoE Active Sessions ----
  async getPPPoEActive() {
    try {
      await this.connect();
      const cnt = await this.run('/ppp/active/print', ['=count-only=']);
      if (cnt && cnt[0] && cnt[0].ret === '0') {
        await this.disconnect();
        return [];
      }
      const sessions = await this.run('/ppp/active/print');
      await this.disconnect();
      return sessions.map((s) => ({
        id: s['.id'],
        name: s.name,
        service: s.service,
        caller_id: s['caller-id'] || '',
        address: s.address || '',
        uptime: s.uptime || '0s',
        encoding: s.encoding || '',
        session_id: s['session-id'] || '',
      }));
    } catch (err) {
      throw new Error(`getPPPoEActive: ${err.message}`);
    }
  }

  // ---- PPPoE Secrets (User List) ----
  async getPPPoESecrets() {
    try {
      await this.connect();
      // Count-only check: prevents !empty exception from node-routeros if list is empty
      const cnt = await this.run('/ppp/secret/print', ['=count-only=']);
      if (cnt && cnt[0] && cnt[0].ret === '0') {
        await this.disconnect();
        return [];
      }
      const secrets = await this.run('/ppp/secret/print');
      await this.disconnect();
      return secrets.map((s) => ({
        id: s['.id'],
        name: s.name,
        service: s.service || 'pppoe',
        profile: s.profile || 'default',
        disabled: s.disabled === 'true',
        comment: s.comment || '',
        caller_id: s['caller-id'] || '',
        last_logged_out: s['last-logged-out'] || '',
        routes: s.routes || '',
      }));
    } catch (err) {
      throw new Error(`getPPPoESecrets: ${err.message}`);
    }
  }

  // ---- Enable PPPoE User ----
  async enablePPPoEUser(username) {
    try {
      await this.connect();
      // find the .id first
      const secrets = await this.run('/ppp/secret/print', [`?name=${username}`]);
      if (!secrets || secrets.length === 0) throw new Error(`User PPPoE '${username}' tidak ditemukan`);
      const id = secrets[0]['.id'];
      await this.run('/ppp/secret/enable', [`=.id=${id}`]);
      await this.disconnect();
      return { success: true, message: `PPPoE user '${username}' berhasil diaktifkan` };
    } catch (err) {
      throw new Error(`enablePPPoEUser: ${err.message}`);
    }
  }

  // ---- Disable (Suspend) PPPoE User ----
  async disablePPPoEUser(username) {
    try {
      await this.connect();
      const secrets = await this.run('/ppp/secret/print', [`?name=${username}`]);
      if (!secrets || secrets.length === 0) throw new Error(`User PPPoE '${username}' tidak ditemukan`);
      const id = secrets[0]['.id'];
      // Also kick active session if any
      try {
        const active = await this.run('/ppp/active/print', [`?name=${username}`]);
        if (active && active.length > 0) {
          await this.run('/ppp/active/remove', [`=.id=${active[0]['.id']}`]);
        }
      } catch (_) {}
      await this.run('/ppp/secret/disable', [`=.id=${id}`]);
      await this.disconnect();
      return { success: true, message: `PPPoE user '${username}' berhasil di-suspend` };
    } catch (err) {
      throw new Error(`disablePPPoEUser: ${err.message}`);
    }
  }

  // ---- Ganti Profil ke Isolir (Suspend by Profile) ----
  async suspendPPPoEUser(username) {
    try {
      await this.connect();
      const secrets = await this.run('/ppp/secret/print', [`?name=${username}`]);
      if (!secrets || secrets.length === 0) throw new Error(`User PPPoE '${username}' tidak ditemukan`);
      const id = secrets[0]['.id'];
      
      let originalProfile = secrets[0]['profile'] || 'default';
      // Jangan simpan profil isolir sebagai "profil asli" jika dia sudah terisolir sebelumnya
      if (originalProfile.toLowerCase().includes('isolir')) {
        originalProfile = null;
      }
      
      // Kick active session if any so they redial and get the isolir IP
      try {
        const active = await this.run('/ppp/active/print', [`?name=${username}`]);
        if (active && active.length > 0) {
          await this.run('/ppp/active/remove', [`=.id=${active[0]['.id']}`]);
        }
      } catch (_) {}
      
      await this.run('/ppp/secret/set', [`=.id=${id}`, `=profile=Isolir-WA-2Mbps`]);
      await this.disconnect();
      return { success: true, originalProfile, message: `Profil PPPoE '${username}' berhasil diganti ke Isolir-WA-2Mbps` };
    } catch (err) {
      throw new Error(`suspendPPPoEUser: ${err.message}`);
    }
  }

  // ---- Kembalikan Profil ke Semula (Activate) ----
  async activatePPPoEUser(username, originalProfile = 'default') {
    try {
      await this.connect();
      const secrets = await this.run('/ppp/secret/print', [`?name=${username}`]);
      if (!secrets || secrets.length === 0) throw new Error(`User PPPoE '${username}' tidak ditemukan`);
      const id = secrets[0]['.id'];
      
      // Pastikan sistem TIDAK PERNAH mencoba mengembalikan pelanggan ke profil Isolir!
      let safeProfile = originalProfile;
      if (!safeProfile || safeProfile.toLowerCase().includes('isolir')) {
         safeProfile = 'default';
      }
      
      try {
        await this.run('/ppp/secret/set', [`=.id=${id}`, `=profile=${safeProfile}`]);
      } catch (err) {
        if (err.message && err.message.includes('does not match')) {
          // Fallback if the profile (customer.paket) doesn't exist in Mikrotik
          await this.run('/ppp/secret/set', [`=.id=${id}`, `=profile=default`]);
          console.log(`[Warning] Profile '${safeProfile}' not found, used 'default' for user ${username}`);
        } else {
          throw err;
        }
      }
      
      // Kick active session so they redial and get normal IP
      try {
        const active = await this.run('/ppp/active/print', [`?name=${username}`]);
        if (active && active.length > 0) {
          await this.run('/ppp/active/remove', [`=.id=${active[0]['.id']}`]);
        }
      } catch (_) {}

      await this.disconnect();
      return { success: true, message: `Profil PPPoE '${username}' berhasil dikembalikan ke '${originalProfile}'` };
    } catch (err) {
      throw new Error(`activatePPPoEUser: ${err.message}`);
    }
  }

  // ---- CRUD PPPoE Secrets ----
  async createPPPoESecret(data) {
    try {
      await this.connect();
      const params = [
        `=name=${data.username}`,
        `=password=${data.password}`,
        `=profile=${data.profile || 'default'}`,
        `=service=pppoe`
      ];
      if (data.comment) params.push(`=comment=${data.comment}`);
      
      const res = await this.run('/ppp/secret/add', params);
      await this.disconnect();
      return { success: true, data: res };
    } catch (err) {
      throw new Error(`createPPPoESecret: ${err.message}`);
    }
  }

  async updatePPPoESecret(id, data) {
    try {
      await this.connect();
      const params = [
        `=.id=${id}`,
        `=name=${data.username}`,
        `=profile=${data.profile || 'default'}`
      ];
      if (data.password) params.push(`=password=${data.password}`);
      if (data.comment !== undefined) params.push(`=comment=${data.comment}`);

      const res = await this.run('/ppp/secret/set', params);
      await this.disconnect();
      return { success: true, data: res };
    } catch (err) {
      throw new Error(`updatePPPoESecret: ${err.message}`);
    }
  }

  async removePPPoESecret(id) {
    try {
      await this.connect();
      const res = await this.run('/ppp/secret/remove', [`=.id=${id}`]);
      await this.disconnect();
      return { success: true, data: res };
    } catch (err) {
      throw new Error(`removePPPoESecret: ${err.message}`);
    }
  }

  // ---- PPP Profiles ----
  async getPPPProfiles() {
    try {
      await this.connect();
      const profiles = await this.run('/ppp/profile/print');
      await this.disconnect();
      return profiles.map(p => ({
        id: p['.id'],
        name: p.name,
        local_address: p['local-address'] || '',
        remote_address: p['remote-address'] || '',
        rate_limit: p['rate-limit'] || ''
      }));
    } catch (err) {
      throw new Error(`getPPPProfiles: ${err.message}`);
    }
  }

  // ---- Hotspot Active Sessions ----
  async getHotspotActive() {
    try {
      await this.connect();
      const cnt = await this.run('/ip/hotspot/active/print', ['=count-only=']);
      if (cnt && cnt[0] && cnt[0].ret === '0') {
        await this.disconnect();
        return [];
      }
      const sessions = await this.run('/ip/hotspot/active/print');
      await this.disconnect();
      return sessions.map((s) => ({
        id: s['.id'],
        user: s.user,
        server: s.server,
        mac: s['mac-address'],
        address: s.address || '',
        uptime: s.uptime || '0s',
        bytes_in: parseInt(s['bytes-in']) || 0,
        bytes_out: parseInt(s['bytes-out']) || 0,
        comment: s.comment || '',
      }));
    } catch (err) {
      throw new Error(`getHotspotActive: ${err.message}`);
    }
  }

  // ---- Hotspot Profiles ----
  async getHotspotUserProfiles() {
    try {
      await this.connect();
      // count-only to avoid !empty crash
      const cnt = await this.run('/ip/hotspot/user/profile/print', ['=count-only=']);
      if (cnt && cnt[0] && cnt[0].ret === '0') {
        await this.disconnect();
        return [];
      }
      const profiles = await this.run('/ip/hotspot/user/profile/print');
      await this.disconnect();
      return profiles.map(p => ({
        id: p['.id'],
        name: p.name,
        shared_users: p['shared-users'] || '1',
        rate_limit: p['rate-limit'] || '',
        mac_cookie: p['mac-cookie-timeout'] || '',
        comment: p.comment || ''
      }));
    } catch (err) {
      throw new Error(`getHotspotUserProfiles: ${err.message}`);
    }
  }

  // ---- IP Addresses ----
  async getIPAddresses() {
    try {
      await this.connect();
      const ips = await this.run('/ip/address/print');
      await this.disconnect();
      return ips.map((ip) => ({
        id: ip['.id'],
        address: ip.address,
        network: ip.network,
        interface: ip.interface,
        disabled: ip.disabled === 'true',
        comment: ip.comment || '',
      }));
    } catch (err) {
      throw new Error(`getIPAddresses: ${err.message}`);
    }
  }

  // ---- System Identity ----
  async getIdentity() {
    try {
      await this.connect();
      const res = await this.run('/system/identity/print');
      await this.disconnect();
      return res[0] ? { name: res[0].name } : { name: 'MikroTik' };
    } catch (err) {
      throw new Error(`getIdentity: ${err.message}`);
    }
  }
}

// Helper: buat instance sementara untuk satu request
function createMikrotikClient(options = {}) {
  return new MikrotikService(options);
}

module.exports = { MikrotikService, createMikrotikClient };
