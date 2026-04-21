/**
 * RT/RW NET Billing - API Client Helper
 * File ini digunakan oleh semua halaman HTML untuk berkomunikasi dengan backend.
 *
 * CARA PAKAI:
 *   Tambahkan di bagian <head>:
 *   <script src="api.js"></script>
 *
 * CATATAN:
 *   - Saat membuka via file://, backend harus running di port 3000.
 *   - Saat dibuka via http://localhost:3000/, API berjalan di origin yang sama.
 */

const API_BASE = window.location.protocol === 'file:' 
  ? 'http://localhost:3000/api' 
  : `${window.location.origin}/api`;

// ============================================================
// MOBILE RESPONSIVE SYSTEM — injected globally across all pages
// ============================================================
(function injectMobileStyles() {
  const css = `
    /* ===== HAMBURGER BUTTON ===== */
    .mob-toggle {
      display: none;
      position: fixed;
      top: 12px;
      left: 12px;
      z-index: 999;
      width: 40px;
      height: 40px;
      border-radius: 10px;
      background: #1d4ed8;
      border: none;
      cursor: pointer;
      align-items: center;
      justify-content: center;
      flex-direction: column;
      gap: 5px;
      box-shadow: 0 4px 16px rgba(29,78,216,.45);
      transition: background .2s;
    }
    .mob-toggle span {
      display: block;
      width: 20px;
      height: 2px;
      background: #fff;
      border-radius: 2px;
      transition: all .25s;
    }
    .mob-toggle.open span:nth-child(1) { transform: translateY(7px) rotate(45deg); }
    .mob-toggle.open span:nth-child(2) { opacity: 0; }
    .mob-toggle.open span:nth-child(3) { transform: translateY(-7px) rotate(-45deg); }

    /* ===== SIDEBAR OVERLAY ===== */
    .mob-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,.55);
      z-index: 98;
      backdrop-filter: blur(2px);
    }
    .mob-overlay.show { display: block; }

    /* ===== MOBILE BREAKPOINT ===== */
    @media (max-width: 768px) {
      /* Show hamburger */
      .mob-toggle { display: flex !important; }

      /* Sidebar off-canvas */
      .sidebar {
        transform: translateX(-100%);
        transition: transform .28s cubic-bezier(.4,0,.2,1);
        z-index: 99;
        box-shadow: none;
      }
      .sidebar.mob-open {
        transform: translateX(0);
        box-shadow: 8px 0 40px rgba(0,0,0,.35);
      }

      /* Main content full width */
      .main { margin-left: 0 !important; }

      /* Topbar: padding adjust for hamburger */
      .topbar { padding-left: 60px !important; flex-wrap: wrap; gap: 8px; }

      /* Topbar actions: smaller & wrap */
      .topbar-actions {
        flex-wrap: wrap;
        gap: 6px;
        width: 100%;
      }
      .topbar-actions .tb-btn span { display: none; }
      .topbar-actions .tb-btn { padding: 8px 10px; }
      .topbar-left h1 { font-size: 14px !important; }
      .topbar-left p  { font-size: 10px !important; }

      /* Stats grid: 2 columns */
      .stats-row {
        grid-template-columns: repeat(2, 1fr) !important;
      }
      .stat-card .stat-value { font-size: 18px !important; }

      /* Charts: single column */
      .charts-row, .bottom-row {
        grid-template-columns: 1fr !important;
      }

      /* Tables: scroll */
      .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; }
      table { min-width: 550px; }

      /* Content padding reduced */
      .content { padding: 12px !important; gap: 12px !important; }

      /* Cards */
      .card-body { padding: 12px !important; }
      .card-header { padding: 10px 14px !important; }
      .card-header h2 { font-size: 13px !important; }

      /* Filter bar */
      .filter-bar { flex-direction: column; gap: 6px; }
      .filter-bar select, .filter-bar input { width: 100%; }

      /* Nav section labels */
      .nav-label { font-size: 8px; }
      .nav-item { font-size: 11px; padding: 8px 10px; }
    }

    @media (max-width: 480px) {
      /* 1 column stats on very small screens */
      .stats-row { grid-template-columns: 1fr 1fr !important; }
      .stat-card { padding: 12px !important; }
      .stat-card .stat-value { font-size: 16px !important; }
      .topbar { padding: 10px 12px 10px 56px !important; }
    }
  `;
  const style = document.createElement('style');
  style.id = 'mob-responsive-css';
  style.textContent = css;
  document.head.appendChild(style);
})();

