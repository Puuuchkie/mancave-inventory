// Games module
const GamesPage = (() => {
  let allGames = [];
  let sortKey = 'title';
  let sortDir = 'asc';
  let editingId = null;
  let searchTerm = '';
  let filterPlatform = '';
  let filterCondition = '';
  let filterGenre = '';
  let filterFinished = '';
  let filterUnpriced = false;
  let selectedIds = new Set();
  let lastCheckedIdx = -1;

  const CONDITIONS = ['Sealed', 'Complete (CIB)', 'Manual Missing', 'Front Cover Missing', 'Loose', 'Box Only', 'Manual Only', 'Graded', 'Poor / Damaged'];
  const REGIONS = ['NTSC (USA)', 'NTSC-J (Japan)', 'PAL (Europe)', 'PAL-AU (Australia)', 'NTSC-U/C', 'Multi-Region'];
  const GENRES = ['Action', 'Action-Adventure', 'Adventure', 'Beat \'em Up', 'Fighting', 'Horror', 'JRPG', 'Platformer', 'Puzzle', 'Racing', 'RPG', 'Shoot \'em Up', 'Shooter (FPS)', 'Simulation', 'Sports', 'Strategy', 'Survival', 'Visual Novel', 'Other'];

  // Platform → available editions. Single-item arrays are auto-selected.
  const EDITIONS = {
    'PlayStation':              ['Black Label', 'Greatest Hits', 'Demo Disc', 'Limited Edition'],
    'PAL PlayStation':          ['Black Label', 'Platinum', 'Demo Disc', 'Limited Edition'],
    'Japan PlayStation':        ['Standard', 'The Best', 'Demo Disc', 'Limited Edition'],
    'PlayStation 2':            ['Black Label', 'Greatest Hits', 'Demo Disc', 'Limited Edition'],
    'PAL PlayStation 2':        ['Black Label', 'Platinum', 'Demo Disc', 'Limited Edition'],
    'Japan PlayStation 2':      ['Standard', 'The Best', 'Demo Disc', 'Limited Edition'],
    'PlayStation 3':            ['Standard', 'Greatest Hits', 'Game of the Year', 'Demo Disc', 'Limited Edition'],
    'PAL PlayStation 3':        ['Standard', 'Platinum', 'Demo Disc', 'Limited Edition'],
    'PlayStation 4':            ['Standard', 'Hits', 'Game of the Year', 'Limited Edition'],
    'PlayStation 5':            ['Standard', 'Limited Edition'],
    'PSP':                      ['Standard', 'Greatest Hits', 'Essentials'],
    'PS Vita':                  ['Standard', 'Essentials'],
    'NES':                      ['Standard'],
    'SNES':                     ['Standard'],
    'Nintendo 64':              ['Standard'],
    'GameCube':                 ['Standard', "Player's Choice", 'Limited Edition'],
    'Wii':                      ['Regular'],
    'Wii U':                    ['Standard', 'Nintendo Selects'],
    'Nintendo Switch':          ['Standard', 'Limited Edition'],
    'Game Boy':                 ['Standard'],
    'Game Boy Color':           ['Standard'],
    'Game Boy Advance':         ['Standard', "Player's Choice"],
    'Nintendo DS':              ['Standard', 'Nintendo Selects'],
    'Nintendo 3DS':             ['Standard', 'Nintendo Selects', 'Limited Edition'],
    'Xbox':                     ['Standard', 'Platinum Hits'],
    'Xbox 360':                 ['Standard', 'Platinum Hits', 'Classics'],
    'Xbox One':                 ['Standard', 'Game of the Year', 'Limited Edition'],
    'Xbox Series X/S':          ['Standard', 'Limited Edition'],
    'Sega Master System':       ['Standard'],
    'Sega Genesis / Mega Drive':['Standard'],
    'Sega Saturn':              ['Standard'],
    'Sega Dreamcast':           ['Standard'],
    'Game Gear':                ['Standard'],
    'Atari 2600':               ['Standard'],
    'Neo Geo':                  ['Standard'],
    'PC':                       ['Standard', 'Game of the Year', "Collector's Edition", 'Limited Edition'],
  };
  const DEFAULT_EDITIONS = ['Standard', 'Limited Edition', "Collector's Edition", 'Game of the Year'];

  function updateEditionOptions(platform, currentValue) {
    const sel = document.getElementById('gameEditionSelect');
    if (!sel) return;
    const editions = EDITIONS[platform] || DEFAULT_EDITIONS;
    sel.innerHTML = editions.map(e => `<option value="${esc(e)}">${esc(e)}</option>`).join('');
    if (currentValue && editions.includes(currentValue)) {
      sel.value = currentValue;
    } else if (editions.length === 1) {
      sel.value = editions[0];
    } else {
      sel.value = editions[0]; // default to first option
    }
  }

  let _psnConnected = false;

  async function load() {
    const tbody = document.getElementById('gamesTableBody');
    tbody.innerHTML = `<tr><td colspan="10" class="loading"><div class="spinner"></div> Loading...</td></tr>`;
    try {
      const params = {};
      if (searchTerm) params.search = searchTerm;
      if (filterPlatform) params.platform = filterPlatform;
      if (filterCondition) params.condition = filterCondition;
      if (filterGenre) params.genre = filterGenre;
      if (filterFinished !== '') params.finished = filterFinished;
      if (filterUnpriced) params.unpriced = 'true';

      allGames = await API.getGames(params);
      renderTable();
      updateFilterOptions();
    } catch (e) {
      toast(e.message, 'error');
    }
    // Show PSN buttons if connected (check once per load)
    if (!_psnConnected) {
      API.getPsnStatus().then(s => {
        _psnConnected = s.connected && !s.expired;
        document.getElementById('psnImportBtn')?.style.setProperty('display', _psnConnected ? '' : 'none');
        document.getElementById('psnSyncBtn')?.style.setProperty('display', _psnConnected ? '' : 'none');
      }).catch(() => {});
    }
  }

  async function updateFilterOptions() {
    try {
      const opts = await API.getGameOptions();
      const platSel = document.getElementById('filterGamePlatform');
      const conSel = document.getElementById('filterGameCondition');
      const genSel = document.getElementById('filterGameGenre');

      const currentPlat = platSel.value;
      const currentCon = conSel.value;
      const currentGen = genSel.value;

      platSel.innerHTML = '<option value="">All Platforms</option>' + opts.platforms.map(p => `<option value="${esc(p)}" ${p===currentPlat?'selected':''}>${esc(p)}</option>`).join('');
      conSel.innerHTML = '<option value="">All Conditions</option>' + opts.conditions.map(c => `<option value="${esc(c)}" ${c===currentCon?'selected':''}>${esc(c)}</option>`).join('');
      genSel.innerHTML = '<option value="">All Genres</option>' + opts.genres.map(g => `<option value="${esc(g)}" ${g===currentGen?'selected':''}>${esc(g)}</option>`).join('');
    } catch {}
  }

  function renderTable() {
    const tbody = document.getElementById('gamesTableBody');
    const sorted = sortData(allGames, sortKey, sortDir);
    document.getElementById('gamesCount').textContent = `${sorted.length} title${sorted.length !== 1 ? 's' : ''}`;

    if (!sorted.length) {
      tbody.innerHTML = `
        <tr><td colspan="12">
          <div class="empty-state">
            <div class="empty-icon">🎮</div>
            <p>No games found. Add your first game to get started!</p>
            <button class="btn btn-primary" onclick="GamesPage.openAdd()">+ Add Game</button>
          </div>
        </td></tr>`;
      updateBatchBar();
      return;
    }

    tbody.innerHTML = sorted.map(g => {
      const diff = priceDiff(g.price_paid, g.price_value, g.price_paid_currency, g.price_value_currency);
      const thumb = g.cover_url
        ? `<img src="${esc(g.cover_url)}" alt="" class="row-thumb" loading="lazy">`
        : `<div class="row-thumb-placeholder">🎮</div>`;
      const added = g.created_at ? g.created_at.slice(0, 7) : '—';
      const sel = selectedIds.has(g.id);
      return `<tr class="${sel ? 'row-selected' : ''}" onclick="if(!event.target.closest('.row-check,.row-actions'))GamesPage.openDetail(${g.id})">
        <td><input type="checkbox" class="row-check" data-id="${g.id}" ${sel ? 'checked' : ''}></td>
        <td class="td-thumb">${thumb}</td>
        <td>
          <div class="td-title">${esc(g.title)}</div>
          <div class="td-sub">${esc(g.developer || '')}${g.release_year ? ' · ' + g.release_year : ''}${g.trophy_pct != null ? ` · <span class="trophy-inline">🏆 ${g.trophy_pct}%</span>` : ''}</div>
        </td>
        <td>${platformBadge(g.platform)}</td>
        <td>${conditionBadge(g.condition)}</td>
        <td>${editionBadge(g.edition)}</td>
        <td>${regionBadge(g.region)}</td>
        <td>${g.ownership_type === 'digital' ? 'Digital' : 'Physical'}</td>
        <td>${g.quantity || 1}</td>
        <td>${g.price_paid != null ? `<span class="price-paid">${Currency.formatWithBase(g.price_paid, g.price_paid_currency)}</span>` : '—'}</td>
        <td>${g.price_value != null ? `<span class="price-value">${Currency.formatWithBase(g.price_value, g.price_value_currency)}</span>${diff ? '<br>' + diff : ''}` : '—'}</td>
        <td>${checkmark(g.finished)}</td>
        <td style="color:var(--text-muted);font-size:12px">${added}</td>
        <td onclick="event.stopPropagation()">
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm btn-icon" title="Refresh value" id="refreshBtn-${g.id}" onclick="GamesPage.refreshValue(${g.id}, '${esc(g.title).replace(/'/g, "\\'")}', '${esc(g.platform || '').replace(/'/g, "\\'")}', '${esc(g.condition || '').replace(/'/g, "\\'")}')">↻</button>
            <button class="btn btn-ghost btn-sm btn-icon" title="Edit" onclick="GamesPage.openEdit(${g.id})">✎</button>
            <button class="btn btn-ghost btn-sm btn-icon" title="Delete" onclick="GamesPage.deleteGame(${g.id}, '${esc(g.title)}')">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    // Update sort indicators
    document.querySelectorAll('#gamesTable thead th[data-sort]').forEach(th => {
      th.classList.toggle('sorted', th.dataset.sort === sortKey);
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = th.dataset.sort === sortKey ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
    });

    renderCards();
    updateBatchBar();
  }

  function renderCards() {
    const list = document.getElementById('gamesMobileList');
    if (!list) return;
    const sorted = sortData(allGames, sortKey, sortDir);
    if (!sorted.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">🎮</div><p>No games found. Tap + to add your first game!</p></div>`;
      return;
    }
    list.innerHTML = sorted.map(g => {
      const thumb = g.cover_url
        ? `<img src="${esc(g.cover_url)}" alt="" class="game-card-img" loading="lazy">`
        : `<div class="game-card-img-placeholder">🎮</div>`;
      const priceHtml = (g.price_paid != null || g.price_value != null)
        ? `<div class="game-card-price">
            ${g.price_paid  != null ? `<span class="price-paid">${Currency.formatWithBase(g.price_paid,  g.price_paid_currency)}</span>` : ''}
            ${g.price_value != null ? `<span class="price-value">${Currency.formatWithBase(g.price_value, g.price_value_currency)}</span>` : ''}
           </div>`
        : '';
      const trophyBar = g.trophy_pct != null
        ? `<div class="trophy-bar-wrap" title="${g.trophy_pct}% trophies"><div class="trophy-bar-fill" style="width:${g.trophy_pct}%"></div></div>`
        : '';
      const ownIcon = g.ownership_type === 'digital' ? '<span class="own-icon" style="font-size:11px">🌐</span> ' : '';
      return `<div class="game-card" onclick="GamesPage.openDetail(${g.id})">
        <div class="game-card-cover">${thumb}</div>
        <div class="game-card-body">
          <div class="game-card-title">${ownIcon}${esc(g.title)}</div>
          <div class="game-card-meta">${platformBadge(g.platform)}${g.condition ? ' ' + conditionBadge(g.condition) : ''}</div>
          ${priceHtml}
        </div>
        ${trophyBar}
        ${g.finished ? '<div class="game-card-check">✓</div>' : ''}
      </div>`;
    }).join('');
  }

  function updateBatchBar() {
    const bar = document.getElementById('gamesBatchBar');
    const cnt = document.getElementById('gamesBatchCount');
    if (!bar) return;
    if (selectedIds.size > 0) {
      bar.classList.add('visible');
      cnt.textContent = `${selectedIds.size} selected`;
    } else {
      bar.classList.remove('visible');
    }
    const allBox = document.getElementById('gamesSelectAll');
    if (allBox) allBox.checked = selectedIds.size > 0 && selectedIds.size === allGames.length;
  }

  function toggleSelect(id, checked) {
    if (checked) selectedIds.add(id); else selectedIds.delete(id);
    const row = document.querySelector(`#gamesTable .row-check[data-id="${id}"]`)?.closest('tr');
    if (row) row.classList.toggle('row-selected', checked);
    updateBatchBar();
  }

  function clearSelection() {
    selectedIds.clear();
    lastCheckedIdx = -1;
    renderTable();
  }

  async function batchDelete() {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} game${selectedIds.size > 1 ? 's' : ''}?`)) return;
    try {
      await API.batchDeleteGames([...selectedIds]);
      toast(`Deleted ${selectedIds.size} games`, 'success');
      selectedIds.clear();
      load();
      App.loadSidebarCounts();
    } catch (e) { toast(e.message, 'error'); }
  }

  function batchEdit() {
    if (!selectedIds.size) return;
    // Reset batch modal fields
    ['batchGamePlatform','batchGameEdition','batchGameWhere','batchGameDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['batchGameCondition','batchGameGenre','batchGameFinished','batchGamePaidCurrency','batchGameValueCurrency'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    populateBatchCurrencySelects();
    openModal('gamesBatchModal');
  }

  function populateBatchCurrencySelects() {
    ['batchGamePaidCurrency','batchGameValueCurrency'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      const keep = '<option value="">— Keep existing —</option>';
      Currency.populateSelect(el);
      el.insertAdjacentHTML('afterbegin', keep);
      el.value = '';
    });
  }

  async function saveBatchEdit() {
    const data = {
      platform:             document.getElementById('batchGamePlatform')?.value.trim() || null,
      condition:            document.getElementById('batchGameCondition')?.value || null,
      edition:              document.getElementById('batchGameEdition')?.value.trim() || null,
      genre:                document.getElementById('batchGameGenre')?.value || null,
      where_purchased:      document.getElementById('batchGameWhere')?.value.trim() || null,
      date_acquired:        document.getElementById('batchGameDate')?.value || null,
      finished:             document.getElementById('batchGameFinished')?.value === '' ? null : document.getElementById('batchGameFinished')?.value,
      price_paid_currency:  document.getElementById('batchGamePaidCurrency')?.value || null,
      price_value_currency: document.getElementById('batchGameValueCurrency')?.value || null,
    };
    // Remove nulls — only send fields that were actually set
    Object.keys(data).forEach(k => { if (data[k] === null || data[k] === '') delete data[k]; });
    if (!Object.keys(data).length) { toast('No fields filled in', 'error'); return; }
    try {
      const r = await API.batchEditGames([...selectedIds], data);
      toast(`Updated ${r.updated} games`, 'success');
      closeModal('gamesBatchModal');
      selectedIds.clear();
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  function setSort(key) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDir = 'asc'; }
    renderTable();
  }

  function setOwnership(type) {
    document.getElementById('ownershipTypeInput').value = type;
    document.querySelectorAll('#ownershipToggle .own-btn').forEach(b => b.classList.toggle('active', b.dataset.value === type));
    // Auto-set condition to Digital when switching to digital
    const condSel = document.getElementById('gameForm')?.elements?.condition;
    if (condSel) {
      if (type === 'digital' && (!condSel.value || condSel.value === 'Complete (CIB)' || condSel.value === 'Loose')) {
        condSel.value = 'Digital';
      } else if (type === 'physical' && condSel.value === 'Digital') {
        condSel.value = '';
      }
    }
  }

  function openAdd() {
    editingId = null;
    document.getElementById('gameModalTitle').textContent = 'Add Game';
    document.getElementById('gameForm').reset();
    setOwnership('physical');
    const coverUrlEl = document.getElementById('gameCoverUrl');
    if (coverUrlEl) coverUrlEl.value = '';
    const regionOverrideEl = document.getElementById('gameRegionOverride');
    if (regionOverrideEl) regionOverrideEl.value = '';
    document.getElementById('gameTitleInput').value = '';
    document.getElementById('gameTitleResults').innerHTML = '';
    const edSel = document.getElementById('gameEditionSelect');
    if (edSel) edSel.innerHTML = '<option value="">— Select platform first —</option>';
    renderStars(0);
    clearEbayStatus();
    Currency.populateSelect(document.getElementById('gamePaidCurrency'));
    Currency.populateSelect(document.getElementById('gameValueCurrency'));
    openModal('gameModal');
    setTimeout(() => document.getElementById('gamePlatformInput')?.focus(), 80);
  }

  async function openEdit(id) {
    editingId = id;

    document.getElementById('gameModalTitle').textContent = 'Edit Game';
    closeGamePicker();
    clearEbayStatus();
    try {
      const g = await API.getGame(id);
      fillForm(g);
      openModal('gameModal');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function openDetail(id) {
    try {
      const g = await API.getGame(id);
      const diff = priceDiff(g.price_paid, g.price_value);
      document.getElementById('gameDetailContent').innerHTML = `
        <div class="detail-hero">
          ${g.cover_url
            ? `<img src="${esc(g.cover_url)}" alt="" class="detail-cover">`
            : `<div class="detail-cover-placeholder">🎮</div>`}
          <div class="detail-hero-info">
            <div class="detail-hero-title">${esc(g.title)}</div>
            <div style="margin-top:6px">${platformBadge(g.platform)}${g.condition ? ' ' + conditionBadge(g.condition) : ''}</div>
            ${g.release_year ? `<div style="color:var(--text-muted);font-size:13px;margin-top:6px">${g.release_year}</div>` : ''}
          </div>
        </div>
        <div class="form-section">
          <div class="form-section-title">🎮 Game Info</div>
          <div class="detail-grid">
            <div class="detail-field"><span class="detail-field-label">Title</span><span class="detail-field-value" style="font-size:17px;font-weight:700">${esc(g.title)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Platform</span><span class="detail-field-value">${platformBadge(g.platform)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Developer</span><span class="detail-field-value">${esc(g.developer) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Publisher</span><span class="detail-field-value">${esc(g.publisher) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Genre</span><span class="detail-field-value">${esc(g.genre) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Release Year</span><span class="detail-field-value">${g.release_year || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Catalog Number</span><span class="detail-field-value">${esc(g.catalog_number) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Edition</span><span class="detail-field-value">${editionBadge(g.edition)}</span></div>
          </div>
        </div>
        <div class="form-section">
          <div class="form-section-title">📦 Condition</div>
          <div class="detail-grid">
            <div class="detail-field"><span class="detail-field-label">Format</span><span class="detail-field-value">${g.ownership_type === 'digital' ? '🌐 Digital' : '💿 Physical'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Condition</span><span class="detail-field-value">${conditionBadge(g.condition)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Region</span><span class="detail-field-value">${regionBadge(g.region)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Quantity</span><span class="detail-field-value">${g.quantity}</span></div>
          </div>
        </div>
        <div class="form-section">
          <div class="form-section-title">💰 Pricing</div>
          <div class="detail-grid">
            <div class="detail-field"><span class="detail-field-label">Price Paid</span><span class="detail-field-value" style="font-size:18px;font-weight:700">${Currency.formatWithBase(g.price_paid, g.price_paid_currency)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Market Value</span><span class="detail-field-value price-value" style="font-size:18px;font-weight:700">${Currency.formatWithBase(g.price_value, g.price_value_currency)}${diff ? '<br>' + diff : ''}</span></div>
          </div>
        </div>
        <div class="form-section">
          <div class="form-section-title">🎯 Personal</div>
          <div class="detail-grid">
            <div class="detail-field"><span class="detail-field-label">Finished / Played</span><span class="detail-field-value">${bool(g.finished) ? '✓ Yes' : '— No'}</span></div>
            ${g.trophy_pct != null ? `<div class="detail-field"><span class="detail-field-label">Trophy Progress</span><span class="detail-field-value"><span class="trophy-inline">🏆 ${g.trophy_pct}%</span></span></div>` : ''}
            <div class="detail-field"><span class="detail-field-label">Personal Rating</span><span class="detail-field-value">${starRating(g.personal_rating)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Date Acquired</span><span class="detail-field-value">${fmtDate(g.date_acquired)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Where Purchased</span><span class="detail-field-value">${esc(g.where_purchased) || '—'}</span></div>
          </div>
        </div>
        ${g.remarks ? `<div class="form-section"><div class="form-section-title">📝 Remarks</div><p style="color:var(--text-secondary);line-height:1.6">${esc(g.remarks)}</p></div>` : ''}
      `;
      document.getElementById('gameDetailEditBtn').onclick = () => { closeModal('gameDetailModal'); openEdit(id); };
      openModal('gameDetailModal');
    } catch (e) { toast(e.message, 'error'); }
  }

  function fillForm(g) {
    const f = document.getElementById('gameForm');
    const set = (name, val) => { const el = f.elements[name]; if (el) el.value = val ?? ''; };
    const setCheck = (name, val) => { const el = f.elements[name]; if (el) el.checked = bool(val); };

    document.getElementById('gameTitleInput').value = g.title || '';
    document.getElementById('gameTitleResults').innerHTML = '';

    // Platform is a select — if saved value isn't in the list, add it dynamically
    const platSel = document.getElementById('gamePlatformInput');
    if (platSel && g.platform) {
      platSel.value = g.platform;
      if (platSel.value !== g.platform) {
        platSel.add(new Option(g.platform, g.platform, true, true));
      }
    }
    set('condition', g.condition);
    set('quantity', g.quantity);

    // Edition: populate options for this platform, then select the saved value
    updateEditionOptions(g.platform || '', g.edition || '');
    set('genre', g.genre); set('developer', g.developer); set('publisher', g.publisher);
    set('release_year', g.release_year); set('catalog_number', g.catalog_number);
    setCheck('finished', g.finished);
    set('price_paid', g.price_paid);
    set('price_value', g.price_value);
    set('cover_url', g.cover_url);
    Currency.populateSelect(document.getElementById('gamePaidCurrency'), g.price_paid_currency);
    Currency.populateSelect(document.getElementById('gameValueCurrency'), g.price_value_currency);
    const statusEl = document.getElementById('gamePcUrlStatus');
    if (statusEl) statusEl.style.display = 'none';
    const regionOverrideEl = document.getElementById('gameRegionOverride');
    if (regionOverrideEl) regionOverrideEl.value = '';  // clear any prior URL-inferred region on edit
    set('date_acquired', g.date_acquired); set('where_purchased', g.where_purchased);
    set('remarks', g.remarks);
    renderStars(g.personal_rating || 0);
    document.getElementById('gameForm').dataset.rating = g.personal_rating || 0;
    setOwnership(g.ownership_type || 'physical');
  }

  function renderStars(n) {
    const clamped = Math.min(n, 5);
    document.querySelectorAll('.star').forEach((s, i) => {
      s.classList.toggle('active', i < clamped);
    });
    document.getElementById('gameForm').dataset.rating = clamped;
  }

  function regionFromPlatform(platform) {
    const p = (platform || '').toLowerCase();
    if (p.startsWith('pal ') || p.includes(' pal ')) return 'PAL (Europe)';
    if (p.startsWith('japan ') || p === 'famicom' || p === 'super famicom' || p.includes('japan ')) return 'NTSC-J (Japan)';
    return 'NTSC (USA)';
  }

  async function saveGame() {
    const f = document.getElementById('gameForm');
    const platform = f.elements.platform.value.trim();
    const data = {
      title: f.elements.title.value.trim(),
      platform,
      condition: f.elements.condition.value,
      edition: f.elements.edition.value.trim(),
      region: f.elements.region_override?.value || regionFromPlatform(platform),
      quantity: parseInt(f.elements.quantity.value) || 1,
      genre: f.elements.genre.value,
      developer: f.elements.developer.value.trim(),
      publisher: f.elements.publisher.value.trim(),
      release_year: parseInt(f.elements.release_year.value) || null,
      catalog_number: f.elements.catalog_number.value.trim(),
      finished: f.elements.finished.checked,
      personal_rating: parseInt(f.dataset.rating) || null,
      price_paid: parseFloat(f.elements.price_paid.value) || null,
      price_paid_currency: f.elements.price_paid_currency?.value || Currency.settings().base,
      price_value: parseFloat(f.elements.price_value?.value) || null,
      price_value_currency: f.elements.price_value_currency?.value || Currency.settings().base,
      pricecharting_id: null,
      cover_url: f.elements.cover_url?.value || null,
      date_acquired: f.elements.date_acquired.value || null,
      where_purchased: f.elements.where_purchased.value.trim(),
      remarks: f.elements.remarks.value.trim(),
      ownership_type: f.elements.ownership_type?.value || 'physical',
    };

    if (!data.title || !data.platform) {
      toast('Title and platform are required', 'error'); return;
    }
    if (!data.condition && data.ownership_type !== 'digital') {
      toast('Condition is required', 'error'); return;
    }
    if (data.ownership_type === 'digital' && !data.condition) data.condition = 'Digital';
    if (!data.edition) {
      toast('Edition / Print is required', 'error'); return;
    }
    if (!data.quantity || data.quantity < 1) {
      toast('Quantity must be at least 1', 'error'); return;
    }

    try {
      const saved = editingId
        ? await API.updateGame(editingId, data)
        : await API.createGame(data);
      closeModal('gameModal');
      toast(editingId ? 'Game updated!' : 'Game added!', 'success');
      load();
      App.loadSidebarCounts();
      // Auto-fetch price from PriceCharting only if no value was manually set
      if (saved?.id && !data.price_value) {
        API.applyPrice({ query: data.title, platform: data.platform, condition: data.condition, item_type: 'games', item_id: saved.id })
          .then(r => { if (r?.price != null) { toast(`Market value: $${r.price} (PriceCharting)`, 'success'); load(); } })
          .catch(() => {}); // silent — user can use URL lookup if search fails
      }
    } catch (e) { toast(e.message, 'error'); }
  }

  async function deleteGame(id, title) {
    if (!confirm(`Delete "${title}"?`)) return;
    try {
      await API.deleteGame(id);
      toast('Game deleted', 'success');
      load();
      App.loadSidebarCounts();
    } catch (e) { toast(e.message, 'error'); }
  }

  // ===== GAME PICKER =====
  let acResults = [];
  let pickerTimer = null;

  function openGamePicker() {
    document.getElementById('gameTitleInput')?.focus();
  }

  function closeGamePicker() {
    const panel = document.getElementById('gameTitleResults');
    if (panel) panel.innerHTML = '';
    acResults = [];
  }

  async function fetchPickerResults(q) {
    const container = document.getElementById('gameTitleResults');
    container.innerHTML = '<div class="picker-hint"><div class="spinner" style="width:14px;height:14px;border-width:2px;display:inline-block;vertical-align:middle;margin-right:8px"></div>Searching…</div>';
    try {
      const platform = document.getElementById('gamePlatformInput')?.value.trim() || '';
      acResults = await API.searchGameDB(q, platform || undefined);
      if (!acResults.length) {
        container.innerHTML = '<div class="picker-hint">No results — try different keywords</div>';
        return;
      }
      container.innerHTML = acResults.map((g, i) => `
        <div class="picker-item" data-index="${i}">
          ${g.cover_url
            ? `<img class="autocomplete-thumb" src="${esc(g.cover_url)}" alt="" loading="lazy">`
            : `<div class="autocomplete-thumb-placeholder">🎮</div>`}
          <div style="flex:1;min-width:0">
            <div class="autocomplete-name">${esc(g.name)}</div>
            <div class="autocomplete-meta">${g.year ? g.year + ' · ' : ''}${(g.platforms || []).slice(0, 4).join(', ')}</div>
          </div>
        </div>`).join('');
      container.querySelectorAll('.picker-item').forEach((el, i) => {
        el.addEventListener('click', () => { pickGame(i); closeGamePicker(); });
      });
    } catch (e) {
      const hint = e.message.includes('not configured')
        ? 'Add your IGDB credentials in ⚙ Settings to enable game search'
        : esc(e.message);
      container.innerHTML = `<div class="picker-hint" style="color:var(--text-muted)">${hint}</div>`;
    }
  }

  async function pickGame(index) {
    const item = acResults[index];
    if (!item) return;
    document.getElementById('gameTitleInput').value = item.name;
    document.getElementById('gameTitleResults').innerHTML = '';
    const coverEl = document.getElementById('gameCoverUrl');
    if (coverEl) coverEl.value = item.cover_url || '';
    document.getElementById('acInlineSpinner').style.display = '';
    try {
      const details = await API.getGameDetails(item.id);
      fillFromDB(details);
    } catch (e) {
      toast('Could not load full details — title was set', 'info');
    } finally {
      document.getElementById('acInlineSpinner').style.display = 'none';
    }
  }

  // Map IGDB genre names to our dropdown values.
  // IGDB returns e.g. "Platform", "Role-playing (RPG)" — our select has "Platformer", "RPG".
  function mapIgdbGenre(igdbGenre) {
    if (!igdbGenre) return null;
    const g = igdbGenre.toLowerCase();
    if (g.includes('hack and slash') || g.includes('beat')) return "Beat 'em Up";
    if (g.includes('shoot') && (g.includes("'em") || g.includes('em up'))) return "Shoot 'em Up";
    if (g.includes('shooter') || g.includes('first-person')) return 'Shooter (FPS)';
    if (g.includes('action-adventure') || g.includes('action adventure')) return 'Action-Adventure';
    if (g.includes('visual novel')) return 'Visual Novel';
    if (g.includes('role-playing') || (g.includes('rpg') && !g.includes('jrpg'))) return 'RPG';
    if (g.includes('jrpg')) return 'JRPG';
    if (g.includes('platform')) return 'Platformer';
    if (g.includes('simulat')) return 'Simulation';
    if (g.includes('sport')) return 'Sports';
    if (g.includes('strateg') || g.includes('rts') || g.includes('tbs') || g.includes('tactical')) return 'Strategy';
    if (g.includes('surviv')) return 'Survival';
    if (g.includes('horror')) return 'Horror';
    if (g.includes('action')) return 'Action';
    if (g.includes('adventure')) return 'Adventure';
    if (g.includes('fighting')) return 'Fighting';
    if (g.includes('puzzle')) return 'Puzzle';
    if (g.includes('racing')) return 'Racing';
    return null; // don't force an 'Other' — let user pick manually
  }

  function fillFromDB(g) {
    const f = document.getElementById('gameForm');
    function flash(name, value) {
      const el = name === 'genre' ? f.querySelector('[name="genre"]') : f.elements[name];
      if (!el || value === null || value === undefined || value === '') return;
      el.value = value;
      el.classList.add('autofill-flash');
      setTimeout(() => el.classList.remove('autofill-flash'), 700);
    }
    // Title and platform are NOT overwritten here — title was set from item.name in
    // pickGame (preserving the regional variant the user selected), and platform was
    // chosen by the user before the search.
    flash('genre', mapIgdbGenre(g.genre));
    flash('developer', g.developer);
    flash('publisher', g.publisher);
    flash('release_year', g.year);
    toast(`Auto-filled from IGDB: ${document.getElementById('gameTitleInput').value}`, 'success');
  }

  // Look up a game on IGDB and return { canonicalTitle, updates } where updates contains
  // only the fields that are empty in the DB record and have a value from IGDB.
  async function igdbEnrich(game) {
    const results = await API.searchGameDB(game.title, game.platform || undefined);
    if (!results?.length) return { canonicalTitle: game.title, updates: {} };
    const match = results.find(r => r.name.toLowerCase() === game.title.toLowerCase()) || results[0];
    const updates = {};
    if (match.name !== game.title) updates.title = match.name;
    const genre = mapIgdbGenre(match.genre);
    if (!game.genre && genre) updates.genre = genre;
    if (!game.developer && match.developer) updates.developer = match.developer;
    if (!game.publisher && match.publisher) updates.publisher = match.publisher;
    if (!game.release_year && match.year) updates.release_year = match.year;
    if (!game.cover_url && match.cover_url) updates.cover_url = match.cover_url;
    return { canonicalTitle: match.name, updates };
  }

  async function refreshValue(id, title, platform, condition) {
    const btn = document.getElementById(`refreshBtn-${id}`);
    if (btn) { btn.disabled = true; btn.textContent = '⟳'; }
    try {
      const game = await API.getGame(id);

      // 1. IGDB lookup: get canonical title + fill any empty metadata fields
      let canonicalTitle = title;
      try {
        const { canonicalTitle: ct, updates } = await igdbEnrich(game);
        canonicalTitle = ct;
        if (Object.keys(updates).length) await API.updateGame(id, { ...game, ...updates });
      } catch {} // IGDB not configured — skip

      // 2. Fetch PC price using the IGDB-normalised title
      const priceResult = await API.applyPrice({ query: canonicalTitle, platform, condition, item_type: 'games', item_id: id });
      if (priceResult?.price != null) toast(`Value updated: ${Currency.format(priceResult.price, 'USD')}`, 'success');

      load();
    } catch (e) {
      toast(`Refresh failed: ${e.message}`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '↻'; }
    }
  }

  async function refreshAllValues() {
    const btn = document.getElementById('refreshAllGameValues');
    if (btn) { btn.disabled = true; btn.textContent = '↻ Refreshing…'; }
    let updated = 0, failed = 0;
    for (let i = 0; i < allGames.length; i++) {
      const g = allGames[i];
      if (btn) btn.textContent = `↻ ${i + 1}/${allGames.length}…`;
      try {
        let canonicalTitle = g.title;
        try {
          const { canonicalTitle: ct, updates } = await igdbEnrich(g);
          canonicalTitle = ct;
          if (Object.keys(updates).length) await API.updateGame(g.id, { ...g, ...updates });
        } catch {}
        await API.applyPrice({ query: canonicalTitle, platform: g.platform, condition: g.condition, item_type: 'games', item_id: g.id });
        updated++;
      } catch { failed++; }
      // Pace requests to avoid rate-limiting (600ms gap between each game)
      if (i < allGames.length - 1) await new Promise(r => setTimeout(r, 600));
    }
    toast(`Updated ${updated}${failed ? `, ${failed} failed` : ''} values`, updated > 0 ? 'success' : 'error');
    if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh All Values'; }
    load();
  }

  // ── PSN Import ────────────────────────────────────────────────────────────────
  let _psnImportGames = [];

  async function openPsnImport() {
    document.getElementById('psnImportLoading').style.display = '';
    document.getElementById('psnImportContent').style.display = 'none';
    document.getElementById('psnImportError').style.display = 'none';
    document.getElementById('psnImportConfirmBtn').style.display = 'none';
    openModal('psnImportModal');

    try {
      const { games, totalPlayed } = await API.getPsnImportPreview();
      _psnImportGames = games;

      const newCount = games.filter(g => !g.alreadyInLibrary).length;
      document.getElementById('psnImportMeta').textContent =
        `${games.length} games found · ${newCount} not in library · ${games.length - newCount} already added`;

      document.getElementById('psnImportList').innerHTML = games.map((g, i) => {
        const img = g.imageUrl
          ? `<img src="${esc(g.imageUrl)}" alt="" style="width:48px;height:48px;object-fit:cover;border-radius:4px;flex-shrink:0">`
          : `<div style="width:48px;height:48px;background:var(--bg-elevated);border-radius:4px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px">🎮</div>`;
        const trophyBadge = g.trophyPct != null
          ? `<span class="trophy-inline" style="font-size:11px">🏆 ${g.trophyPct}%</span>` : '';
        const serviceTag = g.service === 'ps_plus' ? '<span style="font-size:10px;background:var(--accent-dim);color:var(--accent);padding:1px 5px;border-radius:3px;margin-left:4px">PS+</span>' : '';
        const alreadyTag = g.alreadyInLibrary ? '<span style="font-size:10px;color:var(--text-muted);margin-left:4px">in library</span>' : '';
        return `<label class="psn-import-row ${g.alreadyInLibrary ? 'psn-already' : ''}">
          <input type="checkbox" class="psn-import-check" data-index="${i}" ${g.alreadyInLibrary ? '' : 'checked'} ${g.alreadyInLibrary ? 'disabled' : ''}>
          ${img}
          <div style="flex:1;min-width:0">
            <div style="font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(g.name)}${serviceTag}${alreadyTag}</div>
            <div style="font-size:12px;color:var(--text-muted);margin-top:2px">${esc(g.platform)} ${trophyBadge}</div>
          </div>
        </label>`;
      }).join('');

      document.getElementById('psnImportLoading').style.display = 'none';
      document.getElementById('psnImportContent').style.display = '';
      if (newCount > 0) {
        const btn = document.getElementById('psnImportConfirmBtn');
        btn.textContent = `Import ${newCount} Games`;
        btn.style.display = '';
      }
    } catch (err) {
      document.getElementById('psnImportLoading').style.display = 'none';
      document.getElementById('psnImportError').style.display = '';
      document.getElementById('psnImportError').textContent = '✕ ' + err.message;
    }
  }

  function closePsnImport() {
    closeModal('psnImportModal');
  }

  function psnSelectAll(checked) {
    document.querySelectorAll('.psn-import-check:not([disabled])').forEach(cb => cb.checked = checked);
  }

  async function confirmPsnImport() {
    const selected = [...document.querySelectorAll('.psn-import-check:checked:not([disabled])')].map(cb => _psnImportGames[parseInt(cb.dataset.index)]);
    if (!selected.length) { toast('No games selected', 'error'); return; }
    const btn = document.getElementById('psnImportConfirmBtn');
    btn.disabled = true; btn.textContent = 'Importing…';
    try {
      const r = await API.importPsnGames(selected);
      toast(`Imported ${r.imported} games from PSN!`, 'success');
      closeModal('psnImportModal');
      load();
      App.loadSidebarCounts();
    } catch (e) { toast(e.message, 'error'); }
    finally { btn.disabled = false; }
  }

  async function syncTrophies() {
    const btn = document.getElementById('psnSyncBtn');
    if (btn) { btn.disabled = true; btn.textContent = '🏆 Syncing…'; }
    try {
      const r = await API.syncPsnTrophies();
      let msg = `Synced ${r.synced} trophy score${r.synced !== 1 ? 's' : ''}`;
      if (r.autoFinished) msg += ` · ${r.autoFinished} auto-marked finished`;
      toast(msg, 'success');
      load();
    } catch (e) { toast(e.message, 'error'); }
    finally { if (btn) { btn.disabled = false; btn.textContent = '🏆 Sync Trophies'; } }
  }

  function clearEbayStatus() {
    const status = document.getElementById('gamePcUrlStatus');
    if (status) status.style.display = 'none';
  }


  async function handlePcUrl(url, titleInput, statusEl, fillFn) {
    statusEl.style.display = ''; statusEl.style.color = 'var(--text-muted)'; statusEl.textContent = '⟳ Fetching from PriceCharting…';
    titleInput.disabled = true;
    try {
      const f = document.getElementById('gameForm');
      const condition = f?.elements?.condition?.value || '';
      const r = await API.fetchPriceFromUrl({ url, condition });
      if (r.title) titleInput.value = r.title;
      fillFn(r);
      statusEl.style.color = 'var(--green)';
      const parts = [r.title, r.consoleName].filter(Boolean).join(' / ');
      statusEl.textContent = `✓ ${parts}${r.price != null ? ` — $${r.price}` : ''}`;
    } catch (e) {
      statusEl.style.color = 'var(--red)'; statusEl.textContent = '✕ ' + e.message;
      titleInput.value = '';
    } finally {
      titleInput.disabled = false; titleInput.focus();
    }
  }

  function initGamePicker() {
    const titleInput = document.getElementById('gameTitleInput');
    if (!titleInput) return;
    titleInput.addEventListener('input', () => {
      clearTimeout(pickerTimer);
      const q = titleInput.value.trim();
      const panel = document.getElementById('gameTitleResults');
      const statusEl = document.getElementById('gamePcUrlStatus');

      // Detect a PriceCharting URL paste
      if (/^https?:\/\/(www\.)?pricecharting\.com\//i.test(q)) {
        panel.innerHTML = '';
        handlePcUrl(q, titleInput, statusEl, r => {
          // Fill platform from consoleName
          if (r.consoleName) {
            const platSel = document.getElementById('gamePlatformInput');
            if (platSel) {
              platSel.value = r.consoleName;
              if (platSel.value !== r.consoleName) platSel.add(new Option(r.consoleName, r.consoleName, true, true));
              platSel.dispatchEvent(new Event('change'));
            }
          }
          // Store region inferred from URL path (overrides regionFromPlatform at save time)
          const regionOverrideEl = document.getElementById('gameRegionOverride');
          if (regionOverrideEl && r.region) regionOverrideEl.value = r.region;
          // Fill price_value
          if (r.price != null) {
            const pvEl = document.getElementById('gamePriceValue');
            if (pvEl) { pvEl.value = r.price; pvEl.dispatchEvent(new Event('input')); }
          }
        });
        return;
      }

      if (statusEl) statusEl.style.display = 'none';
      if (q.length < 2) { panel.innerHTML = ''; return; }
      pickerTimer = setTimeout(() => fetchPickerResults(q), 350);
    });
    // Dismiss results when clicking outside
    document.addEventListener('click', e => {
      if (!titleInput.contains(e.target) && !document.getElementById('gameTitleResults')?.contains(e.target)) {
        const panel = document.getElementById('gameTitleResults');
        if (panel) panel.innerHTML = '';
      }
    });
  }

  function initEditionPicker() {
    const platInput = document.getElementById('gamePlatformInput');
    if (!platInput) return;
    let edTimer;
    platInput.addEventListener('input', () => {
      clearTimeout(edTimer);
      edTimer = setTimeout(() => updateEditionOptions(platInput.value.trim()), 300);
    });
    platInput.addEventListener('change', () => updateEditionOptions(platInput.value.trim()));
  }

  function init() {
    // Search
    const searchInput = document.getElementById('gamesSearch');
    searchInput?.addEventListener('input', debounce(e => {
      searchTerm = e.target.value.trim();
      load();
    }, 300));

    // Filters
    document.getElementById('filterGamePlatform')?.addEventListener('change', e => { filterPlatform = e.target.value; load(); });
    document.getElementById('filterGameCondition')?.addEventListener('change', e => { filterCondition = e.target.value; load(); });
    document.getElementById('filterGameGenre')?.addEventListener('change', e => { filterGenre = e.target.value; load(); });

    // Finished filter chips
    document.querySelectorAll('[data-finished-filter]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-finished-filter]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filterFinished = chip.dataset.finishedFilter;
        load();
      });
    });

    // Unpriced filter chip
    document.getElementById('filterUnpricedChip')?.addEventListener('click', () => {
      filterUnpriced = !filterUnpriced;
      document.getElementById('filterUnpricedChip').classList.toggle('active', filterUnpriced);
      load();
    });

    // Table sort
    document.querySelectorAll('#gamesTable thead th[data-sort]').forEach(th => {
      th.addEventListener('click', () => setSort(th.dataset.sort));
    });

    // Stars
    document.querySelectorAll('.star').forEach((star, i) => {
      star.addEventListener('click', () => renderStars(i + 1));
      star.addEventListener('dblclick', () => renderStars(0));
    });

    // Currency selects + live conversion preview
    function wireConversion(inputId, selectId, previewId) {
      const input = document.getElementById(inputId);
      const select = document.getElementById(selectId);
      const preview = document.getElementById(previewId);
      if (!input || !select || !preview) return;
      const update = () => {
        const p = Currency.preview(input.value, select.value);
        preview.textContent = p ? '≈ ' + p : '';
      };
      input.addEventListener('input', update);
      select.addEventListener('change', update);
    }
    wireConversion('gamePricePaid', 'gamePaidCurrency', 'gamePaidConversion');
    wireConversion('gamePriceValue', 'gameValueCurrency', 'gameValueConversion');

    // Select-all checkbox
    document.getElementById('gamesSelectAll')?.addEventListener('change', function () {
      if (this.checked) allGames.forEach(g => selectedIds.add(g.id));
      else selectedIds.clear();
      lastCheckedIdx = -1;
      renderTable();
    });

    // Checkbox click delegation (supports shift-select)
    document.getElementById('gamesTable')?.addEventListener('click', (e) => {
      const cb = e.target.closest('input.row-check');
      if (!cb) return;
      const id = parseInt(cb.dataset.id);
      const sorted = sortData(allGames, sortKey, sortDir);
      const idx = sorted.findIndex(g => g.id === id);

      if (e.shiftKey && lastCheckedIdx !== -1 && idx !== -1) {
        const from = Math.min(lastCheckedIdx, idx);
        const to = Math.max(lastCheckedIdx, idx);
        const shouldCheck = cb.checked;
        sorted.slice(from, to + 1).forEach(g => {
          if (shouldCheck) selectedIds.add(g.id);
          else selectedIds.delete(g.id);
        });
        renderTable();
      } else {
        if (cb.checked) selectedIds.add(id);
        else selectedIds.delete(id);
        if (idx !== -1) lastCheckedIdx = idx;
        const row = cb.closest('tr');
        if (row) row.classList.toggle('row-selected', cb.checked);
        updateBatchBar();
      }
    });

    // Batch save
    document.getElementById('saveGamesBatchBtn')?.addEventListener('click', saveBatchEdit);

    // Form submit
    document.getElementById('saveGameBtn')?.addEventListener('click', saveGame);

    // Close modals
    document.querySelectorAll('[data-close-modal]').forEach(el => {
      el.addEventListener('click', () => closeModal(el.dataset.closeModal));
    });

    // Close on overlay click
    document.getElementById('gameModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) { closeModal('gameModal'); closeGamePicker(); } });
    document.getElementById('gameDetailModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('gameDetailModal'); });

    // Catalog number lookup (PS1/PS2/PS3)
    initCatalogLookup();

    // Title picker + edition dropdown
    initGamePicker();
    initEditionPicker();
  }

  function initCatalogLookup() {
    const input = document.getElementById('gameCatalogNumber');
    if (!input) return;
    let timer;
    input.addEventListener('input', () => {
      clearTimeout(timer);
      const val = input.value.trim();
      if (val.length < 7) return; // too short to be a valid serial
      timer = setTimeout(() => catalogLookup(val), 500);
    });
  }

  async function catalogLookup(serial) {
    const f = document.getElementById('gameForm');
    try {
      const result = await API.lookupCatalog(serial);
      const titleEl = f.elements.title;
      const platformEl = f.elements.platform;
      if (titleEl) {
        titleEl.value = result.title;
        const disp = document.getElementById('gameTitleDisplay');
        if (disp) { disp.textContent = result.title; disp.classList.add('has-value'); }
      }
      if (platformEl) {
        platformEl.value = result.platform;
        updateEditionOptions(result.platform);
      }
      toast(`Catalog: ${result.title} (${result.platform})`, 'success');
    } catch {
      // 404 = not found, silently ignore (user will fill manually)
    }
  }

  return { init, load, openAdd, openEdit, openDetail, deleteGame, refreshValue, refreshAllValues, openGamePicker, closeGamePicker, toggleSelect, clearSelection, batchDelete, batchEdit, setOwnership, openPsnImport, closePsnImport, psnSelectAll, confirmPsnImport, syncTrophies };
})();
