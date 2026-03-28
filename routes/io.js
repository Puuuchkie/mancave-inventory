const express = require('express');
const router = express.Router();
const XLSX = require('xlsx');
const db = require('../database');

// ── Column definitions ────────────────────────────────────────────────────────

const GAME_COLS = [
  'title', 'platform', 'condition', 'edition', 'region', 'quantity',
  'genre', 'developer', 'publisher', 'release_year', 'catalog_number',
  'finished', 'personal_rating',
  'price_paid', 'price_paid_currency', 'price_value', 'price_value_currency',
  'date_acquired', 'where_purchased', 'remarks', 'cover_url',
];

const HW_COLS = [
  'name', 'type', 'platform', 'manufacturer', 'model_number',
  'condition', 'color_variant', 'region', 'quantity',
  'serial_number', 'has_original_box', 'has_all_accessories',
  'working_condition', 'modifications', 'integrity', 'jailbroken',
  'price_paid', 'price_paid_currency', 'price_value', 'price_value_currency',
  'date_acquired', 'where_purchased', 'remarks',
];

// ── Known-value lists (used by preview / wizard) ─────────────────────────────

const KNOWN_PLATFORMS = [
  // Nintendo home
  'NES', 'PAL NES', 'Famicom',
  'SNES', 'PAL SNES', 'Super Famicom',
  'Nintendo 64', 'PAL Nintendo 64', 'Japan Nintendo 64',
  'GameCube', 'PAL GameCube',
  'Wii', 'PAL Wii', 'Wii U', 'Nintendo Switch',
  // Nintendo handheld
  'Game Boy', 'Game Boy Color', 'Game Boy Advance',
  'Nintendo DS', 'Nintendo 3DS',
  // Sony home
  'PlayStation', 'PAL PlayStation', 'Japan PlayStation',
  'PlayStation 2', 'PAL PlayStation 2', 'Japan PlayStation 2',
  'PlayStation 3', 'PlayStation 4', 'PlayStation 5',
  // Sony handheld
  'PSP', 'PS Vita',
  // Microsoft
  'Xbox', 'Xbox 360', 'Xbox One', 'Xbox Series X/S',
  // Sega
  'Sega Master System',
  'Sega Genesis', 'Sega Mega Drive', 'Japan Mega Drive',
  'Sega Saturn', 'PAL Sega Saturn', 'Japan Sega Saturn',
  'Sega Dreamcast', 'Game Gear',
  // Other
  'Atari 2600', 'Neo Geo', 'PC', 'Multi-Platform',
];

const KNOWN_GAME_CONDITIONS = [
  'Sealed', 'Complete (CIB)', 'Manual Missing', 'Front Cover Missing',
  'Loose', 'Box Only', 'Manual Only', 'Graded', 'Poor / Damaged',
];

const KNOWN_HW_CONDITIONS = [
  'Factory Sealed', 'Working', 'Partially Working',
  'Refurbished', 'Poor', 'For Parts / Repair',
];

const KNOWN_INTEGRITY = ['Complete In Box', 'Loose', 'No Controllers'];

const KNOWN_REGIONS = [
  'NTSC (USA)', 'PAL (Europe)', 'PAL-AU (Australia)', 'NTSC-J (Japan)', 'Multi-Region',
];

const REGIONAL_PREFIX_RE = /^(pal|japan|ntsc-j|ntsc-u\/c|ntsc)\s+/i;

function isKnownPlatform(val) {
  if (!val) return true;
  const stripped = String(val).trim().replace(REGIONAL_PREFIX_RE, '').toLowerCase();
  return KNOWN_PLATFORMS.some(p => p.toLowerCase() === stripped);
}

function isKnownValue(val, list) {
  if (!val) return true;
  const v = String(val).trim().toLowerCase();
  return list.some(k => k.toLowerCase() === v);
}

// Collect unique non-null values for a column that fail the test fn
function unknownsFor(rows, col, testFn) {
  const seen = new Set();
  for (const r of rows) {
    const v = r[col];
    if (v != null && String(v).trim() !== '' && !testFn(v)) seen.add(String(v).trim());
  }
  return [...seen].sort();
}