// ============================================================
// MOBILE SIDEBAR TOGGLE
// ============================================================
document.addEventListener('DOMContentLoaded', () => {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  // Create overlay
  const overlay = document.createElement('div');
  overlay.className = 'mob-overlay';
  overlay.id = 'mobOverlay';
  document.body.appendChild(overlay);

  // Create hamburger button
  const btn = document.createElement('button');
  btn.className = 'mob-toggle';
  btn.id = 'mobToggle';
  btn.setAttribute('aria-label', 'Toggle menu');
  btn.innerHTML = '<span></span><span></span><span></span>';
  document.body.appendChild(btn);

  function openSidebar() {
    sidebar.classList.add('mob-open');
    overlay.classList.add('show');
    btn.classList.add('open');
    document.body.style.overflow = 'hidden';
  }
  function closeSidebar() {
    sidebar.classList.remove('mob-open');
    overlay.classList.remove('show');
    btn.classList.remove('open');
    document.body.style.overflow = '';
  }

  btn.addEventListener('click', () => {
    sidebar.classList.contains('mob-open') ? closeSidebar() : openSidebar();
  });
  overlay.addEventListener('click', closeSidebar);

  // Close sidebar when a nav link is clicked (on mobile)
  sidebar.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) closeSidebar();
    });
  });

  // Handle resize: reset sidebar state when going back to desktop
  window.addEventListener('resize', () => {
    if (window.innerWidth > 768) {
      closeSidebar();
      document.body.style.overflow = '';
    }
  });
});

// ============================================================
// AUTH TOKEN MANAGEMENT
// ============================================================
const Auth = {
  get token() {
    return localStorage.getItem('billing_token') || sessionStorage.getItem('billing_token_session');
  },
  set token(v) {
    if (v) localStorage.setItem('billing_token', v);
    else {
      localStorage.removeItem('billing_token');
      sessionStorage.removeItem('billing_token_session');
    }
  },
  get user() {
    const u = localStorage.getItem('billing_user') || sessionStorage.getItem('billing_user_session');
    return u ? JSON.parse(u) : null;
  },
  set user(v) {
    if (v) localStorage.setItem('billing_user', JSON.stringify(v));
    else {
      localStorage.removeItem('billing_user');
      sessionStorage.removeItem('billing_user_session');
    }
  },
  isLoggedIn() {
    const token = this.token;
    if (!token) return false;
    // Validate offline token expiry
    if (token.startsWith('offline_')) {
      try {
        const payload = JSON.parse(atob(token.replace('offline_', '')));
        if (payload.exp && Date.now() > payload.exp) {
          this.logout();
          return false;
        }
      } catch { return false; }
    }
    return true;
  },
  logout() {
    localStorage.removeItem('billing_token');
    localStorage.removeItem('billing_user');
    sessionStorage.removeItem('billing_token_session');
    sessionStorage.removeItem('billing_user_session');
    window.location.href = getLoginUrl();
  }
};

