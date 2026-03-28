// Dashboard module
const Dashboard = (() => {
  async function load() {
    try {
      const [gStats, hStats] = await Promise.all([
        API.getGameStats(),
        API.getHardwareStats(),
      ]);

      const totalPaid = (gStats.total_paid || 0) + (hStats.total_paid || 0);
      const totalValue = (gStats.total_value || 0) + (hStats.total_value || 0);

      document.getElementById('dash-game-titles').textContent = gStats.total_titles.toLocaleString();
      document.getElementById('dash-game-items').textContent = gStats.total_items.toLocaleString();
      document.getElementById('dash-hw-items').textContent = hStats.total_items.toLocaleString();

      // Update sidebar badges — avoids a separate stats fetch
      const gBadge = document.getElementById('badge-games');
      const hBadge = document.getElementById('badge-hardware');
      if (gBadge) gBadge.textContent = gStats.total_titles;
      if (hBadge) hBadge.textContent = hStats.total_items;
      document.getElementById('dash-finished').textContent = gStats.finished.toLocaleString();
      document.getElementById('dash-total-paid').textContent = Currency.format(totalPaid);
      document.getElementById('dash-total-value').textContent = Currency.format(totalValue);

      const diff = totalValue - totalPaid;
      const diffEl = document.getElementById('dash-value-diff');
      if (diffEl) {
        if (diff > 0) {
          diffEl.textContent = `▲ ${Currency.format(diff)} gain`;
          diffEl.className = 'stat-sub price-gain';
        } else if (diff < 0) {
          diffEl.textContent = `▼ ${Currency.format(Math.abs(diff))} loss`;
          diffEl.className = 'stat-sub price-loss';
        } else {
          diffEl.textContent = 'Break even';
          diffEl.className = 'stat-sub';
        }
      }

      renderBarList('dash-platforms', gStats.platforms, 'platform', 'count');
      renderBarList('dash-genres', gStats.genres, 'genre', 'count');
      renderBarList('dash-hw-types', hStats.types, 'type', 'count');
      renderBarList('dash-hw-platforms', hStats.platforms, 'platform', 'count');
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
  }

  function renderBarList(containerId, data, labelKey, countKey) {
    const el = document.getElementById(containerId);
    if (!el || !data?.length) {
      if (el) el.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No data yet</p>';
      return;
    }
    const max = Math.max(...data.map(d => d[countKey]));
    el.innerHTML = data.slice(0, 8).map(d => `
      <div class="bar-item">
        <div class="bar-top">
          <span class="bar-label">${esc(d[labelKey] || 'Unknown')}</span>
          <span class="bar-count">${d[countKey]}</span>
        </div>
        <div class="bar-track">
          <div class="bar-fill" style="width:${(d[countKey] / max * 100).toFixed(1)}%"></div>
        </div>
      </div>`).join('');
  }

  return { load };
})();
