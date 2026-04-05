// Dashboard module
const Dashboard = (() => {
  async function load() {
    try {
      const [gStats, hStats, fsStats] = await Promise.all([
        API.getGameStats(),
        API.getHardwareStats(),
        API.getForSaleStats(),
      ]);

      // PSN trophy summary — silently skip if not connected
      API.getPsnStatus().then(s => {
        if (!s.connected || s.expired) return;
        return API.getPsnTrophySummary();
      }).then(summary => {
        if (!summary) return;
        const card = document.getElementById('dash-psn-card');
        if (card) card.style.display = '';
        const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
        set('psn-level', summary.trophyLevel);
        set('psn-platinum', summary.earnedTrophies.platinum);
        set('psn-gold', summary.earnedTrophies.gold);
        set('psn-silver', summary.earnedTrophies.silver);
        set('psn-bronze', summary.earnedTrophies.bronze);
        const bar = document.getElementById('psn-level-bar');
        if (bar) bar.style.width = (summary.progress || 0) + '%';
      }).catch(() => {});

      const totalPaid = (gStats.total_paid || 0) + (hStats.total_paid || 0);
      const totalValue = (gStats.total_value || 0) + (hStats.total_value || 0);

      document.getElementById('dash-game-titles').textContent = gStats.total_titles.toLocaleString();
      document.getElementById('dash-game-items').textContent = gStats.total_items.toLocaleString();
      document.getElementById('dash-hw-items').textContent = hStats.total_items.toLocaleString();
      document.getElementById('dash-finished').textContent = gStats.finished.toLocaleString();
      document.getElementById('dash-total-paid').textContent = Currency.format(totalPaid);
      document.getElementById('dash-total-value').textContent = Currency.format(totalValue);

      // For Sale stats
      const fsCount = document.getElementById('dash-for-sale-count');
      if (fsCount) fsCount.textContent = (fsStats.listed_count || 0).toLocaleString();
      const fsRevEl = document.getElementById('dash-sales-revenue');
      if (fsRevEl) fsRevEl.textContent = Currency.format(fsStats.revenue || 0);
      const fsProfEl = document.getElementById('dash-sales-profit');
      if (fsProfEl) {
        const profit = fsStats.profit || 0;
        if (profit > 0) {
          fsProfEl.textContent = `▲ ${Currency.format(profit)} profit`;
          fsProfEl.className = 'stat-sub price-gain';
        } else if (profit < 0) {
          fsProfEl.textContent = `▼ ${Currency.format(Math.abs(profit))} loss`;
          fsProfEl.className = 'stat-sub price-loss';
        } else {
          fsProfEl.textContent = fsStats.sold_count ? 'Break even' : '—';
          fsProfEl.className = 'stat-sub';
        }
      }

      // Sidebar badges
      const gBadge = document.getElementById('badge-games');
      if (gBadge) gBadge.textContent = gStats.total_titles;
      const fsBadge = document.getElementById('badge-forsale');
      if (fsBadge) fsBadge.textContent = fsStats.listed_count || 0;

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

      renderPie('dash-platforms', gStats.platforms, 'platform', 'count');
      renderPie('dash-genres', gStats.genres, 'genre', 'count');
      renderBarList('dash-hw-types', hStats.types, 'type', 'count');
      renderBarList('dash-hw-platforms', hStats.platforms, 'platform', 'count');
    } catch (e) {
      console.error('Dashboard load error:', e);
    }
  }

  const PIE_COLORS = [
    '#4f6ef7','#a78bfa','#3ecf8e','#f0a500','#22d3ee',
    '#f55','#e879f9','#fb923c','#34d399','#818cf8',
  ];

  function renderPie(containerId, data, labelKey, countKey) {
    const el = document.getElementById(containerId);
    if (!el || !data?.length) {
      if (el) el.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No data yet</p>';
      return;
    }

    const items = data.slice(0, 10);
    const total = items.reduce((s, d) => s + d[countKey], 0);
    if (!total) { el.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No data yet</p>'; return; }

    // Build SVG pie (conic-gradient-style using stroke-dasharray on a circle)
    const SIZE = 120, R = 48, CX = 60, CY = 60, CIRC = 2 * Math.PI * R;

    let offset = 0;
    const slices = items.map((d, i) => {
      const pct = d[countKey] / total;
      const dash = pct * CIRC;
      const gap  = CIRC - dash;
      const slice = `<circle cx="${CX}" cy="${CY}" r="${R}"
        fill="none" stroke="${PIE_COLORS[i % PIE_COLORS.length]}"
        stroke-width="24"
        stroke-dasharray="${dash.toFixed(2)} ${gap.toFixed(2)}"
        stroke-dashoffset="${(-offset * CIRC + CIRC / 4).toFixed(2)}"
        transform="rotate(-90 ${CX} ${CY})"/>`;
      offset += pct;
      return slice;
    });

    const svg = `<svg viewBox="0 0 ${SIZE} ${SIZE}" width="${SIZE}" height="${SIZE}" style="flex-shrink:0;display:block">
      ${slices.join('')}
    </svg>`;

    const legend = items.map((d, i) => {
      const pct = Math.round(d[countKey] / total * 100);
      return `<div class="pie-legend-item">
        <span class="pie-dot" style="background:${PIE_COLORS[i % PIE_COLORS.length]}"></span>
        <span class="pie-legend-label">${esc(d[labelKey] || 'Unknown')}</span>
        <span class="pie-legend-count">${d[countKey]} <span style="color:var(--text-muted)">(${pct}%)</span></span>
      </div>`;
    }).join('');

    el.innerHTML = `<div class="pie-wrap">${svg}<div class="pie-legend">${legend}</div></div>`;
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