// ============================================================
// HTTP HELPER
// ============================================================
async function apiRequest(method, path, body = null) {
  const headers = { 'Content-Type': 'application/json' };
  if (Auth.token) headers['Authorization'] = 'Bearer ' + Auth.token;

  const opts = { method, headers };
  if (body && method !== 'GET') opts.body = JSON.stringify(body);

  const res = await fetch(API_BASE + path, opts);

  // Redirect to login if unauthorized
  if (res.status === 401) {
    Auth.logout();
    return;
  }

  const data = await res.json().catch(() => ({ error: 'Invalid JSON response' }));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

const api = {
  get:    (path)         => apiRequest('GET',    path),
  post:   (path, body)   => apiRequest('POST',   path, body),
  put:    (path, body)   => apiRequest('PUT',    path, body),
  delete: (path)         => apiRequest('DELETE', path),

  // ---- Auth ----
  login(username, password) { return this.post('/auth/login', { username, password }); },
  me()                      { return this.get('/auth/me'); },

  // ---- Customers ----
  getCustomers(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get('/customers' + (q ? '?' + q : ''));
  },
  getCustomer(id)         { return this.get(`/customers/${id}`); },
  createCustomer(data)    { return this.post('/customers', data); },
  updateCustomer(id, data){ return this.put(`/customers/${id}`, data); },
  deleteCustomer(id)      { return this.delete(`/customers/${id}`); },
  syncMikrotik(id)        { return this.post(`/customers/${id}/sync-mikrotik`); },
  suspendCustomer(id)     { return this.post(`/customers/${id}/suspend`); },
  activateCustomer(id)    { return this.post(`/customers/${id}/activate`); },

  // ---- Transactions ----
  getTransactions(params = {}) {
    const q = new URLSearchParams(params).toString();
    return this.get('/transactions' + (q ? '?' + q : ''));
  },
  createTransaction(data) { return this.post('/transactions', data); },
  updateTransaction(id, data) { return this.put(`/transactions/${id}`, data); },
  deleteTransaction(id)   { return this.delete(`/transactions/${id}`); },

  // ---- MikroTik ----
  mikrotikStatus()        { return this.get('/mikrotik/status'); },
  mikrotikResources()     { return this.get('/mikrotik/resources'); },
  mikrotikInterfaces()    { return this.get('/mikrotik/interfaces'); },
  mikrotikTraffic(iface)  { return this.get('/mikrotik/traffic?interface=' + (iface || 'ether1')); },
  pppoeActive()           { return this.get('/mikrotik/pppoe/active'); },
  pppoeSecrets()          { return this.get('/mikrotik/pppoe/secrets'); },
  pppoeProfiles()         { return this.get('/mikrotik/pppoe/profiles'); },
  pppoeCreateSecret(data) { return this.post('/mikrotik/pppoe/secrets', data); },
  pppoeUpdateSecret(id, data) { return this.put(`/mikrotik/pppoe/secrets/${encodeURIComponent(id)}`, data); },
  pppoeDeleteSecret(id)   { return this.delete(`/mikrotik/pppoe/secrets/${encodeURIComponent(id)}`); },
  pppoeEnable(username)   { return this.post('/mikrotik/pppoe/enable', { username }); },
  pppoeDisable(username)  { return this.post('/mikrotik/pppoe/disable', { username }); },
  hotspotActive()         { return this.get('/mikrotik/hotspot/active'); },
  hotspotProfiles()       { return this.get('/mikrotik/hotspot/profiles'); },

  // ---- Reports ----
  reportSummary(month, year) {
    const q = new URLSearchParams({ month, year }).toString();
    return this.get('/reports/summary' + (q ? '?' + q : ''));
  },
  reportMonthly()         { return this.get('/reports/monthly'); },
  reportByPaket()         { return this.get('/reports/by-paket'); },
  overdueCustomers()      { return this.get('/reports/overdue-customers'); },
  exportExcel(month, year) {
    // Redirect download
    const q = new URLSearchParams({ month, year }).toString();
    window.open(API_BASE + '/reports/export/excel?' + q, '_blank');
  },
  getSettings()           { return this.get('/settings'); },
  updateSettings(data)    { return this.post('/settings', data); },
};

// ============================================================
// BACKWARD COMPATIBILITY
// ============================================================
// Provide a global apiFetch for compatibility with pages that still use it
window.apiFetch = async function(endpoint, options = {}) {
  // endpoint might be '/api/deposits', but API_BASE is already '/api'
  // So we strip '/api' if it's there.
  let path = endpoint.startsWith('/api') ? endpoint.slice(4) : endpoint;
  
  const method = options.method || 'GET';
  let body = null;
  if (options.body) {
     try { body = typeof options.body === 'string' ? JSON.parse(options.body) : options.body; } catch(e) { body = options.body; }
  }
  return await apiRequest(method, path, body);
};

// ============================================================
// FORMATTING UTILS
// ============================================================
const fmt = {
  currency(n) {
    return 'Rp ' + (parseInt(n) || 0).toLocaleString('id-ID');
  },
  date(str) {
    if (!str) return '-';
    const d = new Date(str);
    return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  dateShort(str) {
    if (!str) return '-';
    return str.slice(0, 10);
  },
};

// ============================================================
// LOGIN URL HELPER — Works for both file:// and http:// server
// ============================================================
function getLoginUrl() {
  const loc = window.location;
  // file:// protocol — use relative path
  if (loc.protocol === 'file:') {
    // Get the directory of the current file and append login.html
    const parts = loc.pathname.split('/');
    parts[parts.length - 1] = 'login.html';
    return loc.protocol + '//' + parts.join('/');
  }
  // http/https — use root-relative path or same directory
  // Check if we're in a subdirectory
  const pathParts = loc.pathname.split('/').filter(Boolean);
  if (pathParts.length > 1) {
    // In a subdirectory — go to login.html in same folder
    const dir = loc.pathname.substring(0, loc.pathname.lastIndexOf('/') + 1);
    return dir + 'login.html';
  }
  return '/login.html';
}

// ============================================================
// AUTO AUTH CHECK & ROLE-BASED ACCESS CONTROL (RBAC)
// ============================================================
(function autoAuthCheck() {
  const page = window.location.pathname.split('/').pop() || 'index.html';
  const publicPages = ['login.html', ''];
  if (!publicPages.includes(page) && !Auth.isLoggedIn()) {
    console.warn('[API] Belum login — redirect ke login.html');
    window.location.href = getLoginUrl();
    return;
  }

  // Apply RBAC UI logic after DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    const user = Auth.user;
    if (!user) return;
    
    const badge = document.getElementById('brandBadge');
    
    // Admin access
    if (user.role === 'admin') {
      if (badge) badge.style.display = 'none';
      return; 
    }

    // Role: Kasir
    if (user.role === 'kasir') {
      if (badge) badge.style.display = 'none';
      const allowedKasirPages = ['index.html', 'customers.html', 'cs-portal.html', 'kasir.html', 'laporan.html', 'setoran.html', 'stok.html', 'whatsapp.html', 'payment.html', 'pppoe.html'];
      
      document.querySelectorAll('.sidebar .nav-item').forEach(el => {
        const href = el.getAttribute('href') || '';
        if (href && !allowedKasirPages.some(a => href.includes(a))) {
          el.style.display = 'none';
        }
      });
    }

    // Role: Teknisi
    if (user.role === 'teknisi') {
      if (badge) badge.style.display = 'none';
      const allowedTeknisiPages = ['index.html', 'customers.html', 'pppoe.html', 'hotspot.html', 'map.html', 'odc.html'];
      
      document.querySelectorAll('.sidebar .nav-item').forEach(el => {
        const href = el.getAttribute('href') || '';
        if (href && !allowedTeknisiPages.some(a => href.includes(a))) {
          el.style.display = 'none';
        }
      });
    }

    // Hide empty sections
    document.querySelectorAll('.sidebar .nav-section').forEach(sec => {
      const visibleItems = sec.querySelectorAll('.nav-item[style!="display: none;"]');
      if (visibleItems.length === 0) {
        sec.style.display = 'none';
      }
    });
    
    // Globally update top-left brand name based on ISP Name (from settings/localStorage)
    const cachedIsp = localStorage.getItem('app_isp_name');
    if (cachedIsp) {
      document.querySelectorAll('.brand-name').forEach(el => el.textContent = cachedIsp);
    }
    // Asynchronously fetch fresh settings to keep brand name updated globally
    setTimeout(async () => {
      if (Auth.isLoggedIn()) {
        try {
          const res = await fetch(API_BASE + '/api/settings', {
            headers: { 'Authorization': 'Bearer ' + Auth.token }
          });
          if (res.ok) {
            const json = await res.json();
            if (json && json.success && json.data && json.data.isp_name) {
              if (json.data.isp_name !== cachedIsp) {
                localStorage.setItem('app_isp_name', json.data.isp_name);
                document.querySelectorAll('.brand-name').forEach(el => el.textContent = json.data.isp_name);
              }
            }
          }
        } catch(e) {}
      }
    }, 500);
    
    // Force inject NABill brand label globally to bypass rigid layout cache issues
    const brandContainer = document.querySelector('.sidebar-brand > div');
    if (brandContainer && !brandContainer.innerHTML.includes('supported by NABill')) {
      const brandLabel = document.createElement('div');
      brandLabel.className = 'brand-sub';
      brandLabel.style.fontSize = '8px';
      brandLabel.style.marginTop = '2px';
      brandLabel.style.color = 'rgba(255,255,255,0.7)';
      brandLabel.innerHTML = 'supported by NABill (Net-Access Billing)';
      brandContainer.appendChild(brandLabel);
    }
  });
})();