// Apply user-supplied value mappings to a parsed row
function applyMappings(row, mappings) {
  if (!mappings || !Object.keys(mappings).length) return row;
  const out = { ...row };
  for (const [col, map] of Object.entries(mappings)) {
    const cur = out[col] != null ? String(out[col]).trim() : null;
    if (cur && map[cur]) out[col] = map[cur];
  }
  return out;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toBool(v) {
  if (v === true || v === 1 || v === '1' || String(v).toLowerCase() === 'true' || String(v).toLowerCase() === 'yes') return 1;
  return 0;
}

function toNum(v) {
  if (v === null || v === undefined || v === '') return null;
  // Strip currency symbols, spaces, and thousands separators before parsing
  const cleaned = String(v).replace(/[^0-9.\-]/g, '');
  const n = parseFloat(cleaned);
  return isNaN(n) ? null : n;
}

function toInt(v) {
  const n = parseInt(v);
  return isNaN(n) ? null : n;
}

function toStr(v) {
  if (v === undefined || v === null || v === '') return null;
  return String(v).trim() || null;
}

// Parse workbook from base64 buffer sent by client
function parseWorkbook(b64) {
  const buf = Buffer.from(b64, 'base64');
  return XLSX.read(buf, { type: 'buffer', cellDates: true });
}

// Common aliases: maps user-friendly column names to our internal field names
const ALIASES = {
  'price': 'price_paid', 'paid': 'price_paid', 'cost': 'price_paid',
  'value': 'price_value', 'market_value': 'price_value', 'market value': 'price_value',
  'print': 'edition', 'version': 'edition', 'variant': 'edition',
  'console': 'platform', 'system': 'platform',
  'name': 'title',  // games only — hardware uses 'name' natively
  'qty': 'quantity', 'count': 'quantity',
  'year': 'release_year', 'release year': 'release_year',
  'catalog': 'catalog_number', 'cat': 'catalog_number', 'serial': 'catalog_number',
  'dev': 'developer', 'pub': 'publisher',
  'bought': 'date_acquired', 'date': 'date_acquired', 'acquired': 'date_acquired',
  'shop': 'where_purchased', 'store': 'where_purchased', 'source': 'where_purchased',
  'notes': 'remarks', 'note': 'remarks', 'comment': 'remarks', 'comments': 'remarks',
  'complete': 'finished', 'played': 'finished', 'beat': 'finished',
  'rating': 'personal_rating', 'score': 'personal_rating',
};

function normalizeKey(k) {
  const s = String(k).toLowerCase().trim().replace(/[\s\-\/]+/g, '_');
  return ALIASES[s] || ALIASES[s.replace(/_/g, ' ')] || s;
}

// Merges a separate region column into the platform name using our naming convention.
// e.g. platform="PlayStation 2", region="PAL"  →  platform="PAL PlayStation 2"
//      platform="PlayStation",   region="Japan" →  platform="Japan PlayStation"
// NTSC (USA) is the default — no prefix added.
function mergePlatformRegion(platform, region) {
  if (!platform || !region) return platform || null;
  const p = String(platform).trim();
  const r = String(region).trim().toLowerCase();

  // Already has a regional prefix — don't double-add
  if (/^(pal|japan|ntsc)/i.test(p)) return p;

  if (r.includes('pal'))   return `PAL ${p}`;
  if (r.includes('japan') || r.includes('ntsc-j') || r.includes('ntscj')) return `Japan ${p}`;
  // NTSC (USA), NTSC-U/C, Multi-Region, Universal → no prefix
  return p;
}

// Detects if a column value looks like a standalone region code
const REGION_VALUES = ['pal', 'ntsc', 'ntsc-j', 'ntscj', 'japan', 'usa', 'eur', 'europe',
  'ntsc (usa)', 'ntsc-j (japan)', 'pal (europe)', 'pal-au (australia)', 'multi-region', 'universal'];

function looksLikeRegion(v) {
  return v != null && REGION_VALUES.some(r => String(v).toLowerCase().trim().startsWith(r));
}

function sheetToRows(wb) {
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false });
  if (!raw.length) return raw;

  // Normalize headers on every row
  const normalized = raw.map(row => {
    const out = {};
    for (const [k, v] of Object.entries(row)) out[normalizeKey(k)] = v;
    return out;
  });

  // Detect whether there's a separate region column that contains regional codes
  // (as opposed to a region column that has proper values like "PAL (Europe)" which
  // we already have a field for). We check the first non-null value in the column.
  const sample = normalized.find(r => r.region != null);
  const hasSeparateRegion = sample && looksLikeRegion(sample.region);

  if (hasSeparateRegion) {
    return normalized.map(row => ({
      ...row,
      platform: mergePlatformRegion(row.platform, row.region),
      // keep region as-is so it still saves to the region field
    }));
  }

  return normalized;
}

