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
  let cls;
  if (cl === 'sealed' || cl === 'factory sealed') cls = 'badge-sealed';
  else if (cl.includes('cib') || cl.includes('complete in box') || cl === 'working') cls = 'badge-complete';
  else if (cl.includes('manual missing') || cl.includes('front cover') || cl.includes('partial')) cls = 'badge-warning';
  else if (cl.includes('loose')) cls = 'badge-loose';
  else if (cl.includes('refurb')) cls = 'badge-refurbished';
  else if (cl.includes('graded')) cls = 'badge-graded';
  else if (cl.includes('poor') || cl.includes('damaged') || cl.includes('parts') || cl.includes('repair')) cls = 'badge-poor';
  else if (cl.includes('box only') || cl.includes('manual only')) cls = 'badge-warning';
  else cls = 'badge-condition';
  return `<span class="badge ${cls}">${esc(c)}</span>`;
}

// Per-platform colour map. Regional prefixes (PAL, Japan, NTSC) are stripped
// before lookup so variants share the same colour as the base platform.
const PLATFORM_COLORS = {
  // PlayStation
  'playstation':       { bg: 'rgba(148,163,184,0.18)', color: '#94a3b8' },
  'playstation 2':     { bg: 'rgba(37,99,235,0.18)',   color: '#60a5fa' },
  'playstation 3':     { bg: 'rgba(62,207,142,0.18)',  color: '#3ecf8e' },
  'playstation 4':     { bg: 'rgba(79,110,247,0.18)',  color: '#818cf8' },
  'playstation 5':     { bg: 'rgba(226,232,240,0.12)', color: '#e2e8f0' },
  'psp':               { bg: 'rgba(79,110,247,0.18)',  color: '#818cf8' },
  'ps vita':           { bg: 'rgba(99,102,241,0.18)',  color: '#a5b4fc' },
  // Nintendo home
  'nes':               { bg: 'rgba(239,68,68,0.18)',   color: '#f87171' },
  'famicom':           { bg: 'rgba(239,68,68,0.18)',   color: '#f87171' },
  'snes':              { bg: 'rgba(139,92,246,0.18)',  color: '#c4b5fd' },
  'super famicom':     { bg: 'rgba(139,92,246,0.18)',  color: '#c4b5fd' },
  'nintendo 64':       { bg: 'rgba(16,185,129,0.18)',  color: '#6ee7b7' },
  'gamecube':          { bg: 'rgba(124,58,237,0.18)',  color: '#a78bfa' },
  'wii':               { bg: 'rgba(148,163,184,0.18)', color: '#cbd5e1' },
  'wii u':             { bg: 'rgba(37,99,235,0.18)',   color: '#93c5fd' },
  'nintendo switch':   { bg: 'rgba(239,68,68,0.18)',   color: '#f87171' },
  // Nintendo handheld
  'game boy':          { bg: 'rgba(51,65,85,0.35)',    color: '#94a3b8' },
  'game boy color':    { bg: 'rgba(234,179,8,0.18)',   color: '#fbbf24' },
  'game boy advance':  { bg: 'rgba(99,102,241,0.18)',  color: '#a5b4fc' },
  'nintendo ds':       { bg: 'rgba(59,130,246,0.18)',  color: '#93c5fd' },
  'nintendo 3ds':      { bg: 'rgba(220,38,38,0.18)',   color: '#fca5a5' },
  // Sega
  'sega master system':{ bg: 'rgba(239,68,68,0.18)',   color: '#f87171' },
  'sega genesis':      { bg: 'rgba(30,58,138,0.3)',    color: '#93c5fd' },
  'sega mega drive':   { bg: 'rgba(30,58,138,0.3)',    color: '#93c5fd' },
  'mega drive':        { bg: 'rgba(30,58,138,0.3)',    color: '#93c5fd' },
  'sega saturn':       { bg: 'rgba(148,163,184,0.18)', color: '#94a3b8' },
  'sega dreamcast':    { bg: 'rgba(249,115,22,0.18)',  color: '#fb923c' },
  'dreamcast':         { bg: 'rgba(249,115,22,0.18)',  color: '#fb923c' },
  'game gear':         { bg: 'rgba(51,65,85,0.35)',    color: '#94a3b8' },
  // Xbox
  'xbox':              { bg: 'rgba(21,128,61,0.22)',   color: '#4ade80' },
  'xbox 360':          { bg: 'rgba(21,128,61,0.22)',   color: '#86efac' },
  'xbox one':          { bg: 'rgba(15,118,110,0.22)',  color: '#34d399' },
  'xbox series x/s':   { bg: 'rgba(15,118,110,0.22)', color: '#34d399' },
  // Other
  'atari 2600':        { bg: 'rgba(180,120,50,0.22)',  color: '#fbbf24' },
  'neo geo':           { bg: 'rgba(220,38,38,0.22)',   color: '#fca5a5' },
  'pc':                { bg: 'rgba(79,110,247,0.18)',  color: '#818cf8' },
  'multi-platform':    { bg: 'rgba(148,163,184,0.15)', color: '#94a3b8' },
};

function platformBadge(p) {
  if (!p) return '—';
  // Strip regional prefix to find base platform colour
  const base = p.toLowerCase().replace(/^(pal|japan|ntsc|ntsc-j|ntsc-u\/c)\s+/i, '');
  const c = PLATFORM_COLORS[p.toLowerCase()] || PLATFORM_COLORS[base];
  if (c) return `<span class="badge" style="background:${c.bg};color:${c.color}">${esc(p)}</span>`;
  return `<span class="badge badge-platform">${esc(p)}</span>`;
}

function regionBadge(r) {
  if (!r) return '—';
  const rl = r.toLowerCase();
  let cls;
  if (rl.includes('usa') || rl.includes('ntsc-u') || rl === 'ntsc') cls = 'badge-region-usa';
  else if (rl.includes('japan') || rl.includes('ntsc-j'))            cls = 'badge-region-japan';
  else if (rl.includes('pal-au') || rl.includes('australia'))        cls = 'badge-region-au';
  else if (rl.includes('pal') || rl.includes('europe'))              cls = 'badge-region-pal';
  else if (rl.includes('multi') || rl.includes('universal'))         cls = 'badge-region-multi';
  else cls = 'badge-region';
  return `<span class="badge ${cls}">${esc(r)}</span>`;
}

function editionBadge(e) {
  if (!e) return '—';
  const el = e.toLowerCase();
  let cls;
  if (el.includes('standard') || el === 'base' || el === 'regular') cls = 'badge-edition-std';
  else if (el.includes('limit') || el.includes('special') || el.includes('exclusive')) cls = 'badge-edition-limited';
  else if (el.includes('collector') || el.includes('ultimate') || el.includes('premium')) cls = 'badge-edition-collector';
  else if (el.includes('steelbook')) cls = 'badge-edition-steel';
  else if (el.includes('deluxe')) cls = 'badge-edition-deluxe';
  else if (el.includes('day one') || el.includes('day 1') || el.includes('launch')) cls = 'badge-edition-day1';
  else if (el.includes('goty') || el.includes('game of the year') || el.includes('complete')) cls = 'badge-edition-goty';
  else cls = 'badge-edition-std';
  return `<span class="badge ${cls}">${esc(e)}</span>`;
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
