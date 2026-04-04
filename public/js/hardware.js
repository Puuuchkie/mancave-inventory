// Hardware module — factory-based so Systems, Controllers, Peripherals share one implementation
let _hwCommonInitDone = false;
let _activeHwPage = null; // which page instance owns the shared modal
let _suppressHwAutofill = false; // prevents autofill firing during fillForm

// Auto-fill defaults keyed by platform name (used for Systems category)
const PLATFORM_DEFAULTS = {
  // Nintendo home
  'NES':                       { type: 'Console',          manufacturer: 'Nintendo',  region: 'NTSC (USA)' },
  'PAL NES':                   { type: 'Console',          manufacturer: 'Nintendo',  region: 'PAL (Europe)' },
  'Famicom':                   { type: 'Console',          manufacturer: 'Nintendo',  region: 'NTSC-J (Japan)' },
  'SNES':                      { type: 'Console',          manufacturer: 'Nintendo',  region: 'NTSC (USA)' },
  'PAL SNES':                  { type: 'Console',          manufacturer: 'Nintendo',  region: 'PAL (Europe)' },
  'Super Famicom':             { type: 'Console',          manufacturer: 'Nintendo',  region: 'NTSC-J (Japan)' },
  'Nintendo 64':               { type: 'Console',          manufacturer: 'Nintendo',  region: 'NTSC (USA)' },
  'PAL Nintendo 64':           { type: 'Console',          manufacturer: 'Nintendo',  region: 'PAL (Europe)' },
  'Japan Nintendo 64':         { type: 'Console',          manufacturer: 'Nintendo',  region: 'NTSC-J (Japan)' },
  'GameCube':                  { type: 'Console',          manufacturer: 'Nintendo',  region: 'NTSC (USA)' },
  'PAL GameCube':              { type: 'Console',          manufacturer: 'Nintendo',  region: 'PAL (Europe)' },
  'Wii':                       { type: 'Console',          manufacturer: 'Nintendo',  region: 'NTSC (USA)' },
  'PAL Wii':                   { type: 'Console',          manufacturer: 'Nintendo',  region: 'PAL (Europe)' },
  'Wii U':                     { type: 'Console',          manufacturer: 'Nintendo',  region: 'NTSC (USA)' },
  'Nintendo Switch':           { type: 'Console',          manufacturer: 'Nintendo',  region: 'Multi-Region' },
  // Nintendo handheld
  'Game Boy':                  { type: 'Handheld Console', manufacturer: 'Nintendo',  region: 'NTSC (USA)' },
  'Game Boy Color':            { type: 'Handheld Console', manufacturer: 'Nintendo',  region: 'NTSC (USA)' },
  'Game Boy Advance':          { type: 'Handheld Console', manufacturer: 'Nintendo',  region: 'NTSC (USA)' },
  'Nintendo DS':               { type: 'Handheld Console', manufacturer: 'Nintendo',  region: 'NTSC (USA)' },
  'Nintendo 3DS':              { type: 'Handheld Console', manufacturer: 'Nintendo',  region: 'NTSC (USA)' },
  // Sony home
  'PlayStation':               { type: 'Console',          manufacturer: 'Sony',      region: 'NTSC (USA)' },
  'PAL PlayStation':           { type: 'Console',          manufacturer: 'Sony',      region: 'PAL (Europe)' },
  'Japan PlayStation':         { type: 'Console',          manufacturer: 'Sony',      region: 'NTSC-J (Japan)' },
  'PlayStation 2':             { type: 'Console',          manufacturer: 'Sony',      region: 'NTSC (USA)' },
  'PAL PlayStation 2':         { type: 'Console',          manufacturer: 'Sony',      region: 'PAL (Europe)' },
  'Japan PlayStation 2':       { type: 'Console',          manufacturer: 'Sony',      region: 'NTSC-J (Japan)' },
  'PlayStation 3':             { type: 'Console',          manufacturer: 'Sony',      region: 'NTSC (USA)' },
  'PAL PlayStation 3':         { type: 'Console',          manufacturer: 'Sony',      region: 'PAL (Europe)' },
  'PlayStation 4':             { type: 'Console',          manufacturer: 'Sony',      region: 'Multi-Region' },
  'PlayStation 5':             { type: 'Console',          manufacturer: 'Sony',      region: 'Multi-Region' },
  // Sony handheld
  'PSP':                       { type: 'Handheld Console', manufacturer: 'Sony',      region: 'NTSC (USA)' },
  'PS Vita':                   { type: 'Handheld Console', manufacturer: 'Sony',      region: 'Multi-Region' },
  // Microsoft
  'Xbox':                      { type: 'Console',          manufacturer: 'Microsoft', region: 'NTSC (USA)' },
  'Xbox 360':                  { type: 'Console',          manufacturer: 'Microsoft', region: 'NTSC (USA)' },
  'Xbox One':                  { type: 'Console',          manufacturer: 'Microsoft', region: 'Multi-Region' },
  'Xbox Series X/S':           { type: 'Console',          manufacturer: 'Microsoft', region: 'Multi-Region' },
  // Sega
  'Sega Master System':        { type: 'Console',          manufacturer: 'Sega',      region: 'NTSC (USA)' },
  'Sega Genesis / Mega Drive': { type: 'Console',          manufacturer: 'Sega',      region: 'NTSC (USA)' },
  'Sega Saturn':               { type: 'Console',          manufacturer: 'Sega',      region: 'NTSC (USA)' },
  'Sega Dreamcast':            { type: 'Console',          manufacturer: 'Sega',      region: 'NTSC (USA)' },
  'Game Gear':                 { type: 'Handheld Console', manufacturer: 'Sega',      region: 'NTSC (USA)' },
  // Atari
  'Atari 2600':                { type: 'Console',          manufacturer: 'Atari',     region: 'NTSC (USA)' },
  // Other
  'Neo Geo':                   { type: 'Console',          manufacturer: 'SNK',       region: 'NTSC (USA)' },
};