// ── PREVIEW (returns unknown values for wizard, does not insert) ──────────────

router.post('/preview/games', (req, res) => {
  const { file } = req.body;
  if (!file) return res.status(400).json({ error: 'No file provided' });
  let rows;
  try { rows = sheetToRows(parseWorkbook(file)); }
  catch (e) { return res.status(400).json({ error: 'Could not parse file: ' + e.message }); }

  const unknowns = {};
  const p = unknownsFor(rows, 'platform',  isKnownPlatform);
  const c = unknownsFor(rows, 'condition', v => isKnownValue(v, KNOWN_GAME_CONDITIONS));
  const r = unknownsFor(rows, 'region',    v => isKnownValue(v, KNOWN_REGIONS));
  if (p.length) unknowns.platform  = p;
  if (c.length) unknowns.condition = c;
  if (r.length) unknowns.region    = r;

  res.json({
    rows: rows.length,
    unknowns,
    known: { platform: KNOWN_PLATFORMS, condition: KNOWN_GAME_CONDITIONS, region: KNOWN_REGIONS },
  });
});

router.post('/preview/hardware', (req, res) => {
  const { file } = req.body;
  if (!file) return res.status(400).json({ error: 'No file provided' });
  let rows;
  try { rows = sheetToRows(parseWorkbook(file)); }
  catch (e) { return res.status(400).json({ error: 'Could not parse file: ' + e.message }); }

  const unknowns = {};
  const p = unknownsFor(rows, 'platform',  isKnownPlatform);
  const c = unknownsFor(rows, 'condition', v => isKnownValue(v, KNOWN_HW_CONDITIONS));
  const g = unknownsFor(rows, 'integrity', v => isKnownValue(v, KNOWN_INTEGRITY));
  const r = unknownsFor(rows, 'region',    v => isKnownValue(v, KNOWN_REGIONS));
  if (p.length) unknowns.platform  = p;
  if (c.length) unknowns.condition = c;
  if (g.length) unknowns.integrity = g;
  if (r.length) unknowns.region    = r;

  res.json({
    rows: rows.length,
    unknowns,
    known: { platform: KNOWN_PLATFORMS, condition: KNOWN_HW_CONDITIONS, integrity: KNOWN_INTEGRITY, region: KNOWN_REGIONS },
  });
});

// ── EXPORT ────────────────────────────────────────────────────────────────────

