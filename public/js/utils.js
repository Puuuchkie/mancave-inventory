// Shared utilities

function fmt$$(val, code) {
  if (val === null || val === undefined || val === '') return '—';
  if (typeof Currency !== 'undefined') return Currency.format(val, code);
  return '$' + parseFloat(val).toFixed(2);
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function bool(v) {
  return v === 1 || v === true || v === '1' || v === 'true';
}

function checkmark(v) {
  return bool(v)
    ? '<span class="check">✓</span>'
    : '<span class="cross">—</span>';
}

function conditionBadge(c) {
  if (!c) return '—';
  const cl = c.toLowerCase();
  let cls = 'badge-condition';
  if (cl.includes('sealed') || cl.includes('new')) cls = 'badge-sealed';
  else if (cl.includes('complete') || cl.includes('cib')) cls = 'badge-complete';
  else if (cl.includes('loose') || cl.includes('cart') || cl.includes('disc')) cls = 'badge-loose';
  else if (cl.includes('poor') || cl.includes('damaged') || cl.includes('parts')) cls = 'badge-poor';
  return `<span class="badge ${cls}">${esc(c)}</span>`;
}

function platformBadge(p) {
  if (!p) return '—';
  return `<span class="badge badge-platform">${esc(p)}</span>`;
}

function regionBadge(r) {
  if (!r) return '—';
  return `<span class="badge badge-region">${esc(r)}</span>`;
}

function typeBadge(t) {
  if (!t) return '—';
  return `<span class="badge badge-type">${esc(t)}</span>`;
}

function starRating(n) {
  if (!n) return '—';
  const full = Math.min(Math.round(n), 5);
  let s = '';
  for (let i = 1; i <= 5; i++) {
    s += i <= full ? '★' : '<span class="empty">★</span>';
  }
  return `<span class="rating-stars">${s}</span>`;
}

function priceDiff(paid, value, paidCurrency, valueCurrency) {
  if (!paid || !value) return '';
  let paidBase = paid, valueBase = value;
  if (typeof Currency !== 'undefined') {
    const base = Currency.settings().base;
    paidBase  = Currency.convert(paid,  paidCurrency  || base, base);
    valueBase = Currency.convert(value, valueCurrency || base, base);
    const diff = valueBase - paidBase;
    if (!diff) return '';
    const pct = ((diff / paidBase) * 100).toFixed(0);
    if (diff > 0) return `<span class="price-gain">▲ ${Currency.format(diff, base)} (+${pct}%)</span>`;
    return `<span class="price-loss">▼ ${Currency.format(Math.abs(diff), base)} (${pct}%)</span>`;
  }
  const diff = value - paid;
  const pct = ((diff / paid) * 100).toFixed(0);
  if (diff > 0) return `<span class="price-gain">▲ $${diff.toFixed(2)} (+${pct}%)</span>`;
  if (diff < 0) return `<span class="price-loss">▼ $${Math.abs(diff).toFixed(2)} (${pct}%)</span>`;
  return '';
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Toast notifications
function toast(msg, type = 'info') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  const icons = { success: '✓', error: '✕', info: 'ℹ' };
  el.innerHTML = `<span class="toast-icon">${icons[type] || 'ℹ'}</span><span>${esc(msg)}</span>`;
  container.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(20px)';
    el.style.transition = 'all 0.3s ease';
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

// Sort helper
function sortData(arr, key, dir) {
  return [...arr].sort((a, b) => {
    let av = a[key], bv = b[key];
    if (av === null || av === undefined) av = '';
    if (bv === null || bv === undefined) bv = '';
    if (typeof av === 'string') av = av.toLowerCase();
    if (typeof bv === 'string') bv = bv.toLowerCase();
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
}

// Debounce
function debounce(fn, ms = 300) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Modal helpers
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}