// Known model variants keyed by platform name — populates the Variant datalist
const PLATFORM_VARIANTS = {
  // Sony home
  'PlayStation':               ['Fat (SCPH-1000–7000)', 'PSone (SCPH-100)'],
  'PAL PlayStation':           ['Fat (SCPH-1000–7000)', 'PSone (SCPH-100)'],
  'Japan PlayStation':         ['Fat (SCPH-1000–7000)', 'PSone (SCPH-100)'],
  'PlayStation 2':             ['Fat (SCPH-10000–39004)', 'Slim (SCPH-70000–90006)'],
  'PAL PlayStation 2':         ['Fat', 'Slim'],
  'Japan PlayStation 2':       ['Fat', 'Slim'],
  'PlayStation 3':             ['Fat (CECHA/B)', 'Slim (CECH-2000)', 'Super Slim (CECH-4000)'],
  'PAL PlayStation 3':         ['Fat', 'Slim', 'Super Slim'],
  'PlayStation 4':             ['Standard (CUH-1000/1100/1200)', 'Slim (CUH-2000)', 'Pro (CUH-7000)'],
  'PlayStation 5':             ['Standard', 'Digital Edition', 'Slim', 'Slim Digital'],
  // Sony handheld
  'PSP':                       ['1000 (Phat)', '2000 (Slim & Lite)', '3000', 'Go (N1000)', 'Street (E1000)'],
  'PS Vita':                   ['1000 (Fat)', '2000 (Slim)'],
  // Microsoft
  'Xbox':                      ['Original'],
  'Xbox 360':                  ['Phat (2005)', 'Slim (S)', 'E'],
  'Xbox One':                  ['Original', 'S', 'X'],
  'Xbox Series X/S':           ['Series X', 'Series S'],
  // Nintendo home
  'NES':                       ['Front-loader (NES-001)', 'Top-loader (NES-101)'],
  'PAL NES':                   ['Front-loader'],
  'Famicom':                   ['Original (HVC-001)', 'AV Famicom (HVC-101)'],
  'SNES':                      ['Original (SNS-001)', '1-CHIP', 'Jr. (SNS-101)'],
  'PAL SNES':                  ['Original', '1-CHIP'],
  'Super Famicom':             ['Original (SHVC-001)', '1-CHIP', 'Jr.'],
  'Nintendo 64':               ['Standard (NUS-001)', 'N64DD'],
  'PAL Nintendo 64':           ['Standard'],
  'Japan Nintendo 64':         ['Standard', 'N64DD'],
  'GameCube':                  ['Standard (DOL-001)', 'Panasonic Q (SL-GC10)'],
  'PAL GameCube':              ['Standard'],
  'Wii':                       ['Original (RVL-001)', 'Family Edition (RVL-101)', 'Mini (RVL-201)'],
  'PAL Wii':                   ['Original', 'Mini'],
  'Wii U':                     ['Basic (8GB)', 'Deluxe (32GB)'],
  'Nintendo Switch':           ['Original (HAC-001)', 'Lite (HDH-001)', 'OLED (HEG-001)'],
  // Nintendo handheld
  'Game Boy':                  ['Original (DMG-001)', 'Pocket (MGB-001)', 'Light (MGB-101)'],
  'Game Boy Color':            ['Standard (CGB-001)'],
  'Game Boy Advance':          ['Original (AGB-001)', 'SP (AGS-001, front-lit)', 'SP (AGS-101, back-lit)', 'Micro (OXY-001)'],
  'Nintendo DS':               ['Original (NTR-001)', 'DS Lite (USG-001)', 'DSi (TWL-001)', 'DSi XL (UTL-001)'],
  'Nintendo 3DS':              ['Original (CTR-001)', '3DS XL (SPR-001)', '2DS (FTR-001)', 'New 3DS (KTR-001)', 'New 3DS XL (RED-001)', 'New 2DS XL (JAN-001)'],
  // Sega
  'Sega Master System':        ['Model 1', 'Model 2'],
  'Sega Genesis / Mega Drive': ['Model 1', 'Model 2', 'Model 3 (Majesco)', 'CDX', 'Nomad'],
  'Sega Saturn':               ['Model 1 (round buttons)', 'Model 2 (oval buttons)'],
  'Sega Dreamcast':            ['Standard (HKT-3000)'],
  'Game Gear':                 ['Standard'],
  // Atari
  'Atari 2600':                ['Heavy Sixer', 'Light Sixer', '4-Switch (Woodgrain)', '2-Switch (Vader)', 'Jr.'],
  // Other
  'Neo Geo':                   ['AES (Home)', 'MVS (Arcade)', 'CD', 'Pocket', 'Pocket Color'],
};