router.get('/export/games', (req, res) => {
  const fmt = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const rows = db.prepare('SELECT * FROM games ORDER BY title').all();
  const data = rows.map(g => {
    const out = {};
    GAME_COLS.forEach(c => { out[c] = g[c] ?? ''; });
    out.finished = g.finished ? 'Yes' : 'No';
    return out;
  });

  const ws = XLSX.utils.json_to_sheet(data, { header: GAME_COLS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Games');

  if (fmt === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(ws);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="games.csv"');
    return res.send(csv);
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="games.xlsx"');
  res.send(buf);
});

router.get('/export/hardware', (req, res) => {
  const fmt = req.query.format === 'csv' ? 'csv' : 'xlsx';
  const rows = db.prepare('SELECT * FROM hardware ORDER BY name').all();
  const data = rows.map(h => {
    const out = {};
    HW_COLS.forEach(c => { out[c] = h[c] ?? ''; });
    out.has_original_box     = h.has_original_box     ? 'Yes' : 'No';
    out.has_all_accessories  = h.has_all_accessories  ? 'Yes' : 'No';
    return out;
  });

  const ws = XLSX.utils.json_to_sheet(data, { header: HW_COLS });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Hardware');

  if (fmt === 'csv') {
    const csv = XLSX.utils.sheet_to_csv(ws);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="hardware.csv"');
    return res.send(csv);
  }
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="hardware.xlsx"');
  res.send(buf);
});

// ── IMPORT ────────────────────────────────────────────────────────────────────

router.post('/import/games', (req, res) => {
  const { file, mappings = {} } = req.body;
  if (!file) return res.status(400).json({ error: 'No file provided' });

  let rows;
  try {
    const wb = parseWorkbook(file);
    rows = sheetToRows(wb);
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse file: ' + e.message });
  }

  if (!rows.length) return res.json({ imported: 0, skipped: 0 });

  const stmt = db.prepare(`
    INSERT INTO games (
      title, platform, condition, edition, region, quantity,
      genre, developer, publisher, release_year, catalog_number,
      finished, personal_rating,
      price_paid, price_paid_currency, price_value, price_value_currency,
      date_acquired, where_purchased, remarks, cover_url
    ) VALUES (
      ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?
    )
  `);

  let imported = 0, skipped = 0;
  const importMany = db.transaction((rows) => {
    for (const raw of rows) {
      const r = applyMappings(raw, mappings);
      const title    = toStr(r.title);
      const platform = toStr(r.platform);
      if (!title || !platform) { skipped++; continue; }
      stmt.run(
        title, platform,
        toStr(r.condition), toStr(r.edition), toStr(r.region),
        toInt(r.quantity) || 1,
        toStr(r.genre), toStr(r.developer), toStr(r.publisher),
        toInt(r.release_year), toStr(r.catalog_number),
        toBool(r.finished), toInt(r.personal_rating),
        toNum(r.price_paid), toStr(r.price_paid_currency) || 'USD',
        toNum(r.price_value), toStr(r.price_value_currency) || 'USD',
        toStr(r.date_acquired), toStr(r.where_purchased),
        toStr(r.remarks), toStr(r.cover_url),
      );
      imported++;
    }
  });

  try {
    importMany(rows);
    res.json({ imported, skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.post('/import/hardware', (req, res) => {
  const { file, mappings = {} } = req.body;
  if (!file) return res.status(400).json({ error: 'No file provided' });

  let rows;
  try {
    const wb = parseWorkbook(file);
    rows = sheetToRows(wb);
  } catch (e) {
    return res.status(400).json({ error: 'Could not parse file: ' + e.message });
  }

  if (!rows.length) return res.json({ imported: 0, skipped: 0 });

  const stmt = db.prepare(`
    INSERT INTO hardware (
      name, type, platform, manufacturer, model_number,
      condition, color_variant, region, quantity,
      serial_number, has_original_box, has_all_accessories,
      working_condition, modifications, integrity, jailbroken,
      price_paid, price_paid_currency, price_value, price_value_currency,
      date_acquired, where_purchased, remarks
    ) VALUES (
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?
    )
  `);

  let imported = 0, skipped = 0;
  const importMany = db.transaction((rows) => {
    for (const raw of rows) {
      const r = applyMappings(raw, mappings);
      const name     = toStr(r.name);
      const type     = toStr(r.type);
      const platform = toStr(r.platform);
      if (!name || !type || !platform) { skipped++; continue; }
      stmt.run(
        name, type, platform,
        toStr(r.manufacturer), toStr(r.model_number),
        toStr(r.condition), toStr(r.color_variant), toStr(r.region),
        toInt(r.quantity) || 1,
        toStr(r.serial_number),
        toBool(r.has_original_box), toBool(r.has_all_accessories),
        toStr(r.working_condition) || null,
        toStr(r.modifications),
        toStr(r.integrity) || null, toBool(r.jailbroken),
        toNum(r.price_paid), toStr(r.price_paid_currency) || 'USD',
        toNum(r.price_value), toStr(r.price_value_currency) || 'USD',
        toStr(r.date_acquired), toStr(r.where_purchased),
        toStr(r.remarks),
      );
      imported++;
    }
  });

  try {
    importMany(rows);
    res.json({ imported, skipped });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