console.log('[API] RT/RW NET Billing API Client loaded. Backend:', API_BASE);

// ============================================================
// REAL-TIME SSE CLIENT
// ============================================================
(function initRealtime() {
  // Jangan connect di halaman login atau jika tidak ada auth
  const page = window.location.pathname.split('/').pop() || 'index.html';
  if (page === 'login.html') return;

  // Tunggu sampai DOM & Auth siap
  document.addEventListener('DOMContentLoaded', () => {
    if (!Auth.isLoggedIn()) return;

    let es = null;
    let retryDelay = 3000;
    let retryTimer = null;

    // Mapping: entity → fungsi reload yang ada di halaman
    const reloadMap = {
      customers:    ['loadCustomers', 'renderAll', 'loadSummary', 'loadCharts'],
      transactions: ['loadRecent', 'loadSummary', 'renderAll', 'loadTransactions'],
      tickets:      ['loadTickets', 'renderTickets', 'loadSummary'],
      inventory:    ['loadInventory', 'loadItems'],
      deposits:     ['loadDeposits', 'loadSetoran'],
      ledger:       ['loadLedger', 'loadEntries'],
      users:        ['loadUsers'],
      agents:       ['loadAgents'],
      resellers:    ['loadResellers'],
      odp:          ['loadOdp', 'loadInfrastruktur'],
      attendance:   ['loadAttendance', 'loadAbsensi'],
      payment:      ['loadPaymentHistory', 'loadConfig'],
    };

    // Toast notifikasi ringan
    function showRealtimeToast(entity, action) {
      const labels = {
        customers: 'Pelanggan', transactions: 'Transaksi', tickets: 'Tiket',
        inventory: 'Stok', deposits: 'Setoran', ledger: 'Keuangan',
        users: 'Users', agents: 'Agen', resellers: 'Reseller', odp: 'Infrastruktur'
      };
      const icons  = { create: '✅', update: '🔄', delete: '🗑️' };
      const label  = labels[entity] || entity;
      const icon   = icons[action]  || '🔄';

      // Buat toast element
      let toast = document.getElementById('sseToast');
      if (!toast) {
        toast = document.createElement('div');
        toast.id = 'sseToast';
        toast.style.cssText = `
          position:fixed; bottom:20px; right:20px; z-index:9999;
          background:#1e293b; color:#e2e8f0; padding:10px 16px;
          border-radius:10px; font-size:12px; font-weight:600;
          display:flex; align-items:center; gap:8px;
          box-shadow:0 8px 24px rgba(0,0,0,.35);
          border-left:3px solid #2563eb;
          transition: opacity .3s, transform .3s;
          opacity:0; transform:translateY(10px); pointer-events:none;
        `;
        document.body.appendChild(toast);
      }

      toast.innerHTML = `${icon} <span>${label} diperbarui secara real-time</span>`;
      toast.style.opacity = '1';
      toast.style.transform = 'translateY(0)';

      clearTimeout(toast._timer);
      toast._timer = setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
      }, 2500);
    }

    // Trigger reload functions yang ada di window scope
    function triggerReload(entity) {
      const fns = reloadMap[entity] || [];
      let called = false;
      fns.forEach(fn => {
        if (typeof window[fn] === 'function') {
          try { window[fn](); called = true; }
          catch(e) { console.warn(`[SSE] ${fn} error:`, e); }
        }
      });
      return called;
    }

    function connect() {
      if (es) { es.close(); es = null; }

      const token = Auth.token;
      if (!token) return;

      // SSE dengan Authorization header tidak didukung browser native EventSource,
      // jadi kita kirim token via cookie (sudah ada auth_session cookie dari login backend)
      es = new EventSource('/api/events', { withCredentials: true });

      es.addEventListener('connected', (e) => {
        console.log('[SSE] Connected:', JSON.parse(e.data));
        retryDelay = 3000; // Reset retry delay
      });

      es.addEventListener('change', (e) => {
        try {
          const { entity, action, data } = JSON.parse(e.data);
          console.log(`[SSE] Change received → ${entity}:${action}`, data);

          const reloaded = triggerReload(entity);

          // Tampilkan toast jika fungsi reload ada
          if (reloaded) showRealtimeToast(entity, action);

        } catch (err) {
          console.warn('[SSE] Parse error:', err);
        }
      });

      es.onerror = () => {
        console.warn(`[SSE] Connection lost. Retrying in ${retryDelay/1000}s...`);
        es.close(); es = null;
        clearTimeout(retryTimer);
        retryTimer = setTimeout(() => {
          if (Auth.isLoggedIn()) connect();
        }, retryDelay);
        retryDelay = Math.min(retryDelay * 1.5, 30000); // Exponential backoff max 30s
      };
    }

    connect();

    // Reconnect saat tab kembali aktif (setelah lama di background)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && Auth.isLoggedIn() && !es) {
        console.log('[SSE] Tab visible again — reconnecting...');
        connect();
      }
    });
  });
})();

