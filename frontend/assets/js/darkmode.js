/**
 * darkmode.js — RT/RW NET Billing
 * Shared dark mode: inject into any page, adds CSS + toggle logic.
 * Usage: <script src="darkmode.js"></script>
 * Then add a button: <button id="darkModeBtn">...</button>
 */
(function() {
  const DM_KEY = 'rtrw_dark_mode';

  // ── Inject CSS ──────────────────────────────────────────────
  const style = document.createElement('style');
  style.textContent = `
    [data-theme='dark'] {
      --bg: #0f172a !important;
      --surface: #1e293b !important;
      --surface-alt: #0f172a !important;
      --text: #e2e8f0 !important;
      --muted: #94a3b8 !important;
      --border: rgba(71,85,105,0.5) !important;
      --shadow: 0 4px 24px -8px rgba(0,0,0,.4) !important;
    }
    [data-theme='dark'] body { background: #0f172a; color: #e2e8f0; }
    [data-theme='dark'] .topbar { background: #1e293b !important; border-bottom-color: rgba(71,85,105,0.5) !important; box-shadow: 0 2px 16px rgba(0,0,0,.3) !important; }
    [data-theme='dark'] .card, [data-theme='dark'] .card-header { background: #1e293b !important; border-color: rgba(71,85,105,0.5) !important; }
    [data-theme='dark'] .card-header { border-bottom-color: rgba(71,85,105,0.5) !important; }
    [data-theme='dark'] .card-body { background: #1e293b !important; }
    [data-theme='dark'] .card-footer { background: #0f172a !important; border-top-color: rgba(71,85,105,0.5) !important; }
    [data-theme='dark'] th { background: #0f172a !important; color: #94a3b8 !important; border-color: rgba(71,85,105,0.5) !important; }
    [data-theme='dark'] td { border-bottom-color: rgba(71,85,105,0.3) !important; color: #e2e8f0 !important; }
    [data-theme='dark'] tr:hover td { background: rgba(255,255,255,0.04) !important; }
    [data-theme='dark'] input, [data-theme='dark'] select, [data-theme='dark'] textarea {
      background: #0f172a !important; border-color: rgba(71,85,105,0.6) !important; color: #e2e8f0 !important;
    }
    [data-theme='dark'] input:focus, [data-theme='dark'] select:focus {
      border-color: #60a5fa !important; box-shadow: 0 0 0 3px rgba(96,165,250,0.15) !important;
    }
    /* ===== CUSTOM DARKMODE BUTTON (Tailwind 'rounded-xl' styling) ===== */
    .darkmode-btn, #darkModeBtn {
      width: 36px !important; height: 36px !important;
      border-radius: 12px !important; /* mirip rounded-xl di Tailwind */
      background: #ffffff !important;
      border: 1px solid rgba(0,0,0,0.08) !important;
      box-shadow: 0 1px 2px rgba(0,0,0,0.04) !important;
      color: #64748b !important;
      display: inline-flex !important; align-items: center !important; justify-content: center !important;
      cursor: pointer !important; transition: all .2s ease !important;
      font-size: 16px !important;
    }
    .darkmode-btn:hover, #darkModeBtn:hover {
      background: #f8fafc !important; color: #0f172a !important; border-color: rgba(0,0,0,0.12) !important;
    }

    [data-theme='dark'] .darkmode-btn, [data-theme='dark'] #darkModeBtn {
      background: #1e293b !important; border-color: rgba(255,255,255,0.08) !important; color: #94a3b8 !important;
    }
    [data-theme='dark'] .darkmode-btn:hover, [data-theme='dark'] #darkModeBtn:hover {
      background: #334155 !important; color: #e2e8f0 !important;
    }

    /* Original Darkmode styling for default components */
    [data-theme='dark'] .tb-icon-btn { background: #1e293b !important; border-color: rgba(71,85,105,0.5) !important; color: #94a3b8 !important; }
    [data-theme='dark'] .tb-icon-btn:hover { background: #334155 !important; color: #e2e8f0 !important; }
    [data-theme='dark'] .tab-btn { color: #94a3b8; }
    [data-theme='dark'] .tab-btn.active { background: #1e293b !important; color: #60a5fa !important; }
    [data-theme='dark'] .tabs { background: #0f172a !important; }
    [data-theme='dark'] .toggle-row { border-bottom-color: rgba(71,85,105,0.3) !important; }
    [data-theme='dark'] .conn-checking { background: rgba(100,116,139,.12) !important; border-color: rgba(71,85,105,0.4) !important; }
    [data-theme='dark'] .pg-btn { background: #1e293b !important; border-color: rgba(71,85,105,0.5) !important; color: #94a3b8 !important; }
    [data-theme='dark'] .pg-btn.active { background: #1d4ed8 !important; color: #fff !important; }
    [data-theme='dark'] .pill-aktif { background: rgba(34,197,94,0.15) !important; color: #86efac !important; }
    [data-theme='dark'] .pill-jatuh { background: rgba(239,68,68,0.15) !important; color: #fca5a5 !important; }
    [data-theme='dark'] .pill-suspend { background: rgba(245,158,11,0.15) !important; color: #fcd34d !important; }
    [data-theme='dark'] .btn-modal.cancel, [data-theme='dark'] .btn-test { background: #334155 !important; color: #94a3b8 !important; border-color: rgba(71,85,105,0.5) !important; }
    [data-theme='dark'] .action-btn { border-color: rgba(71,85,105,0.5) !important; color: #94a3b8 !important; }
    [data-theme='dark'] .action-btn.wa:hover { background: rgba(22,163,74,.15) !important; color: #86efac !important; }
    [data-theme='dark'] .action-btn.edit:hover { background: rgba(37,99,235,.15) !important; color: #93c5fd !important; }
    [data-theme='dark'] .action-btn.del:hover { background: rgba(220,38,38,.15) !important; color: #fca5a5 !important; }
    [data-theme='dark'] .search-input, [data-theme='dark'] .filter-sel {
      background: #0f172a !important; border-color: rgba(71,85,105,0.6) !important; color: #e2e8f0 !important;
    }
    [data-theme='dark'] .sum-box { background: #1e293b !important; border-color: rgba(71,85,105,0.5) !important; color: #e2e8f0 !important; }
    [data-theme='dark'] .form-group label { color: #94a3b8 !important; }
    [data-theme='dark'] .finance-item { border-bottom-color: rgba(71,85,105,0.3) !important; }
    [data-theme='dark'] .finance-item .fi-label { color: #94a3b8 !important; }
    [data-theme='dark'] .pagination { border-top-color: rgba(71,85,105,0.5) !important; }
    [data-theme='dark'] .card-toolbar { border-bottom-color: rgba(71,85,105,0.5) !important; }

    /* Smooth transitions */
    body, .card, .topbar, .modal, .confirm-box, th, td,
    input, select, textarea, .pg-btn, .tab-btn, .tabs,
    .tb-icon-btn, .action-btn, .pill-aktif, .pill-jatuh, .pill-suspend {
      transition: background-color .3s ease, border-color .3s ease, color .2s ease, box-shadow .3s ease;
    }
  `;
  document.head.appendChild(style);

  // ── Apply Theme ──────────────────────────────────────────────
  function applyTheme(dark) {
    document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
    localStorage.setItem(DM_KEY, dark ? '1' : '0');
    // Update all darkmode buttons on page with specific icons
    document.querySelectorAll('.darkmode-btn, #darkModeBtn').forEach(btn => {
      btn.innerHTML = dark
        ? '<i class="bi bi-sun"></i>'
        : '<i class="bi bi-moon-stars"></i>';
      btn.title = dark ? 'Mode Terang' : 'Mode Gelap';
    });
  }

  // Apply saved theme immediately (before DOMContentLoaded to avoid flash)
  applyTheme(localStorage.getItem(DM_KEY) === '1');

  // ── Bind buttons after DOM ready ─────────────────────────────
  function bindButtons() {
    document.querySelectorAll('.darkmode-btn, #darkModeBtn').forEach(btn => {
      btn.addEventListener('click', function() {
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        applyTheme(!isDark);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bindButtons);
  } else {
    bindButtons();
  }

  // Expose globally
  window.DarkMode = { apply: applyTheme };
})();
