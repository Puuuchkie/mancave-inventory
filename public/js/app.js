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
      dashboard:   { title: 'Dashboard',   sub: 'Collection overview' },
      games:       { title: 'Games',       sub: 'Your game library' },
      systems:     { title: 'Systems',     sub: 'Consoles & handheld systems' },
      controllers: { title: 'Controllers', sub: 'Gamepads, arcade sticks & light guns' },
      peripherals: { title: 'Peripherals', sub: 'Memory cards, cables, accessories & more' },
      forsale:     { title: 'For Sale',    sub: 'Active listings & sales history' },
      scan:        { title: 'Scan Game',  sub: 'Identify a game using your camera' },
      settings:    { title: 'Settings',   sub: 'Configure your inventory' },
      logs:        { title: 'Logs',        sub: 'Activity and API request log' },
    };
    const info = titles[page] || {};
    document.getElementById('topbarTitle').textContent = info.title || '';
    document.getElementById('topbarSubtitle').textContent = info.sub || '';

    // Show/hide search and add button
    const searchWrap = document.getElementById('topbarSearchWrap');
    const addBtn = document.getElementById('topbarAddBtn');
    const fab = document.getElementById('gameFab');
    const hwFab = document.getElementById('hwFab');
    const hwPages = ['systems', 'controllers', 'peripherals'];
    const isCollection = page === 'games' || hwPages.includes(page);
    searchWrap.style.display = isCollection ? '' : 'none';
    addBtn.style.display = (isCollection || page === 'forsale') ? '' : 'none';
    if (page === 'games')       addBtn.textContent = '+ Add Game';
    if (page === 'systems')     addBtn.textContent = '+ Add System';
    if (page === 'controllers') addBtn.textContent = '+ Add Controller';
    if (page === 'peripherals') addBtn.textContent = '+ Add Peripheral';
    if (page === 'forsale')     addBtn.textContent = '+ Create Listing';
    if (fab) fab.style.display = page === 'games' ? '' : 'none';
    if (hwFab) hwFab.style.display = hwPages.includes(page) ? '' : 'none';

    // Sync search input between topbar and page search
    const searchPageIds = { games: 'gamesSearch', systems: 'systemsSearch', controllers: 'controllersSearch', peripherals: 'peripheralsSearch' };
    if (searchPageIds[page]) {
      searchWrap.querySelector('input').oninput = (e) => {
        const ps = document.getElementById(searchPageIds[page]);
        if (ps) { ps.value = e.target.value; ps.dispatchEvent(new Event('input')); }
      };
    }

    // Stop log auto-refresh when leaving the logs page
    if (page !== 'logs') LogsPage.stopAutoRefresh();

    // Load page data
    if (page === 'dashboard')   Dashboard.load();
    else if (page === 'games')       GamesPage.load();
    else if (page === 'systems')     SystemsPage.load();
    else if (page === 'controllers') ControllersPage.load();
    else if (page === 'peripherals') PeripheralsPage.load();
    else if (page === 'forsale')     ForSalePage.load();
    else if (page === 'scan')        ScanPage.load();
    else if (page === 'settings') {
      loadSettings();
      // Load fresh data before rendering so chips are never empty due to a race
      Promise.all([Platforms.load(), Currency.load()])
        .finally(() => { renderCurrencySettings(); renderPlatformSettings(); });
    }
    else if (page === 'logs') { LogsPage.load(); LogsPage.startAutoRefresh(); }
  }

  async function loadSidebarCounts() {
    try {
      const [gStats, hStats, fsStats] = await Promise.all([API.getGameStats(), API.getHardwareStats(), API.getForSaleStats()]);
      const gBadge = document.getElementById('badge-games');
      if (gBadge) gBadge.textContent = gStats.total_titles;
      // Hardware category badges updated by each page's renderTable
      const sBadge = document.getElementById('badge-systems');
      const cBadge = document.getElementById('badge-controllers');
      const pBadge = document.getElementById('badge-peripherals');
      if (sBadge) sBadge.textContent = hStats.systems_count || 0;
      if (cBadge) cBadge.textContent = hStats.controllers_count || 0;
      if (pBadge) pBadge.textContent = hStats.peripherals_count || 0;
      const fsBadge = document.getElementById('badge-forsale');
      if (fsBadge) fsBadge.textContent = fsStats.listed_count || 0;
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
    const enabled = [...document.querySelectorAll('#enabledCurrenciesGrid .currency-chip.selected')].map(el => el.dataset.code).filter(Boolean);
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
      if (currentPage === 'games')       GamesPage.openAdd();
      else if (currentPage === 'systems')     SystemsPage.openAdd();
      else if (currentPage === 'controllers') ControllersPage.openAdd();
      else if (currentPage === 'peripherals') PeripheralsPage.openAdd();
      else if (currentPage === 'forsale')     ForSalePage.openCreate();
    });
    document.getElementById('gameFab')?.addEventListener('click', () => GamesPage.openAdd());
    document.getElementById('hwFab')?.addEventListener('click', () => {
      if (currentPage === 'systems')     SystemsPage.openAdd();
      else if (currentPage === 'controllers') ControllersPage.openAdd();
      else if (currentPage === 'peripherals') PeripheralsPage.openAdd();
    });

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

    // ── Import wizard ──────────────────────────────────────────────────────────

    // Maps common shorthand/legacy values to known platform names
    const PLATFORM_ABBREV = {
      'ps1':'PlayStation','psx':'PlayStation','psone':'PlayStation','playstation 1':'PlayStation',
      'ps2':'PlayStation 2','ps3':'PlayStation 3','ps4':'PlayStation 4','ps5':'PlayStation 5',
      'n64':'Nintendo 64','gc':'GameCube','ngc':'GameCube',
      'gba':'Game Boy Advance','gbc':'Game Boy Color','gb':'Game Boy',
      'nds':'Nintendo DS','3ds':'Nintendo 3DS',
      'switch':'Nintendo Switch','sw':'Nintendo Switch',
      'genesis':'Sega Genesis / Mega Drive','mega drive':'Sega Genesis / Mega Drive',
      'megadrive':'Sega Genesis / Mega Drive','md':'Sega Genesis / Mega Drive',
      'dc':'Sega Dreamcast','sms':'Sega Master System','gg':'Game Gear',
      'x360':'Xbox 360','xbone':'Xbox One','xsx':'Xbox Series X/S',
      'vita':'PS Vita','psv':'PS Vita',
    };

    function suggestValue(unknown, knownList) {
      const u = unknown.toLowerCase().trim();
      const uClean = u.replace(/[^a-z0-9 ]+/g, '').trim();
      // Direct abbreviation match
      if (PLATFORM_ABBREV[u])      return PLATFORM_ABBREV[u];
      if (PLATFORM_ABBREV[uClean]) return PLATFORM_ABBREV[uClean];
      // Case-insensitive exact
      const exact = knownList.find(k => k.toLowerCase() === u);
      if (exact) return exact;
      // Substring overlap
      let best = null, bestScore = 0;
      for (const k of knownList) {
        const kl = k.toLowerCase().replace(/[^a-z0-9 ]+/g, '');
        if (kl.includes(uClean) || uClean.includes(kl)) {
          const score = Math.min(uClean.length, kl.length) / Math.max(uClean.length, kl.length);
          if (score > bestScore) { best = k; bestScore = score; }
        }
      }
      return bestScore >= 0.5 ? best : null;
    }

    // Wizard state
    let _wizardB64 = null;
    let _wizardImportFn = null;
    let _wizardStatusEl = null;
    let _wizardReloadFn = null;

    function buildWizardBody(preview) {
      const colLabels = { platform: 'Platform', condition: 'Condition', region: 'Region', integrity: 'Integrity' };
      const container = document.getElementById('wizardMappings');
      container.innerHTML = '';

      for (const [col, unknowns] of Object.entries(preview.unknowns)) {
        const knownList = preview.known[col] || [];
        const section = document.createElement('div');
        section.className = 'wizard-section';
        section.innerHTML = `<div class="wizard-section-title">${esc(colLabels[col] || col)}</div>`;

        for (const unknown of unknowns) {
          const suggestion = suggestValue(unknown, knownList);
          const options = [`<option value="">— keep as-is —</option>`]
            .concat(knownList.map(k =>
              `<option value="${esc(k)}"${k === suggestion ? ' selected' : ''}>${esc(k)}</option>`
            )).join('');

          const row = document.createElement('div');
          row.className = 'wizard-row';
          row.innerHTML = `
            <div class="wizard-unknown" title="${esc(unknown)}">${esc(unknown)}</div>
            <div class="wizard-arrow">→</div>
            <select class="wizard-select" data-col="${esc(col)}" data-unknown="${esc(unknown)}">${options}</select>`;
          section.appendChild(row);
        }
        container.appendChild(section);
      }
    }

    function collectWizardMappings() {
      const mappings = {};
      document.querySelectorAll('#wizardMappings .wizard-select').forEach(sel => {
        if (!sel.value) return;
        const col = sel.dataset.col;
        const unknown = sel.dataset.unknown;
        if (!mappings[col]) mappings[col] = {};
        mappings[col][unknown] = sel.value;
      });
      return mappings;
    }

    async function runImport(b64, mappings, importFn, statusEl, reloadFn) {
      statusEl.textContent = 'Importing…';
      statusEl.style.color = 'var(--text-muted)';
      try {
        const r = await importFn(b64, mappings);
        statusEl.textContent = `✓ ${r.imported} imported${r.skipped ? `, ${r.skipped} skipped` : ''}`;
        statusEl.style.color = 'var(--green)';
        reloadFn();
        App.loadSidebarCounts();
      } catch (err) {
        statusEl.textContent = '✕ ' + err.message;
        statusEl.style.color = 'var(--red)';
      }
    }

    // Wire wizard buttons once
    document.getElementById('wizardCancelBtn').addEventListener('click', () => {
      document.getElementById('importWizardModal').classList.remove('open');
      document.body.style.overflow = '';
    });
    document.getElementById('wizardCancelBtn2').addEventListener('click', () => {
      document.getElementById('importWizardModal').classList.remove('open');
      document.body.style.overflow = '';
    });
    document.getElementById('wizardConfirmBtn').addEventListener('click', async () => {
      document.getElementById('importWizardModal').classList.remove('open');
      document.body.style.overflow = '';
      const mappings = collectWizardMappings();
      await runImport(_wizardB64, mappings, _wizardImportFn, _wizardStatusEl, _wizardReloadFn);
    });

    // Import handlers
    function setupImport(inputId, statusId, previewFn, importFn, reloadFn) {
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
            statusEl.textContent = 'Analysing…';
            const preview = await previewFn(b64);
            if (!Object.keys(preview.unknowns).length) {
              // Nothing to map — import directly
              await runImport(b64, {}, importFn, statusEl, reloadFn);
            } else {
              // Show wizard
              const totalUnknowns = Object.values(preview.unknowns).reduce((s, a) => s + a.length, 0);
              document.getElementById('wizardSubtitle').textContent =
                `${preview.rows} row${preview.rows !== 1 ? 's' : ''} ready · `
                + `${totalUnknowns} unrecognized value${totalUnknowns !== 1 ? 's' : ''} found. `
                + `Map them below or leave as-is to import unchanged.`;
              buildWizardBody(preview);
              document.getElementById('wizardConfirmBtn').textContent = `Import ${preview.rows} row${preview.rows !== 1 ? 's' : ''}`;
              _wizardB64 = b64;
              _wizardImportFn = importFn;
              _wizardStatusEl = statusEl;
              _wizardReloadFn = reloadFn;
              document.getElementById('importWizardModal').classList.add('open');
              document.body.style.overflow = 'hidden';
            }
          } catch (err) {
            statusEl.textContent = '✕ ' + err.message;
            statusEl.style.color = 'var(--red)';
          }
          this.value = '';
        };
        reader.readAsDataURL(file);
      });
    }
    setupImport('importGamesFile', 'importGamesStatus', API.previewGames,    API.importGames,    GamesPage.load);
    setupImport('importHwFile',    'importHwStatus',    API.previewHardware, API.importHardware, SystemsPage.load);

    initDrawer();
    GamesPage.init();
    SystemsPage.init();
    ControllersPage.init();
    PeripheralsPage.init();
    ForSalePage.init();
    ScanPage.init();
    LogsPage.init();

    // Handle browser back/forward
    window.addEventListener('popstate', e => {
      navigate(e.state?.page || 'dashboard', { replace: true });
    });

    // Determine initial page from URL
    const pathPage = window.location.pathname.replace(/^\//, '') || 'dashboard';
    const validPages = ['dashboard', 'games', 'systems', 'controllers', 'peripherals', 'forsale', 'scan', 'settings', 'logs'];
    const initialPage = validPages.includes(pathPage) ? pathPage : 'dashboard';

    Platforms.load();
    loadSidebarCounts();
    navigate(initialPage, { replace: true });

    // Load currency in background; refresh dashboard totals when ready
    Currency.load().then(() => {
      if (currentPage === 'dashboard') Dashboard.load();
    }).catch(() => {});
  }

  return { init, navigate, loadSidebarCounts, toggleCurrencyChip, togglePlatformChip, saveIgdbCredentials };
})();

document.addEventListener('DOMContentLoaded', () => App.init());
