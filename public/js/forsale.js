// For Sale module
const ForSalePage = (() => {
  let allListings = [];
  let sortKey = 'created_at', sortDir = 'desc';
  let filterStatus = '';
  let editingId = null, sellingId = null;
  let selectedItems = []; // { item_type, item_id, title, platform, condition, price_paid, price_paid_currency }

  async function load() {
    const tbody = document.getElementById('forsaleTableBody');
    if (tbody) tbody.innerHTML = `<tr><td colspan="8" class="loading"><div class="spinner"></div> Loading...</td></tr>`;
    try {
      allListings = await API.getForSaleListings();
      renderTable();
    } catch (e) { toast(e.message, 'error'); }
  }

  function renderTable() {
    const tbody = document.getElementById('forsaleTableBody');
    if (!tbody) return;

    const filtered = filterStatus
      ? allListings.filter(l => l.status === filterStatus)
      : allListings;
    const sorted = sortData(filtered, sortKey, sortDir);

    const countEl = document.getElementById('forsaleCount');
    if (countEl) countEl.textContent = `${sorted.length} listing${sorted.length !== 1 ? 's' : ''}`;

    const badge = document.getElementById('badge-forsale');
    if (badge) badge.textContent = allListings.filter(l => l.status === 'listed').length;

    if (!sorted.length) {
      tbody.innerHTML = `<tr><td colspan="8">
        <div class="empty-state">
          <div class="empty-icon">🏷️</div>
          <p>No listings yet. Create your first listing to start tracking sales.</p>
          <button class="btn btn-primary" onclick="ForSalePage.openCreate()">+ Create Listing</button>
        </div></td></tr>`;
      return;
    }

    tbody.innerHTML = sorted.map(l => {
      const itemCount = l.items ? l.items.length : 0;
      const itemPreviews = l.items ? l.items.slice(0, 2).map(i => esc(i.title)).join(', ') + (l.items.length > 2 ? ` +${l.items.length - 2} more` : '') : '';
      const statusBadge = l.status === 'sold'
        ? `<span class="badge badge-sold">✓ Sold</span>`
        : `<span class="badge badge-listed">🏷️ Listed</span>`;
      const askingFmt = l.asking_price != null ? Currency.formatWithBase(l.asking_price, l.asking_price_currency) : '—';
      const soldFmt   = l.sold_price   != null ? Currency.formatWithBase(l.sold_price,   l.sold_price_currency)   : '—';
      const soldAt    = l.sold_at ? l.sold_at.slice(0, 10) : '—';
      const created   = l.created_at ? l.created_at.slice(0, 10) : '—';

      return `<tr>
        <td>
          <div class="td-title">${esc(l.title)}</div>
          ${itemPreviews ? `<div class="td-sub">${itemPreviews}</div>` : ''}
        </td>
        <td>${statusBadge}</td>
        <td style="text-align:center">
          <span style="font-weight:600">${itemCount}</span>
          ${itemCount ? `<div class="td-sub" style="font-size:10px">${esc((l.items || []).map(i => i.platform).filter((v,i,a)=>v&&a.indexOf(v)===i).slice(0,2).join(', '))}</div>` : ''}
        </td>
        <td>${askingFmt}</td>
        <td>${soldFmt}</td>
        <td style="color:var(--text-muted);font-size:12px">${soldAt}</td>
        <td style="color:var(--text-muted);font-size:12px">${created}</td>
        <td onclick="event.stopPropagation()">
          <div class="row-actions">
            ${l.status === 'listed' ? `<button class="btn btn-success btn-sm btn-icon" title="Mark as Sold" onclick="ForSalePage.openSell(${l.id}, '${esc(l.title).replace(/'/g, "\\'")}')">✓</button>` : ''}
            <button class="btn btn-ghost btn-sm btn-icon" title="Edit" onclick="ForSalePage.openEdit(${l.id})">✎</button>
            <button class="btn btn-ghost btn-sm btn-icon" title="Delete / Return to inventory" onclick="ForSalePage.deleteListing(${l.id}, '${esc(l.title).replace(/'/g, "\\'")}')">✕</button>
          </div>
        </td>
      </tr>`;
    }).join('');

    // Sort icons
    document.querySelectorAll('#forsaleTable thead th[data-sort]').forEach(th => {
      th.classList.toggle('sorted', th.dataset.sort === sortKey);
      const icon = th.querySelector('.sort-icon');
      if (icon) icon.textContent = th.dataset.sort === sortKey ? (sortDir === 'asc' ? '↑' : '↓') : '↕';
    });
  }

  // ── Create / Edit Listing ────────────────────────────────────────────────────

  function openCreate() {
    editingId = null;
    selectedItems = [];
    document.getElementById('forsaleModalTitle').textContent = 'Create Listing';
    document.getElementById('fsTitle').value = '';
    document.getElementById('fsAskingPrice').value = '';
    document.getElementById('fsNotes').value = '';
    document.getElementById('fsItemSearch').value = '';
    document.getElementById('fsItemResults').innerHTML = '';
    Currency.populateSelect(document.getElementById('fsAskingCurrency'));
    document.getElementById('saveForsaleBtn').textContent = 'Create Listing';
    renderSelectedItems();
    openModal('forsaleModal');
  }

  async function openEdit(id) {
    editingId = id;
    try {
      const listing = allListings.find(l => l.id === id);
      if (!listing) return;
      document.getElementById('forsaleModalTitle').textContent = 'Edit Listing';
      document.getElementById('fsTitle').value = listing.title || '';
      document.getElementById('fsAskingPrice').value = listing.asking_price ?? '';
      document.getElementById('fsNotes').value = listing.notes || '';
      document.getElementById('fsItemSearch').value = '';
      document.getElementById('fsItemResults').innerHTML = '';
      Currency.populateSelect(document.getElementById('fsAskingCurrency'), listing.asking_price_currency);
      document.getElementById('saveForsaleBtn').textContent = 'Save Changes';
      // Copy existing items as selectedItems (display only — can't remove from edit)
      selectedItems = (listing.items || []).map(i => ({
        item_type: i.item_type, item_id: i.item_id,
        title: i.title, platform: i.platform,
        condition: i.item_condition,
        price_paid: i.price_paid, price_paid_currency: i.price_paid_currency,
      }));
      renderSelectedItems();
      openModal('forsaleModal');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function saveListing() {
    const title = document.getElementById('fsTitle').value.trim();
    const asking_price = parseFloat(document.getElementById('fsAskingPrice').value) || null;
    const asking_price_currency = document.getElementById('fsAskingCurrency').value || 'USD';
    const notes = document.getElementById('fsNotes').value.trim() || null;

    if (!title) { toast('Title is required', 'error'); return; }

    try {
      if (editingId) {
        await API.updateForSaleListing(editingId, { title, asking_price, asking_price_currency, notes });
        toast('Listing updated!', 'success');
      } else {
        if (!selectedItems.length) { toast('Add at least one item to the listing', 'error'); return; }
        await API.createForSaleListing({ title, asking_price, asking_price_currency, notes, items: selectedItems });
        toast('Listing created!', 'success');
      }
      closeModal('forsaleModal');
      load();
      App.loadSidebarCounts();
    } catch (e) { toast(e.message, 'error'); }
  }

  // ── Item Search ──────────────────────────────────────────────────────────────

  async function searchItems(q) {
    const resultsEl = document.getElementById('fsItemResults');
    if (!q || q.length < 2) { resultsEl.innerHTML = ''; return; }
    resultsEl.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:12px">Searching…</div>';
    try {
      const [games, hardware] = await Promise.all([
        API.getGames({ search: q }),
        API.getHardware({ search: q }),
      ]);
      const results = [
        ...games.map(g => ({ item_type: 'game', item_id: g.id, title: g.title, platform: g.platform, condition: g.condition, price_paid: g.price_paid, price_paid_currency: g.price_paid_currency })),
        ...hardware.map(h => ({ item_type: 'hardware', item_id: h.id, title: h.name, platform: h.platform, condition: h.condition, price_paid: h.price_paid, price_paid_currency: h.price_paid_currency })),
      ];
      if (!results.length) {
        resultsEl.innerHTML = '<div style="padding:8px;color:var(--text-muted);font-size:12px">No items found</div>';
        return;
      }
      resultsEl.innerHTML = results.slice(0, 10).map((r, i) => {
        const already = selectedItems.some(s => s.item_type === r.item_type && s.item_id === r.item_id);
        const typeTag = r.item_type === 'game' ? '🎮' : '🕹️';
        return `<div class="fs-result-item ${already ? 'fs-result-added' : ''}" onclick="ForSalePage.addItem(${i})" data-result-idx="${i}">
          <span class="fs-result-icon">${typeTag}</span>
          <div class="fs-result-info">
            <div class="fs-result-title">${esc(r.title)}</div>
            <div class="fs-result-sub">${esc(r.platform || '')}${r.condition ? ' · ' + esc(r.condition) : ''}</div>
          </div>
          ${already ? '<span style="color:var(--green);font-size:11px">Added</span>' : '<span style="color:var(--accent);font-size:11px">+ Add</span>'}
        </div>`;
      }).join('');
      // Store results for addItem()
      resultsEl._searchResults = results;
    } catch (e) {
      resultsEl.innerHTML = `<div style="padding:8px;color:var(--red);font-size:12px">${esc(e.message)}</div>`;
    }
  }

  function addItem(idx) {
    const resultsEl = document.getElementById('fsItemResults');
    const results = resultsEl._searchResults || [];
    const item = results[idx];
    if (!item) return;
    const already = selectedItems.some(s => s.item_type === item.item_type && s.item_id === item.item_id);
    if (already) return;
    selectedItems.push(item);
    renderSelectedItems();
    // Re-render results to show "Added" tag
    const el = resultsEl.querySelector(`[data-result-idx="${idx}"]`);
    if (el) {
      el.classList.add('fs-result-added');
      const addSpan = el.querySelector('span:last-child');
      if (addSpan) { addSpan.textContent = 'Added'; addSpan.style.color = 'var(--green)'; }
    }
  }

  function removeItem(idx) {
    selectedItems.splice(idx, 1);
    renderSelectedItems();
  }

  function renderSelectedItems() {
    const el = document.getElementById('fsSelectedItems');
    if (!el) return;
    if (!selectedItems.length) {
      el.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px 0">No items added yet. Search above to add items.</p>';
      return;
    }
    el.innerHTML = selectedItems.map((item, idx) => {
      const typeTag = item.item_type === 'game' ? '🎮' : '🕹️';
      return `<div class="fs-selected-item">
        <span class="fs-result-icon">${typeTag}</span>
        <div class="fs-result-info" style="flex:1">
          <div style="font-weight:600;font-size:13px">${esc(item.title)}</div>
          <div style="font-size:11px;color:var(--text-muted)">${esc(item.platform || '')}${item.condition ? ' · ' + esc(item.condition) : ''}${item.price_paid != null ? ' · Paid: ' + Currency.formatWithBase(item.price_paid, item.price_paid_currency) : ''}</div>
        </div>
        ${editingId ? '' : `<button class="btn btn-ghost btn-sm btn-icon" onclick="ForSalePage.removeItem(${idx})" title="Remove">✕</button>`}
      </div>`;
    }).join('');
  }

  // ── Mark as Sold ─────────────────────────────────────────────────────────────

  function openSell(id, title) {
    sellingId = id;
    const titleEl = document.getElementById('sellModalListingTitle');
    if (titleEl) titleEl.textContent = `Listing: "${title}"`;
    document.getElementById('sellPrice').value = '';
    document.getElementById('sellDate').value = new Date().toISOString().slice(0, 10);
    Currency.populateSelect(document.getElementById('sellCurrency'));
    openModal('sellModal');
  }

  async function confirmSell() {
    if (!sellingId) return;
    const sold_price = parseFloat(document.getElementById('sellPrice').value) || null;
    const sold_price_currency = document.getElementById('sellCurrency').value || 'USD';
    const sold_at = document.getElementById('sellDate').value || new Date().toISOString().slice(0, 10);
    try {
      await API.markForSaleSold(sellingId, { sold_price, sold_price_currency, sold_at });
      toast('Listing marked as sold!', 'success');
      closeModal('sellModal');
      sellingId = null;
      load();
      Dashboard.load();
    } catch (e) { toast(e.message, 'error'); }
  }

  // ── Delete Listing ──────────────────────────────────────────────────────────

  async function deleteListing(id, title) {
    if (!confirm(`Delete listing "${title}"?\n\nItems will be returned to your inventory.`)) return;
    try {
      await API.deleteForSaleListing(id);
      toast('Listing deleted — items returned to inventory', 'success');
      load();
      App.loadSidebarCounts();
    } catch (e) { toast(e.message, 'error'); }
  }

  function setSort(key) {
    if (sortKey === key) sortDir = sortDir === 'asc' ? 'desc' : 'asc';
    else { sortKey = key; sortDir = 'asc'; }
    renderTable();
  }

  function init() {
    document.querySelectorAll('[data-fs-status]').forEach(chip => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('[data-fs-status]').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        filterStatus = chip.dataset.fsStatus;
        renderTable();
      });
    });

    document.querySelectorAll('#forsaleTable thead th[data-sort]').forEach(th => {
      th.addEventListener('click', () => setSort(th.dataset.sort));
    });

    document.getElementById('saveForsaleBtn')?.addEventListener('click', saveListing);
    document.getElementById('confirmSellBtn')?.addEventListener('click', confirmSell);

    document.getElementById('fsItemSearch')?.addEventListener('input', debounce(e => searchItems(e.target.value.trim()), 300));

    document.getElementById('forsaleModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('forsaleModal'); });
    document.getElementById('sellModal')?.addEventListener('click', e => { if (e.target === e.currentTarget) closeModal('sellModal'); });
  }

  return { init, load, openCreate, openEdit, openSell, deleteListing, addItem, removeItem };
})();
