// Main app controller
const App = (() => {
  let currentPage = 'dashboard';

  function navigate(page, { replace = false } = {}) {
    currentPage = page;
    document.querySelectorAll('.page').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));

    // Update URL
    const url = '/' + (page === 'dashboard' ? '' : page);
    if (replace) history.replaceState({ page }, '', url);
    else history.pushState({ page }, '', url);

    const pageEl = document.getElementById(`page-${page}`);
    const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (pageEl) pageEl.classList.add('active');
    if (navEl) navEl.classList.add('active');

    // Update topbar title
    const titles = {
      dashboard: { title: 'Dashboard', sub: 'Collection overview' },
      games: { title: 'Games', sub: 'Your game library' },
      hardware: { title: 'Hardware', sub: 'Consoles, controllers & accessories' },
      settings: { title: 'Settings', sub: 'Configure your inventory' },
      logs: { title: 'Logs', sub: 'Activity and API request log' },
    };
    const info = titles[page] || {};
    document.getElementById('topbarTitle').textContent = info.title || '';
    document.getElementById('topbarSubtitle').textContent = info.sub || '';

    // Show/hide search and add button
    const searchWrap = document.getElementById('topbarSearchWrap');
    const addBtn = document.getElementById('topbarAddBtn');
    const fab = document.getElementById('gameFab');
    const isCollection = page === 'games' || page === 'hardware';
    searchWrap.style.display = isCollection ? '' : 'none';
    addBtn.style.display = isCollection ? '' : 'none';
    if (page === 'games')    addBtn.textContent = '+ Add Game';
    if (page === 'hardware') addBtn.textContent = '+ Add Hardware';
    if (fab) fab.style.display = page === 'games' ? '' : 'none';
    const hwFab = document.getElementById('hwFab');
    if (hwFab) hwFab.style.display = page === 'hardware' ? '' : 'none';

    // Sync search input between topbar and page search
    if (page === 'games') {
      searchWrap.querySelector('input').oninput = (e) => {
        const pageSearch = document.getElementById('gamesSearch');
        if (pageSearch) { pageSearch.value = e.target.value; pageSearch.dispatchEvent(new Event('input')); }
      };
    } else if (page === 'hardware') {
      searchWrap.querySelector('input').oninput = (e) => {
        const pageSearch = document.getElementById('hardwareSearch');
        if (pageSearch) { pageSearch.value = e.target.value; pageSearch.dispatchEvent(new Event('input')); }
      };
    }

    // Stop log auto-refresh when leaving the logs page
    if (page !== 'logs') LogsPage.stopAutoRefresh();

    // Load page data
    if (page === 'dashboard') Dashboard.load();
    else if (page === 'games') GamesPage.load();
    else if (page === 'hardware') HardwarePage.load();
    else if (page === 'settings') { loadSettings(); renderCurrencySettings(); renderPlatformSettings(); }
    else if (page === 'logs') { LogsPage.load(); LogsPage.startAutoRefresh(); }
  }

  async function loadSidebarCounts() {
    try {
      const [gStats, hStats] = await Promise.all([API.getGameStats(), API.getHardwareStats()]);
      const gBadge = document.getElementById('badge-games');
      const hBadge = document.getElementById('badge-hardware');
      if (gBadge) gBadge.textContent = gStats.total_titles;
      if (hBadge) hBadge.textContent = hStats.total_items;
    } catch {}
  }

  async function loadSettings() {
    try {
      const ebay = await API.getTokenStatus();
      const ebayEl = document.getElementById('tokenStatus');
      if (ebayEl) {
        ebayEl.className = `token-status ${ebay.configured ? 'ok' : 'missing'}`;
        ebayEl.textContent = ebay.configured ? '✓ App ID configured' : '✕ Not configured';
      }
    } catch {}
    try {
      const igdb = await API.checkIgdbKey();
      const el = document.getElementById('igdbStatus');
      if (el) {
        el.className = `token-status ${igdb.configured ? 'ok' : 'missing'}`;
        el.textContent = igdb.configured ? '✓ Credentials configured' : '✕ Not configured';
      }
    } catch {}
  }

  async function saveToken() {
    const token = document.getElementById('tokenInput').value.trim();
    if (!token) { toast('Please enter an App ID', 'error'); return; }
    try {
      await API.saveToken(token);
      document.getElementById('tokenInput').value = '';
      toast('eBay App ID saved!', 'success');
      loadSettings();
    } catch (e) { toast(e.message, 'error'); }
  }

  // ── IGDB ─────────────────────────────────────────────────────────────────────
  async function saveIgdbCredentials() {
    const clientId     = document.getElementById('igdbClientId')?.value.trim();
    const clientSecret = document.getElementById('igdbClientSecret')?.value.trim();
    if (!clientId || !clientSecret) { toast('Both Client ID and Client Secret are required', 'error'); return; }
    try {
      await API.saveIgdbKey({ client_id: clientId, client_secret: clientSecret });
      document.getElementById('igdbClientId').value = '';
      document.getElementById('igdbClientSecret').value = '';
      toast('IGDB credentials saved!', 'success');
      loadSettings();
    } catch (e) { toast(e.message, 'error'); }
  }

  // ── Platforms ───────────────────────────────────────────────────────────────
  function renderPlatformSettings() {
    const gridEl = document.getElementById('enabledPlatformsGrid');
    if (!gridEl) return;
    const enabled = Platforms.enabled();
    let html = '';
    Platforms.GROUPS.forEach(group => {
      html += `<div class="platform-group-label">${group.label}</div>`;
      html += group.platforms.map(p => {
        const on = enabled.includes(p);
        return `<div class="currency-chip${on ? ' selected' : ''}" data-platform="${p}" onclick="App.togglePlatformChip(this)">
          <div style="flex:1;min-width:0"><div class="cc-code">${p}</div></div>
          <div class="cc-check">${on ? '✓' : ''}</div>
        </div>`;
      }).join('');
    });
    gridEl.innerHTML = html;
  }

  function togglePlatformChip(el) {
    el.classList.toggle('selected');
    el.querySelector('.cc-check').textContent = el.classList.contains('selected') ? '✓' : '';
  }

  async function savePlatformSettings() {
    const enabled = [...document.querySelectorAll('#enabledPlatformsGrid .currency-chip.selected')].map(el => el.dataset.platform);
    if (!enabled.length) { toast('Select at least one platform', 'error'); return; }
    try {
      await API.savePlatformSettings({ enabled });
      await Platforms.load();
      toast('Platform settings saved!', 'success');
      renderPlatformSettings();
    } catch (e) { toast(e.message, 'error'); }
  }

  // ── Currencies ──────────────────────────────────────────────────────────────
  function renderCurrencySettings() {
    const { DEFS } = Currency;
    const cfg = Currency.settings();

    const baseEl = document.getElementById('baseCurrencySelect');
    if (baseEl) {
      baseEl.innerHTML = Object.entries(DEFS).map(([code, d]) =>
        `<option value="${code}" ${code === cfg.base ? 'selected' : ''}>${d.flag} ${code} — ${d.name}</option>`
      ).join('');
    }

    const gridEl = document.getElementById('enabledCurrenciesGrid');
    if (gridEl) {
      gridEl.innerHTML = Object.entries(DEFS).map(([code, d]) => {
        const on = cfg.enabled.includes(code);
        return `<div class="currency-chip${on ? ' selected' : ''}" data-code="${code}" onclick="App.toggleCurrencyChip(this)">
          <span class="cc-flag">${d.flag}</span>
          <div style="flex:1;min-width:0">
            <div class="cc-code">${code} <span style="color:var(--text-muted);font-weight:400">${d.symbol}</span></div>
            <div class="cc-name">${d.name}</div>
          </div>
          <div class="cc-check">${on ? '✓' : ''}</div>
        </div>`;
      }).join('');
    }

    const dateEl = document.getElementById('ratesDateLabel');
    if (dateEl) {
      API.getCurrencyRates().then(r => {
        if (r.date) dateEl.textContent = `Rates: ${r.date}`;
      }).catch(() => {});
    }
  }

  function toggleCurrencyChip(el) {
    el.classList.toggle('selected');
    const check = el.querySelector('.cc-check');
    check.textContent = el.classList.contains('selected') ? '✓' : '';
    const base = document.getElementById('baseCurrencySelect')?.value;
    if (el.dataset.code === base) {
      el.classList.add('selected');
      check.textContent = '✓';
    }
  }

  async function saveCurrencySettings() {
    const base = document.getElementById('baseCurrencySelect')?.value;
    const enabled = [...document.querySelectorAll('.currency-chip.selected')].map(el => el.dataset.code);
    if (!base || !enabled.length) { toast('Select at least one currency', 'error'); return; }
    try {
      await API.saveCurrencySettings({ base, enabled });
      await Currency.load();
      toast('Currency settings saved!', 'success');
      renderCurrencySettings();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function refreshRates() {
    const btn = document.getElementById('refreshRatesBtn');
    if (btn) { btn.disabled = true; btn.textContent = '↻ Refreshing…'; }
    try {
      await API.refreshRates();
      await Currency.load();
      toast('Exchange rates updated!', 'success');
      renderCurrencySettings();
    } catch (e) { toast(e.message, 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh Rates'; } }
  }

  function initDrawer() {
    const btn = document.getElementById('hamburgerBtn');
    const backdrop = document.getElementById('drawerBackdrop');
    const sidebar = document.querySelector('.sidebar');
    if (!btn) return;

    function openDrawer() {
      sidebar.classList.add('drawer-open');
      backdrop.classList.add('visible');
    }
    function closeDrawer() {
      sidebar.classList.remove('drawer-open');
      backdrop.classList.remove('visible');
    }

    btn.addEventListener('click', openDrawer);
    backdrop.addEventListener('click', closeDrawer);
    document.querySelectorAll('.nav-item').forEach(el => {
      el.addEventListener('click', closeDrawer);
    });
  }

  function init() {
    document.querySelectorAll('.nav-item[data-page]').forEach(el => {
      el.addEventListener('click', () => navigate(el.dataset.page));
    });

    document.getElementById('topbarAddBtn')?.addEventListener('click', () => {
      if (currentPage === 'games') GamesPage.openAdd();
      else if (currentPage === 'hardware') HardwarePage.openAdd();
    });
    document.getElementById('gameFab')?.addEventListener('click', () => GamesPage.openAdd());
    document.getElementById('hwFab')?.addEventListener('click', () => HardwarePage.openAdd());

    // Settings buttons
    document.getElementById('saveIgdbBtn')?.addEventListener('click', saveIgdbCredentials);
    document.getElementById('savePlatformsBtn')?.addEventListener('click', savePlatformSettings);
    document.getElementById('saveTokenBtn')?.addEventListener('click', saveToken);
    document.getElementById('saveCurrencyBtn')?.addEventListener('click', saveCurrencySettings);
    document.getElementById('refreshRatesBtn')?.addEventListener('click', refreshRates);
    document.getElementById('baseCurrencySelect')?.addEventListener('change', e => {
      document.querySelectorAll('.currency-chip').forEach(chip => {
        if (chip.dataset.code === e.target.value) {
          chip.classList.add('selected');
          chip.querySelector('.cc-check').textContent = '✓';
        }
      });
    });

    // Export links
    document.getElementById('exportGamesCsv')?.addEventListener('click',  () => { window.location.href = API.exportGames('csv');    });
    document.getElementById('exportGamesXlsx')?.addEventListener('click', () => { window.location.href = API.exportGames('xlsx');   });
    document.getElementById('exportHwCsv')?.addEventListener('click',     () => { window.location.href = API.exportHardware('csv'); });
    document.getElementById('exportHwXlsx')?.addEventListener('click',    () => { window.location.href = API.exportHardware('xlsx'); });

    // Import handlers
    function setupImport(inputId, statusId, apiFn, reloadFn) {
      document.getElementById(inputId)?.addEventListener('change', async function () {
        const file = this.files[0];
        if (!file) return;
        const statusEl = document.getElementById(statusId);
        statusEl.textContent = 'Reading…';
        statusEl.style.color = 'var(--text-muted)';
        const reader = new FileReader();
        reader.onload = async (e) => {
          const b64 = e.target.result.split(',')[1];
          try {
            statusEl.textContent = 'Importing…';
            const r = await apiFn(b64);
            statusEl.textContent = `✓ ${r.imported} imported${r.skipped ? `, ${r.skipped} skipped` : ''}`;
            statusEl.style.color = 'var(--green)';
            reloadFn();
            App.loadSidebarCounts();
          } catch (err) {
            statusEl.textContent = '✕ ' + err.message;
            statusEl.style.color = 'var(--red)';
          }
          this.value = '';
        };
        reader.readAsDataURL(file);
      });
    }
    setupImport('importGamesFile', 'importGamesStatus', API.importGames, GamesPage.load);
    setupImport('importHwFile',    'importHwStatus',    API.importHardware, HardwarePage.load);

    initDrawer();
    GamesPage.init();
    HardwarePage.init();
    LogsPage.init();

    // Handle browser back/forward
    window.addEventListener('popstate', e => {
      navigate(e.state?.page || 'dashboard', { replace: true });
    });

    // Determine initial page from URL
    const pathPage = window.location.pathname.replace(/^\//, '') || 'dashboard';
    const validPages = ['dashboard', 'games', 'hardware', 'settings', 'logs'];
    const initialPage = validPages.includes(pathPage) ? pathPage : 'dashboard';

    Platforms.load();
    navigate(initialPage, { replace: true });

    // Load currency in background; refresh dashboard totals when ready
    Currency.load().then(() => {
      if (currentPage === 'dashboard') Dashboard.load();
    }).catch(() => {});
  }

  return { init, navigate, loadSidebarCounts, toggleCurrencyChip, togglePlatformChip, saveIgdbCredentials };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
