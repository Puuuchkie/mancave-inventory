// Hardware module
const HardwarePage = (() => {
  let allItems = [];
  let sortKey = 'name';
  let sortDir = 'asc';
  let editingId = null;
  let selectedPCResult = null;
  let searchTerm = '';
  let filterPlatform = '';
  let filterType = '';
  let filterCondition = '';
  let selectedIds = new Set();

  const TYPES = ['Console', 'Handheld Console', 'Controller / Gamepad', 'Arcade Stick', 'Light Gun', 'Memory Card', 'Peripheral', 'Cable / Adapter', 'Storage', 'Accessory', 'Other'];
  const CONDITIONS = ['Sealed', 'Mint', 'Near Mint', 'Very Good', 'Good', 'Fair', 'Poor / Damaged', 'For Parts / Repair'];
  const WORKING = ['Fully Working', 'Partially Working', 'Needs Repair', 'For Parts / Not Working'];
  const REGIONS = ['NTSC (USA)', 'NTSC-J (Japan)', 'PAL (Europe)', 'PAL-AU (Australia)', 'Multi-Region', 'Universal'];

  async function load() {
    const tbody = document.getElementById('hardwareTableBody');
    tbody.innerHTML = `<tr><td colspan="9" class="loading"><div class="spinner"></div> Loading...</td></tr>`;
    try {
      const params = {};
      if (searchTerm) params.search = searchTerm;
      if (filterPlatform) params.platform = filterPlatform;
      if (filterType) params.type = filterType;
      if (filterCondition) params.condition = filterCondition;

      allItems = await API.getHardware(params);
      renderTable();
      updateFilterOptions();
    } catch (e) {
      toast(e.message, 'error');
    }
  }

  async function updateFilterOptions() {
    try {
      const opts = await API.getHardwareOptions();
      const platSel = document.getElementById('filterHwPlatform');
      const typeSel = document.getElementById('filterHwType');
      const conSel = document.getElementById('filterHwCondition');

      platSel.innerHTML = '<option value="">All Platforms</option>' + opts.platforms.map(p => `<option value="${esc(p)}">${esc(p)}</option>`).join('');
      typeSel.innerHTML = '<option value="">All Types</option>' + opts.types.map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('');
      conSel.innerHTML = '<option value="">All Conditions</option>' + opts.conditions.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('');
    } catch {}
  }

  function renderTable() {
    const tbody = document.getElementById('hardwareTableBody');
    const sorted = sortData(allItems, sortKey, sortDir);
    document.getElementById('hardwareCount').textContent = `${sorted.length} item${sorted.length !== 1 ? 's' : ''}`;

    if (!sorted.length) {
      tbody.innerHTML = `
        <tr><td colspan="10">
          <div class="empty-state">
            <div class="empty-icon">🕹️</div>
            <p>No hardware found. Add your first console or controller!</p>
            <button class="btn btn-primary" onclick="HardwarePage.openAdd()">+ Add Hardware</button>
          </div>
        </td></tr>`;
      return;
    }

    const TYPE_ICONS = { 'Console': '🖥️', 'Handheld Console': '📟', 'Controller / Gamepad': '🎮', 'Arcade Stick': '🕹️', 'Light Gun': '🔫', 'Memory Card': '💾', 'Peripheral': '🔌', 'Cable / Adapter': '🔌', 'Storage': '💾', 'Accessory': '🔧' };

    tbody.innerHTML = sorted.map(h => {
      const diff = priceDiff(h.price_paid, h.price_value, h.price_paid_currency, h.price_value_currency);
      const icon = TYPE_ICONS[h.type] || '🕹️';
      const added = h.created_at ? h.created_at.slice(0, 7) : '—';
      const sel = selectedIds.has(h.id);
      return `<tr class="${sel ? 'row-selected' : ''}" onclick="HardwarePage.openDetail(${h.id})">
        <td onclick="event.stopPropagation()"><input type="checkbox" class="row-check" data-id="${h.id}" ${sel ? 'checked' : ''} onchange="HardwarePage.toggleSelect(${h.id}, this.checked)"></td>
        <td class="td-thumb"><div class="row-thumb-placeholder">${icon}</div></td>
        <td>
          <div class="td-title">${esc(h.name)}</div>
          <div class="td-sub">${esc(h.manufacturer || '')}${h.model_number ? ' · ' + h.model_number : ''}${h.color_variant ? ' · ' + h.color_variant : ''}</div>
        </td>
        <td>${typeBadge(h.type)}</td>
        <td>${platformBadge(h.platform)}</td>
        <td>${conditionBadge(h.condition)}</td>
        <td>${regionBadge(h.region)}</td>
        <td>${h.quantity || 1}</td>
        <td>${h.price_paid != null ? `<span class="price-paid">${Currency.formatWithBase(h.price_paid, h.price_paid_currency)}</span>` : '—'}</td>
        <td>${h.price_value != null ? `<span class="price-value">${Currency.formatWithBase(h.price_value, h.price_value_currency)}</span>${diff ? '<br>' + diff : ''}` : '—'}</td>
        <td style="color:var(--text-muted);font-size:12px">${added}</td>
        <td onclick="event.stopPropagation()">
          <div class="row-actions">
            <button class="btn btn-ghost btn-sm btn-icon" title="Refresh value" id="hwRefreshBtn-${h.id}" onclick="HardwarePage.refreshValue(${h.id}, '${esc(h.name).replace(/'/g, "\\'")}', '${esc(h.condition || '').replace(/'/g, "\\'")}')">↻</button>
            <button class="btn btn-ghost btn-sm btn-icon" title="Edit" onclick="HardwarePage.openEdit(${h.id})">✎</button>
            <button class="btn btn-ghost btn-sm btn-icon" title="Delete" onclick="HardwarePage.deleteItem(${h.id}, '${esc(h.name)}')">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    document.querySelectorAll('#hardwareTable thead th[data-sort]').forEach(th => {
      th.classList.toggle('sorted', th.dataset.sort === sortKey);
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = th.dataset.sort === sortKey ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
    });

    renderCards();
  }

  function renderCards() {
    const list = document.getElementById('hwMobileList');
    if (!list) return;
    const sorted = sortData(allItems, sortKey, sortDir);
    const TYPE_ICONS = { 'Console': '🖥️', 'Handheld Console': '📟', 'Controller / Gamepad': '🎮', 'Arcade Stick': '🕹️', 'Light Gun': '🔫', 'Memory Card': '💾', 'Peripheral': '🔌', 'Cable / Adapter': '🔌', 'Storage': '💾', 'Accessory': '🔧' };
    if (!sorted.length) {
      list.innerHTML = `<div class="empty-state"><div class="empty-icon">🕹️</div><p>No hardware found. Tap + to add your first item!</p></div>`;
      return;
    }
    list.innerHTML = sorted.map(h => {
      const icon = TYPE_ICONS[h.type] || '🕹️';
      const priceHtml = (h.price_paid != null || h.price_value != null)
        ? `<div class="game-card-price">
            ${h.price_paid  != null ? `<span class="price-paid">${Currency.formatWithBase(h.price_paid,  h.price_paid_currency)}</span>` : ''}
            ${h.price_value != null ? `<span class="price-value">${Currency.formatWithBase(h.price_value, h.price_value_currency)}</span>` : ''}
           </div>`
        : '';
      const sub = [h.manufacturer, h.color_variant].filter(Boolean).join(' · ');
      return `<div class="game-card" onclick="HardwarePage.openDetail(${h.id})">
        <div class="game-card-cover">
          <div class="game-card-img-placeholder" style="font-size:26px">${icon}</div>
        </div>
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
    const bar = document.getElementById('hwBatchBar');
    const cnt = document.getElementById('hwBatchCount');
    if (!bar) return;
    if (selectedIds.size > 0) {
      bar.classList.add('visible');
      cnt.textContent = `${selectedIds.size} selected`;
    } else {
      bar.classList.remove('visible');
    }
    const allBox = document.getElementById('hwSelectAll');
    if (allBox) allBox.checked = selectedIds.size > 0 && selectedIds.size === allItems.length;
  }

  function toggleSelect(id, checked) {
    if (checked) selectedIds.add(id); else selectedIds.delete(id);
    const row = document.querySelector(`#hardwareTable .row-check[data-id="${id}"]`)?.closest('tr');
    if (row) row.classList.toggle('row-selected', checked);
    updateBatchBar();
  }

  function clearSelection() {
    selectedIds.clear();
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
    ['batchHwType','batchHwCondition','batchHwWorking'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    openModal('hwBatchModal');
  }

  async function saveBatchEdit() {
    const data = {
      platform:          document.getElementById('batchHwPlatform')?.value.trim() || null,
      type:              document.getElementById('batchHwType')?.value || null,
      condition:         document.getElementById('batchHwCondition')?.value || null,
      working_condition: document.getElementById('batchHwWorking')?.value || null,
      where_purchased:   document.getElementById('batchHwWhere')?.value.trim() || null,
      date_acquired:     document.getElementById('batchHwDate')?.value || null,
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

  function openAdd() {
    editingId = null;
    selectedPCResult = null;
    document.getElementById('hwModalTitle').textContent = 'Add Hardware';
    document.getElementById('hwForm').reset();
    document.getElementById('hwPcResults').innerHTML = '';
    document.getElementById('hwPcSearch').value = '';
    openModal('hwModal');
  }

  async function openEdit(id) {
    editingId = id;
    selectedPCResult = null;
    document.getElementById('hwModalTitle').textContent = 'Edit Hardware';
    document.getElementById('hwPcResults').innerHTML = '';
    Currency.populateSelect(document.getElementById('hwPaidCurrency'));
    Currency.populateSelect(document.getElementById('hwValueCurrency'));
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
      const workingColor = h.working_condition?.includes('Fully') ? 'var(--green)' : h.working_condition?.includes('Parts') ? 'var(--red)' : 'var(--yellow)';
      document.getElementById('hwDetailContent').innerHTML = `
        <div class="form-section">
          <div class="form-section-title">🕹️ Hardware Info</div>
          <div class="detail-grid">
            <div class="detail-field"><span class="detail-field-label">Name</span><span class="detail-field-value" style="font-size:17px;font-weight:700">${esc(h.name)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Type</span><span class="detail-field-value">${typeBadge(h.type)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Platform / System</span><span class="detail-field-value">${platformBadge(h.platform)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Manufacturer</span><span class="detail-field-value">${esc(h.manufacturer) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Model Number</span><span class="detail-field-value">${esc(h.model_number) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Color / Variant</span><span class="detail-field-value">${esc(h.color_variant) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Region</span><span class="detail-field-value">${regionBadge(h.region)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Serial Number</span><span class="detail-field-value" style="font-family:monospace">${esc(h.serial_number) || '—'}</span></div>
          </div>
        </div>
        <div class="form-section">
          <div class="form-section-title">📦 Condition & Completeness</div>
          <div class="detail-grid">
            <div class="detail-field"><span class="detail-field-label">Condition</span><span class="detail-field-value">${conditionBadge(h.condition)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Working Condition</span><span class="detail-field-value" style="color:${workingColor};font-weight:600">${esc(h.working_condition) || '—'}</span></div>
            <div class="detail-field"><span class="detail-field-label">Has Original Box</span><span class="detail-field-value">${checkmark(h.has_original_box)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Has All Accessories</span><span class="detail-field-value">${checkmark(h.has_all_accessories)}</span></div>
            <div class="detail-field"><span class="detail-field-label">Quantity</span><span class="detail-field-value">${h.quantity}</span></div>
            ${h.modifications ? `<div class="detail-field span-2"><span class="detail-field-label">Modifications</span><span class="detail-field-value">${esc(h.modifications)}</span></div>` : ''}
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
          </div>
        </div>
        ${h.remarks ? `<div class="form-section"><div class="form-section-title">📝 Remarks</div><p style="color:var(--text-secondary);line-height:1.6">${esc(h.remarks)}</p></div>` : ''}
      `;
      document.getElementById('hwDetailEditBtn').onclick = () => { closeModal('hwDetailModal'); openEdit(id); };
      openModal('hwDetailModal');
    } catch (e) { toast(e.message, 'error'); }
  }

  function fillForm(h) {
    const f = document.getElementById('hwForm');
    const set = (name, val) => { const el = f.elements[name]; if (el) el.value = val ?? ''; };
    const setCheck = (name, val) => { const el = f.elements[name]; if (el) el.checked = bool(val); };
    set('name', h.name); set('type', h.type); set('platform', h.platform);
    set('manufacturer', h.manufacturer); set('model_number', h.model_number);
    set('condition', h.condition); set('color_variant', h.color_variant);
    set('region', h.region); set('quantity', h.quantity);
    set('serial_number', h.serial_number); set('working_condition', h.working_condition);
    set('modifications', h.modifications);
    setCheck('has_original_box', h.has_original_box);
    setCheck('has_all_accessories', h.has_all_accessories);
    set('price_paid', h.price_paid); set('price_value', h.price_value);
    Currency.populateSelect(document.getElementById('hwPaidCurrency'), h.price_paid_currency);
    Currency.populateSelect(document.getElementById('hwValueCurrency'), h.price_value_currency);
    set('date_acquired', h.date_acquired); set('where_purchased', h.where_purchased);
    set('remarks', h.remarks);
    if (h.pricecharting_id) {
      selectedPCResult = { id: h.pricecharting_id };
      document.getElementById('hwPcSearch').value = h.name;
    }
  }

  async function saveItem() {
    const f = document.getElementById('hwForm');
    const data = {
      name: f.elements.name.value.trim(),
      type: f.elements.type.value,
      platform: f.elements.platform.value.trim(),
      manufacturer: f.elements.manufacturer.value.trim(),
      model_number: f.elements.model_number.value.trim(),
      condition: f.elements.condition.value,
      color_variant: f.elements.color_variant.value.trim(),
      region: f.elements.region.value,
      quantity: parseInt(f.elements.quantity.value) || 1,
      serial_number: f.elements.serial_number.value.trim(),
      has_original_box: f.elements.has_original_box.checked,
      has_all_accessories: f.elements.has_all_accessories.checked,
      working_condition: f.elements.working_condition.value,
      modifications: f.elements.modifications.value.trim(),
      price_paid: parseFloat(f.elements.price_paid.value) || null,
      price_paid_currency: f.elements.price_paid_currency?.value || Currency.settings().base,
      price_value: parseFloat(f.elements.price_value.value) || null,
      price_value_currency: f.elements.price_value_currency?.value || Currency.settings().base,
      pricecharting_id: null,
      date_acquired: f.elements.date_acquired.value || null,
      where_purchased: f.elements.where_purchased.value.trim(),
      remarks: f.elements.remarks.value.trim(),
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
    const btn = document.getElementById('refreshAllHwValues');
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

  async function searchPrices() {
    const q = document.getElementById('hwPcSearch').value.trim();
    if (!q) return;
    const resultsEl = document.getElementById('hwPcResults');
    resultsEl.innerHTML = `<div class="loading"><div class="spinner"></div> Searching eBay sold listings...</div>`;
    try {
      const result = await API.searchPrices(q, 'hardware');
      if (result.price === null) {
        resultsEl.innerHTML = '<p style="color:var(--text-muted);padding:8px;font-size:13px">No sold listings found. Try a different search term.</p>';
        return;
      }
      const recentItems = (result.items || []).slice(0, 5).map(i =>
        `<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid var(--border)">
          <span style="color:var(--text-secondary);flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:8px">${esc(i.title)}</span>
          <span style="color:var(--green);font-weight:700;white-space:nowrap">$${i.price?.toFixed(2)}</span>
        </div>`
      ).join('');
      resultsEl.innerHTML = `
        <div style="background:var(--bg-card);border:1px solid var(--accent);border-radius:var(--radius-sm);padding:12px;margin-top:8px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
            <span style="font-weight:700;font-size:13px">eBay Sold Listings (${result.count} found)</span>
            <button class="btn btn-success btn-sm" onclick="HardwarePage.applyEbayPrice(${result.price})">
              Use $${result.price} →
            </button>
          </div>
          <div style="display:flex;gap:16px;font-size:12px;margin-bottom:10px">
            <span>Median: <strong style="color:var(--green)">$${result.price}</strong></span>
            <span>Avg: <strong>$${result.avg}</strong></span>
            <span>Low: <strong>$${result.low}</strong></span>
            <span>High: <strong>$${result.high}</strong></span>
          </div>
          <div>${recentItems}</div>
        </div>`;
    } catch (e) {
      resultsEl.innerHTML = `<p style="color:var(--red);padding:8px;font-size:13px">${esc(e.message)}</p>`;
    }
  }

  function applyEbayPrice(price) {
    document.getElementById('hwForm').elements.price_value.value = price;
    toast(`Market value set to $${price}`, 'success');
  }

  function init() {
    document.getElementById('hardwareSearch')?.addEventListener('input', debounce(e => {
      searchTerm = e.target.value.trim();
      load();
    }, 300));

    document.getElementById('filterHwPlatform')?.addEventListener('change', e => { filterPlatform = e.target.value; load(); });
    document.getElementById('filterHwType')?.addEventListener('change', e => { filterType = e.target.value; load(); });
    document.getElementById('filterHwCondition')?.addEventListener('change', e => { filterCondition = e.target.value; load(); });

    document.querySelectorAll('#hardwareTable thead th[data-sort]').forEach(th => {
      th.addEventListener('click', () => setSort(th.dataset.sort));
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
    wireConversion('hwPricePaid', 'hwPaidCurrency', 'hwPaidConversion');
    wireConversion('hwPriceValue', 'hwValueCurrency', 'hwValueConversion');

    document.getElementById('hwSelectAll')?.addEventListener('change', function () {
      if (this.checked) allItems.forEach(h => selectedIds.add(h.id));
      else selectedIds.clear();
      renderTable();
    });
    document.getElementById('saveHwBatchBtn')?.addEventListener('click', saveBatchEdit);

    document.getElementById('hwPcSearchBtn')?.addEventListener('click', searchPrices);
    document.getElementById('hwPcSearch')?.addEventListener('keydown', e => { if (e.key === 'Enter') searchPrices(); });
    document.getElementById('saveHwBtn')?.addEventListener('click', saveItem);

    document.querySelectorAll('[data-close-modal]').forEach(el => {
      el.addEventListener('click', () => closeModal(el.dataset.closeModal));
    });
    document.getElementById('hwModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('hwModal'); });
    document.getElementById('hwDetailModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('hwDetailModal'); });
  }

  return { init, load, openAdd, openEdit, openDetail, deleteItem, searchPrices, applyEbayPrice, refreshValue, refreshAllValues, toggleSelect, clearSelection, batchDelete, batchEdit };
})();
