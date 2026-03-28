const LogsPage = (() => {
  let autoRefreshTimer = null;
  let filterLevel = 'all';
  let filterSource = 'all';

  const LEVEL_COLORS = {
    info:    'log-level-info',
    success: 'log-level-success',
    warn:    'log-level-warn',
    error:   'log-level-error',
  };

  const LEVEL_LABELS = {
    info:    'INFO',
    success: 'OK',
    warn:    'WARN',
    error:   'ERR',
  };

  async function load() {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;
    try {
      const entries = await API.getLogs();
      render(entries);
    } catch (e) {
      const tbody = document.getElementById('logsTableBody');
      if (tbody) tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--red);padding:24px">Failed to load logs: ${e.message}</td></tr>`;
    }
  }

  function render(entries) {
    const tbody = document.getElementById('logsTableBody');
    if (!tbody) return;
    const filtered = entries.filter(e => {
      if (filterLevel !== 'all' && e.level !== filterLevel) return false;
      if (filterSource !== 'all' && e.source !== filterSource) return false;
      return true;
    });

    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:32px">No log entries</td></tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(e => {
      const cls = LEVEL_COLORS[e.level] || '';
      const label = LEVEL_LABELS[e.level] || e.level;
      const time = e.ts ? e.ts.slice(11, 19) : '';
      const data = e.data ? `<div class="log-data">${escHtml(e.data)}</div>` : '';
      return `<tr class="log-row ${cls}">
        <td class="log-ts">${escHtml(time)}</td>
        <td class="log-level-cell"><span class="log-badge log-badge-${e.level}">${label}</span></td>
        <td class="log-source">${escHtml(e.source || '')}</td>
        <td class="log-msg">${escHtml(e.message || '')}${data}</td>
      </tr>`;
    }).join('');
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  async function clearLogs() {
    try {
      await API.clearLogs();
      load();
      toast('Logs cleared', 'success');
    } catch (e) {
      toast('Failed to clear logs', 'error');
    }
  }

  function applyFilters() {
    filterLevel  = document.getElementById('logFilterLevel')?.value  || 'all';
    filterSource = document.getElementById('logFilterSource')?.value || 'all';
    load();
  }

  function startAutoRefresh() {
    stopAutoRefresh();
    autoRefreshTimer = setInterval(load, 5000);
  }

  function stopAutoRefresh() {
    if (autoRefreshTimer) { clearInterval(autoRefreshTimer); autoRefreshTimer = null; }
  }

  function init() {
    document.getElementById('logRefreshBtn')?.addEventListener('click', load);
    document.getElementById('logClearBtn')?.addEventListener('click', clearLogs);
    document.getElementById('logFilterLevel')?.addEventListener('change', applyFilters);
    document.getElementById('logFilterSource')?.addEventListener('change', applyFilters);
  }

  return { load, init, startAutoRefresh, stopAutoRefresh };
})();