function makeHardwarePage(cfg) {
  // cfg: { category, types[], tableId, tbodyId, countId, batchBarId, batchCountId,
  //        selectAllId, mobileListId, searchId, filterPlatformId,
  //        filterTypeId, filterConditionId, refreshBtnId, emptyIcon, addLabel, pageVar, badgeId }

  let allItems = [], sortKey = 'name', sortDir = 'asc', editingId = null;
  let searchTerm = '', filterPlatform = '', filterType = '';
  let filterCondition = '', selectedIds = new Set(), lastCheckedIdx = -1;

  async function load() {
    const tbody = document.getElementById(cfg.tbodyId);
    if (tbody) tbody.innerHTML = `<tr><td colspan="16" class="loading"><div class="spinner"></div> Loading...</td></tr>`;
    try {
      const params = { category: cfg.category };
      if (searchTerm)      params.search    = searchTerm;
      if (filterPlatform)  params.platform  = filterPlatform;
      if (filterType)      params.type      = filterType;
      if (filterCondition) params.condition = filterCondition;

      allItems = await API.getHardware(params);
      renderTable();
      updateFilterOptions();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function updateFilterOptions() {
    try {
      const opts = await API.getHardwareOptions({ category: cfg.category });
      const platSel = document.getElementById(cfg.filterPlatformId);
      const typeSel = document.getElementById(cfg.filterTypeId);
      const conSel  = document.getElementById(cfg.filterConditionId);
      if (platSel) platSel.innerHTML = '<option value="">All Platforms</option>' + opts.platforms.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
      if (typeSel)  typeSel.innerHTML  = '<option value="">All Types</option>'    + opts.types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
      if (conSel)   conSel.innerHTML   = '<option value="">All Conditions</option>' + opts.conditions.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    } catch {}
  }

  function renderTable() {
    const tbody = document.getElementById(cfg.tbodyId);
    if (!tbody) return;
    const sorted = sortData(allItems, sortKey, sortDir);
    const countEl = document.getElementById(cfg.countId);
    if (countEl) countEl.textContent = `${sorted.length} item${sorted.length !== 1 ? 's' : ''}`;

    const badge = document.getElementById(cfg.badgeId);
    if (badge) badge.textContent = sorted.length;

    if (!sorted.length) {
      tbody.innerHTML = `<tr><td colspan="16">
        <div class="empty-state">
          <div class="empty-icon">${cfg.emptyIcon}</div>
          <p>No ${cfg.category} found. Add your first item!</p>
          <button class="btn btn-primary" onclick="${cfg.pageVar}.openAdd()">+ ${cfg.addLabel}</button>
        </div></td></tr>`;
      updateBatchBar();
      return;
    }

    const TYPE_ICONS = { 'Console': '🖥️', 'Handheld Console': '📟', 'Controller / Gamepad': '🎮', 'Arcade Stick': '🕹️', 'Light Gun': '🔫', 'Memory Card': '💾', 'Peripheral': '🔌', 'Cable / Adapter': '🔌', 'Storage': '💾', 'Accessory': '🔧' };

    tbody.innerHTML = sorted.map(h => {
      const diff = priceDiff(h.price_paid, h.price_value, h.price_paid_currency, h.price_value_currency);
      const icon = TYPE_ICONS[h.type] || cfg.emptyIcon;
      const added = h.created_at ? h.created_at.slice(0, 7) : '—';
      const sel = selectedIds.has(h.id);
      return `<tr class="${sel ? 'row-selected' : ''}" onclick="if(!event.target.closest('.row-check,.row-actions'))${cfg.pageVar}.openDetail(${h.id})">
        <td><input type="checkbox" class="row-check" data-id="${h.id}" ${sel ? 'checked' : ''}></td>
        <td class="td-thumb"><div class="row-thumb-placeholder">${icon}</div></td>
        <td>
          <div class="td-title">${esc(h.name)}</div>
          <div class="td-sub">${esc(h.manufacturer || '')}${h.variant ? ' · ' + esc(h.variant) : ''}${h.color_variant ? ' · ' + esc(h.color_variant) : ''}</div>
        </td>
        <td>${typeBadge(h.type)}</td>
        <td>${platformBadge(h.platform)}</td>
        <td>${conditionBadge(h.condition)}</td>
        <td>${esc(h.integrity) || '—'}</td>
        <td style="font-size:12px;font-family:monospace;color:var(--text-secondary)">${esc(h.model_number) || '—'}</td>
        <td style="font-size:12px;font-family:monospace;color:var(--text-muted)">${esc(h.serial_number) || '—'}</td>
        <td>${h.jailbroken ? '<span style="color:var(--accent);font-weight:600">✓</span>' : '—'}</td>
        <td>${regionBadge(h.region)}</td>
        <td>${h.quantity || 1}</td>
        <td>${h.price_paid  != null ? `<span class="price-paid">${Currency.formatWithBase(h.price_paid,  h.price_paid_currency)}</span>` : '—'}</td>
        <td>${h.price_value != null ? `<span class="price-value">${Currency.formatWithBase(h.price_value, h.price_value_currency)}</span>${diff ? '<br>' + diff : ''}` : '—'}</td>
        <td style="color:var(--text-muted);font-size:12px">${added}</td>
        <td onclick="event.stopPropagation()">
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm btn-icon" title="Refresh value" id="hwRefreshBtn-${h.id}" onclick="${cfg.pageVar}.refreshValue(${h.id}, '${esc(h.name).replace(/'/g, "\\'")}', '${esc(h.condition || '').replace(/'/g, "\\'")}')">↻</button>
            <button class="btn btn-ghost btn-sm btn-icon" title="Edit"   onclick="${cfg.pageVar}.openEdit(${h.id})">✎</button>
            <button class="btn btn-ghost btn-sm btn-icon" title="Delete" onclick="${cfg.pageVar}.deleteItem(${h.id}, '${esc(h.name).replace(/'/g, "\\'")}')">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    document.querySelectorAll(`#${cfg.tableId} thead th[data-sort]`).forEach(th => {
      th.classList.toggle('sorted', th.dataset.sort === sortKey);
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = th.dataset.sort === sortKey ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
    });

    renderCards();
    updateBatchBar();
  }

  function renderCards() {
    const list = document.getElementById(cfg.mobileListId);
    if (!list) return;
    const sorted = sortData(allItems, sortKey, sortDir);
    const TYPE_ICONS = { 'Console': '🖥️', 'Handheld Console': '📟', 'Controller / Gamepad': '🎮', 'Arcade Stick': '🕹️', 'Light Gun': '🔫', 'Memory Card': '💾', 'Peripheral': '🔌', 'Cable / Adapter': '🔌', 'Storage': '💾', 'Accessory': '🔧' };
    if (!sorted.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">${cfg.emptyIcon}</div><p>No ${cfg.category} found. Tap + to add!</p></div>`;
      return;
    }
    list.innerHTML = sorted.map(h => {
      const icon = TYPE_ICONS[h.type] || cfg.emptyIcon;
      const priceHtml = (h.price_paid != null || h.price_value != null)
        ? `<div class="game-card-price">
            ${h.price_paid  != null ? `<span class="price-paid">${Currency.formatWithBase(h.price_paid,  h.price_paid_currency)}</span>` : ''}
            ${h.price_value != null ? `<span class="price-value">${Currency.formatWithBase(h.price_value, h.price_value_currency)}</span>` : ''}
           </div>` : '';
      const sub = [h.manufacturer, h.variant, h.color_variant].filter(Boolean).join(' · ');
      return `<div class="game-card" onclick="${cfg.pageVar}.openDetail(${h.id})">
        <div class="game-card-cover"><div class="game-card-img-placeholder" style="font-size:26px">${icon}</div></div>
        <div class="game-card-body">
          <div class="game-card-title">${esc(h.name)}</div>
          <div class="game-card-meta">${typeBadge(h.type)}${h.platform ? ' ' + platformBadge(h.platform) : ''}</div>
          ${sub ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${esc(sub)}</div>` : ''}
          ${priceHtml}
        </div>
        ${conditionBadge(h.condition)}
      </div>`;
    }).join('');
  }

  function updateBatchBar() {
    const bar = document.getElementById(cfg.batchBarId);
    const cnt = document.getElementById(cfg.batchCountId);
    if (!bar) return;
    if (selectedIds.size > 0) {
      bar.classList.add('visible');
      if (cnt) cnt.textContent = `${selectedIds.size} selected`;
    } else {
      bar.classList.remove('visible');
    }
    const allBox = document.getElementById(cfg.selectAllId);
    if (allBox) allBox.checked = selectedIds.size > 0 && selectedIds.size === allItems.length;
  }

  function clearSelection() {
    selectedIds.clear();
    lastCheckedIdx = -1;
    renderTable();
  }

  async function batchDelete() {
    if (!selectedIds.size) return;
    if (!confirm(`Delete ${selectedIds.size} item${selectedIds.size > 1 ? 's' : ''}?`)) return;
    try {
      await API.batchDeleteHardware([...selectedIds]);
      toast(`Deleted ${selectedIds.size} items`, 'success');
      selectedIds.clear();
      load();
      App.loadSidebarCounts();
    } catch (e) { toast(e.message, 'error'); }
  }

  function batchEdit() {
    if (!selectedIds.size) return;
    ['batchHwPlatform','batchHwWhere','batchHwDate'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    ['batchHwType','batchHwCondition','batchHwWorking','batchHwPaidCurrency','batchHwValueCurrency'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    _activeHwPage = inst;
    populateBatchCurrencySelects();
    openModal('hwBatchModal');
  }

  function populateBatchCurrencySelects() {
    ['batchHwPaidCurrency','batchHwValueCurrency'].forEach(id => {
      const el = document.getElementById(id);
      if (!el) return;
      Currency.populateSelect(el);
      el.insertAdjacentHTML('afterbegin', '<option value="">— Keep existing —</option>');
      el.value = '';
    });
  }

  async function saveBatchEdit() {
    const data = {
      platform:             document.getElementById('batchHwPlatform')?.value.trim() || null,
      type:                 document.getElementById('batchHwType')?.value || null,
      condition:            document.getElementById('batchHwCondition')?.value || null,
      working_condition:    document.getElementById('batchHwWorking')?.value || null,
      where_purchased:      document.getElementById('batchHwWhere')?.value.trim() || null,
      date_acquired:        document.getElementById('batchHwDate')?.value || null,
      price_paid_currency:  document.getElementById('batchHwPaidCurrency')?.value || null,
      price_value_currency: document.getElementById('batchHwValueCurrency')?.value || null,
    };
    Object.keys(data).forEach(k => { if (!data[k]) delete data[k]; });
    if (!Object.keys(data).length) { toast('No fields filled in', 'error'); return; }
    try {
      const r = await API.batchEditHardware([...selectedIds], data);
      toast(`Updated ${r.updated} items`, 'success');
      closeModal('hwBatchModal');
      selectedIds.clear();
      load();
    } catch (e) { toast(e.message, 'error'); }
  }

  function setSort(key) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDir = 'asc'; }
    renderTable();
  }

  const IS_SYSTEMS = cfg.category === 'systems';

  function _updateModalLabels() {
    const titleEl = document.getElementById('hwFormSectionTitle');
    if (titleEl) titleEl.textContent = IS_SYSTEMS ? '🖥️ System Info' : '🕹️ Hardware Info';
    const platLabelEl = document.getElementById('hwPlatformLabel');
    if (platLabelEl) platLabelEl.textContent = IS_SYSTEMS ? 'Platform / System *' : 'Platform / System *';
    const nameLabelEl = document.getElementById('hwNameLabel');
    if (nameLabelEl) nameLabelEl.textContent = IS_SYSTEMS ? 'Name / Model *' : 'Name *';
    const nameEl = document.getElementById('hwName');
    if (nameEl) nameEl.placeholder = IS_SYSTEMS
      ? 'e.g. PlayStation 2 Fat (SCPH-50004), Nintendo 64 (AUS)'
      : 'e.g. DualShock 3 Controller, Memory Card 8MB';
  }

  function _populateTypeList() {
    const typeList = document.getElementById('hwTypeList');
    if (typeList) typeList.innerHTML = cfg.types.map(t => `<option>${esc(t)}</option>`).join('');
  }

  function _populateVariantList(platform) {
    const variantList = document.getElementById('hwVariantList');
    if (!variantList) return;
    const variants = PLATFORM_VARIANTS[platform] || [];
    variantList.innerHTML = variants.map(v => `<option>${esc(v)}</option>`).join('');
  }

  function openAdd() {
    _activeHwPage = inst;
    editingId = null;
    document.getElementById('hwModalTitle').textContent = cfg.addLabel;
    document.getElementById('hwForm').reset();
    _populateTypeList();
    _updateModalLabels();
    Currency.populateSelect(document.getElementById('hwPaidCurrency'));
    Currency.populateSelect(document.getElementById('hwValueCurrency'));
    const hwPcUrl = document.getElementById('hwPcUrl');
    const hwPcStatus = document.getElementById('hwPcUrlStatus');
    if (hwPcUrl) hwPcUrl.value = '';
    if (hwPcStatus) hwPcStatus.style.display = 'none';
    openModal('hwModal');
  }

  async function openEdit(id) {
    _activeHwPage = inst;
    editingId = id;
    document.getElementById('hwModalTitle').textContent = 'Edit';
    _populateTypeList();
    _updateModalLabels();
    Currency.populateSelect(document.getElementById('hwPaidCurrency'));
    Currency.populateSelect(document.getElementById('hwValueCurrency'));
    const hwPcUrl = document.getElementById('hwPcUrl');
    const hwPcStatus = document.getElementById('hwPcUrlStatus');
    if (hwPcUrl) hwPcUrl.value = '';
    if (hwPcStatus) hwPcStatus.style.display = 'none';
    try {
      const h = await API.getHardwareItem(id);
      fillForm(h);
      openModal('hwModal');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function openDetail(id) {
    try {
      const h = await API.getHardwareItem(id);
      const diff = priceDiff(h.price_paid, h.price_value);
      document.getElementById('hwDetailContent').innerHTML = `
        <div class="form-section">
          <div class="form-section-title">🕹️ Hardware Info</div>
          <div class="detail-grid">
            <div class="detail-field"><span class="detail-field-label">Name</span><span class="detail-field-value" style="font-size:17px;font-weight:700">${esc(h.name)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Type</span><span class="detail-field-value">${typeBadge(h.type)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Platform / System</span><span class="detail-field-value">${platformBadge(h.platform)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Manufacturer</span><span class="detail-field-value">${esc(h.manufacturer) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Model Number</span><span class="detail-field-value" style="font-family:monospace">${esc(h.model_number) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Serial Number</span><span class="detail-field-value" style="font-family:monospace">${esc(h.serial_number) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Variant</span><span class="detail-field-value">${esc(h.variant) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Color</span><span class="detail-field-value">${esc(h.color_variant) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Edition</span><span class="detail-field-value">${esc(h.edition) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Region</span><span class="detail-field-value">${esc(h.region) || '—'}</span></div>
          </div>
        </div>
        <div class="form-section">
          <div class="form-section-title">📦 Condition</div>
          <div class="detail-grid">
            <div class="detail-field"><span class="detail-field-label">Condition</span><span class="detail-field-value">${conditionBadge(h.condition)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Integrity</span><span class="detail-field-value">${esc(h.integrity) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Quantity</span><span class="detail-field-value">${h.quantity}</span></div>
          </div>
        </div>
        <div class="form-section">
          <div class="form-section-title">💰 Pricing</div>
          <div class="detail-grid">
            <div class="detail-field"><span class="detail-field-label">Price Paid</span><span class="detail-field-value" style="font-size:18px;font-weight:700">${Currency.formatWithBase(h.price_paid, h.price_paid_currency)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Market Value</span><span class="detail-field-value price-value" style="font-size:18px;font-weight:700">${Currency.formatWithBase(h.price_value, h.price_value_currency)}${diff ? '<br>' + diff : ''}</span></div>
          </div>
        </div>
        <div class="form-section">
          <div class="form-section-title">🛒 Acquisition</div>
          <div class="detail-grid">
            <div class="detail-field"><span class="detail-field-label">Date Acquired</span><span class="detail-field-value">${fmtDate(h.date_acquired)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Where Purchased</span><span class="detail-field-value">${esc(h.where_purchased) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Has Original Box</span><span class="detail-field-value">${checkmark(h.has_original_box)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Has All Accessories</span><span class="detail-field-value">${checkmark(h.has_all_accessories)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Jailbroken / Modded</span><span class="detail-field-value">${h.jailbroken ? '<span style="color:var(--accent);font-weight:600">Yes</span>' : 'No'}</span></div>
          </div>
        </div>
        ${h.remarks ? `<div class="form-section"><div class="form-section-title">📝 Remarks</div><p style="color:var(--text-secondary);line-height:1.6">${esc(h.remarks)}</p></div>` : ''}
      `;
      document.getElementById('hwDetailEditBtn').onclick = () => { closeModal('hwDetailModal'); openEdit(id); };
      openModal('hwDetailModal');
    } catch (e) { toast(e.message, 'error'); }
  }

  function fillForm(h) {
    _suppressHwAutofill = true;
    const f = document.getElementById('hwForm');
    const set = (name, val) => { const el = f.elements[name]; if (el) el.value = val ?? ''; };
    const setCheck = (name, val) => { const el = f.elements[name]; if (el) el.checked = bool(val); };

    set('name', h.name);
    set('type', h.type);
    set('manufacturer', h.manufacturer);
    set('model_number', h.model_number);
    set('condition', h.condition);
    set('integrity', h.integrity);
    set('color_variant', h.color_variant);
    set('edition', h.edition);
    set('region', h.region);
    set('quantity', h.quantity);
    set('serial_number', h.serial_number);
    setCheck('has_original_box', h.has_original_box);
    setCheck('has_all_accessories', h.has_all_accessories);
    setCheck('jailbroken', h.jailbroken);
    set('price_paid', h.price_paid);
    set('price_value', h.price_value);
    Currency.populateSelect(document.getElementById('hwPaidCurrency'), h.price_paid_currency);
    Currency.populateSelect(document.getElementById('hwValueCurrency'), h.price_value_currency);
    set('date_acquired', h.date_acquired);
    set('where_purchased', h.where_purchased);
    set('remarks', h.remarks);

    // Platform is a select with optgroups — try to set, add dynamically if not in list
    const platSel = document.getElementById('hwPlatformSelect');
    if (platSel && h.platform) {
      platSel.value = h.platform;
      if (platSel.value !== h.platform) {
        const opt = new Option(h.platform, h.platform, true, true);
        platSel.add(opt);
      }
    }

    // Populate variant datalist for the current platform, then set value
    _populateVariantList(h.platform);
    set('variant', h.variant);

    _suppressHwAutofill = false;
  }

  async function saveItem() {
    const f = document.getElementById('hwForm');
    const data = {
      name:                f.elements.name.value.trim(),
      type:                f.elements.type.value.trim(),
      platform:            f.elements.platform.value,
      manufacturer:        f.elements.manufacturer.value.trim(),
      model_number:        f.elements.model_number.value.trim(),
      condition:           f.elements.condition.value,
      integrity:           f.elements.integrity.value || null,
      color_variant:       f.elements.color_variant.value.trim(),
      variant:             f.elements.variant?.value.trim() || null,
      edition:             f.elements.edition?.value.trim() || null,
      region:              f.elements.region.value.trim(),
      quantity:            parseInt(f.elements.quantity.value) || 1,
      serial_number:       f.elements.serial_number.value.trim(),
      has_original_box:    f.elements.has_original_box.checked,
      has_all_accessories: f.elements.has_all_accessories.checked,
      jailbroken:          f.elements.jailbroken.checked,
      price_paid:          parseFloat(f.elements.price_paid.value) || null,
      price_paid_currency: f.elements.price_paid_currency?.value || Currency.settings().base,
      price_value:         parseFloat(f.elements.price_value.value) || null,
      price_value_currency: f.elements.price_value_currency?.value || Currency.settings().base,
      date_acquired:       f.elements.date_acquired.value || null,
      where_purchased:     f.elements.where_purchased.value.trim(),
      remarks:             f.elements.remarks.value.trim(),
    };

    if (!data.name || !data.type || !data.platform) {
      toast('Name, type, and platform are required', 'error'); return;
    }

    try {
      if (editingId) await API.updateHardware(editingId, data);
      else await API.createHardware(data);
      closeModal('hwModal');
      toast(editingId ? 'Hardware updated!' : 'Hardware added!', 'success');
      load();
      App.loadSidebarCounts();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function deleteItem(id, name) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await API.deleteHardware(id);
      toast('Item deleted', 'success');
      load();
      App.loadSidebarCounts();
    } catch (e) { toast(e.message, 'error'); }
  }

  async function refreshValue(id, name, condition) {
    const btn = document.getElementById(`hwRefreshBtn-${id}`);
    if (btn) { btn.disabled = true; btn.textContent = '⟳'; }
    try {
      const r = await API.applyPrice({ query: name, condition, item_type: 'hardware', item_id: id });
      if (r?.price != null) { toast(`Value updated: ${Currency.format(r.price, 'USD')}`, 'success'); load(); }
    } catch (e) {
      toast(`Refresh failed: ${e.message}`, 'error');
      if (btn) { btn.disabled = false; btn.textContent = '↻'; }
    }
  }

  async function refreshAllValues() {
    const btn = document.getElementById(cfg.refreshBtnId);
    if (btn) { btn.disabled = true; btn.textContent = '↻ Refreshing…'; }
    let updated = 0, failed = 0;
    for (const h of allItems) {
      try {
        await API.applyPrice({ query: h.name, condition: h.condition, item_type: 'hardware', item_id: h.id });
        updated++;
      } catch { failed++; }
    }
    toast(`Updated ${updated}${failed ? `, ${failed} failed` : ''} values`, updated > 0 ? 'success' : 'error');
    if (btn) { btn.disabled = false; btn.textContent = '↻ Refresh All Values'; }
    load();
  }

  function init() {
    document.getElementById(cfg.searchId)?.addEventListener('input', debounce(e => {
      searchTerm = e.target.value.trim();
      load();
    }, 300));
    document.getElementById(cfg.filterPlatformId)?.addEventListener('change',  e => { filterPlatform  = e.target.value; load(); });
    document.getElementById(cfg.filterTypeId)?.addEventListener('change',       e => { filterType      = e.target.value; load(); });
    document.getElementById(cfg.filterConditionId)?.addEventListener('change',  e => { filterCondition = e.target.value; load(); });

    document.querySelectorAll(`#${cfg.tableId} thead th[data-sort]`).forEach(th => {
      th.addEventListener('click', () => setSort(th.dataset.sort));
    });

    document.getElementById(cfg.selectAllId)?.addEventListener('change', function () {
      if (this.checked) allItems.forEach(h => selectedIds.add(h.id));
      else selectedIds.clear();
      lastCheckedIdx = -1;
      renderTable();
    });

    document.getElementById(cfg.tableId)?.addEventListener('click', (e) => {
      const cb = e.target.closest('input.row-check');
      if (!cb) return;
      const id = parseInt(cb.dataset.id);
      const sorted = sortData(allItems, sortKey, sortDir);
      const idx = sorted.findIndex(h => h.id === id);
      if (e.shiftKey && lastCheckedIdx !== -1 && idx !== -1) {
        const from = Math.min(lastCheckedIdx, idx), to = Math.max(lastCheckedIdx, idx);
        const shouldCheck = cb.checked;
        sorted.slice(from, to + 1).forEach(h => { if (shouldCheck) selectedIds.add(h.id); else selectedIds.delete(h.id); });
        renderTable();
      } else {
        if (cb.checked) selectedIds.add(id); else selectedIds.delete(id);
        if (idx !== -1) lastCheckedIdx = idx;
        const row = cb.closest('tr');
        if (row) row.classList.toggle('row-selected', cb.checked);
        updateBatchBar();
      }
    });

    // Shared modal wiring — runs only once across all three page instances
    if (!_hwCommonInitDone) {
      _hwCommonInitDone = true;

      function wireConversion(inputId, selectId, previewId) {
        const input = document.getElementById(inputId), select = document.getElementById(selectId), preview = document.getElementById(previewId);
        if (!input || !select || !preview) return;
        const update = () => { const p = Currency.preview(input.value, select.value); preview.textContent = p ? '≈ ' + p : ''; };
        input.addEventListener('input', update);
        select.addEventListener('change', update);
      }
      wireConversion('hwPricePaid', 'hwPaidCurrency', 'hwPaidConversion');
      wireConversion('hwPriceValue', 'hwValueCurrency', 'hwValueConversion');

      // PriceCharting URL fetch button
      document.getElementById('hwFetchPcUrlBtn')?.addEventListener('click', async () => {
        const url = document.getElementById('hwPcUrl')?.value.trim();
        if (!url) { toast('Paste a PriceCharting URL first', 'error'); return; }
        const condition = document.getElementById('hwForm')?.elements?.condition?.value || '';
        const btn = document.getElementById('hwFetchPcUrlBtn');
        const status = document.getElementById('hwPcUrlStatus');
        btn.disabled = true; btn.textContent = '⟳';
        status.style.display = ''; status.style.color = 'var(--text-muted)'; status.textContent = 'Fetching…';
        try {
          const r = await API.fetchPriceFromUrl({ url, condition });
          document.getElementById('hwPriceValue').value = r.price;
          document.getElementById('hwPriceValue').dispatchEvent(new Event('input'));
          status.style.color = 'var(--green)'; status.textContent = `✓ $${r.price} fetched`;
        } catch (e) {
          status.style.color = 'var(--red)'; status.textContent = '✕ ' + e.message;
        } finally {
          btn.disabled = false; btn.textContent = 'Fetch';
        }
      });

      document.getElementById('saveHwBatchBtn')?.addEventListener('click', () => { if (_activeHwPage) _activeHwPage._saveBatchEdit(); });
      document.getElementById('saveHwBtn')?.addEventListener('click', () => { if (_activeHwPage) _activeHwPage.saveItem(); });
      document.getElementById('hwModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('hwModal'); });
      document.getElementById('hwDetailModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('hwDetailModal'); });

      // Platform change — populate variant datalist and autofill for Systems page
      document.getElementById('hwPlatformSelect')?.addEventListener('change', e => {
        if (_suppressHwAutofill) return;
        const platform = e.target.value;

        // Always populate the variant datalist for the selected platform
        if (_activeHwPage) _activeHwPage._populateVariantList(platform);

        // Autofill type/manufacturer/region/name — only for Systems page
        if (!_activeHwPage || _activeHwPage.cfg.category !== 'systems') return;
        const defaults = PLATFORM_DEFAULTS[platform];
        if (!defaults) return;
        const f = document.getElementById('hwForm');
        // Type: always fill (deterministic for systems)
        const typeEl = f.elements.type;
        if (typeEl) typeEl.value = defaults.type;
        // Manufacturer: fill if empty
        const mfrEl = f.elements.manufacturer;
        if (mfrEl && !mfrEl.value) mfrEl.value = defaults.manufacturer;
        // Region: fill if empty
        const regEl = f.elements.region;
        if (regEl && !regEl.value) regEl.value = defaults.region;
        // Name: suggest platform name if field is currently empty
        const nameEl = f.elements.name;
        if (nameEl && !nameEl.value) nameEl.value = platform;
      });
    }
  }

  const inst = {
    cfg,
    init, load, openAdd, openEdit, openDetail, saveItem, deleteItem,
    refreshValue, refreshAllValues,
    _populateVariantList,
    toggleSelect: (id, checked) => {
      if (checked) selectedIds.add(id); else selectedIds.delete(id);
      const row = document.querySelector(`#${cfg.tableId} .row-check[data-id="${id}"]`)?.closest('tr');
      if (row) row.classList.toggle('row-selected', checked);
      updateBatchBar();
    },
    clearSelection,
    batchDelete,
    batchEdit,
    _saveBatchEdit: saveBatchEdit,
  };
  return inst;
}

const SystemsPage = makeHardwarePage({
  category: 'systems',     types: ['Console', 'Handheld Console'],
  emptyIcon: '🖥️', addLabel: 'Add System',     pageVar: 'SystemsPage',
  tableId: 'systemsTable',     tbodyId: 'systemsTableBody',     countId: 'systemsCount',
  batchBarId: 'systemsBatchBar',   batchCountId: 'systemsBatchCount',   selectAllId: 'systemsSelectAll',
  mobileListId: 'systemsMobileList',  searchId: 'systemsSearch',
  filterPlatformId: 'filterSystemsPlatform', filterTypeId: 'filterSystemsType', filterConditionId: 'filterSystemsCondition',
  refreshBtnId: 'refreshAllSystemsValues',   badgeId: 'badge-systems',
});

const ControllersPage = makeHardwarePage({
  category: 'controllers', types: ['Controller / Gamepad', 'Arcade Stick', 'Light Gun'],
  emptyIcon: '🕹️', addLabel: 'Add Controller', pageVar: 'ControllersPage',
  tableId: 'controllersTable', tbodyId: 'controllersTableBody', countId: 'controllersCount',
  batchBarId: 'controllersBatchBar', batchCountId: 'controllersBatchCount', selectAllId: 'controllersSelectAll',
  mobileListId: 'controllersMobileList', searchId: 'controllersSearch',
  filterPlatformId: 'filterControllersPlatform', filterTypeId: 'filterControllersType', filterConditionId: 'filterControllersCondition',
  refreshBtnId: 'refreshAllControllersValues', badgeId: 'badge-controllers',
});

const PeripheralsPage = makeHardwarePage({
  category: 'peripherals', types: ['Memory Card', 'Peripheral', 'Cable / Adapter', 'Storage', 'Accessory', 'Other'],
  emptyIcon: '🔌', addLabel: 'Add Peripheral', pageVar: 'PeripheralsPage',
  tableId: 'peripheralsTable', tbodyId: 'peripheralsTableBody', countId: 'peripheralsCount',
  batchBarId: 'peripheralsBatchBar', batchCountId: 'peripheralsBatchCount', selectAllId: 'peripheralsSelectAll',
  mobileListId: 'peripheralsMobileList', searchId: 'peripheralsSearch',
  filterPlatformId: 'filterPeripheralsPlatform', filterTypeId: 'filterPeripheralsType', filterConditionId: 'filterPeripheralsCondition',
  refreshBtnId: 'refreshAllPeripheralsValues', badgeId: 'badge-peripherals',
});
