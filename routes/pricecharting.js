const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../database');
const logger = require('../logger');

const PC_BASE = 'https://www.pricecharting.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// Search endpoint returns JSON — include AJAX headers so the server treats it as a browser XHR
const SEARCH_HEADERS = {
  'User-Agent': UA,
  'Accept': 'application/json, text/javascript, */*; q=0.01',
  'Accept-Language': 'en-US,en;q=0.9',
  'X-Requested-With': 'XMLHttpRequest',
  'Referer': 'https://www.pricecharting.com/',
};
// Game page needs browser-like headers to return full HTML
const PAGE_HEADERS  = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.5', 'Referer': 'https://www.pricecharting.com/' };

// Normalise platform name capitalisation for PriceCharting.
// PriceCharting has PAL/Japan variants as separate consoles (e.g. "PAL Playstation 2",
// "PAL Xbox 360") so we keep the regional prefix — we only fix capitalisation.
function normalizeForPcSearch(platform) {
  if (!platform) return '';
  let p = platform.trim();
  // Fix "Playstation" → "PlayStation"
  p = p.replace(/\bPlaystation\b/gi, 'PlayStation');
  // Fix "XBOX" → "Xbox"
  p = p.replace(/\bXBOX\b/g, 'Xbox');
  // PriceCharting uses "PlayStation" not "PlayStation 1"
  p = p.replace(/\bPlayStation\s*1\b/i, 'PlayStation');
  return p;
}

function slugify(str) {
  return String(str).toLowerCase()
    .replace(/['']/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

// Map our condition values to the PriceCharting price element ID
function priceIdForCondition(condition) {
  if (!condition) return 'used_price';
  const c = condition.toLowerCase();
  if (c.includes('sealed')) return 'new_price';
  if (c.includes('graded')) return 'graded_price';
  if (c.includes('cib') || c.includes('complete in box') || (c.includes('complete') && !c.includes('no manual'))) return 'complete_price';
  if (c.includes('box only')) return 'box_only_price';
  if (c.includes('manual only')) return 'manual_only_price';
  if (c.includes('missing disc') || c.includes('missing cd')) return 'box_only_price';
  return 'used_price';
}

// Extract a single price from PriceCharting game page HTML by element ID
function extractPrice(html, priceId) {
  const re = new RegExp('id="' + priceId + '"[\\s\\S]*?\\$([\\d,]+\\.\\d{2})');
  const m = html.match(re);
  return m ? parseFloat(m[1].replace(/,/g, '')) : null;
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// Retry a request up to maxRetries times on 403/429 with exponential backoff
async function axiosWithRetry(opts, maxRetries = 3) {
  let delay = 1200;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await axios(opts);
    } catch (err) {
      const status = err.response?.status;
      if ((status === 403 || status === 429) && attempt < maxRetries) {
        logger.warn('pricecharting', `${status} received, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
        await sleep(delay);
        delay *= 2;
        continue;
      }
      throw err;
    }
  }
}

// Convert common Roman numerals to Arabic digits for fuzzy title matching.
// Handles word-boundary matches only to avoid clobbering words like "mix", "six", etc.
function normalizeNumerals(s) {
  return s
    .replace(/\bXIII\b/gi, '13').replace(/\bXII\b/gi, '12').replace(/\bXI\b/gi, '11').replace(/\bXIV\b/gi, '14').replace(/\bXV\b/gi, '15')
    .replace(/\bIX\b/gi, '9').replace(/\bVIII\b/gi, '8').replace(/\bVII\b/gi, '7').replace(/\bVI\b/gi, '6')
    .replace(/\bIV\b/gi, '4').replace(/\bIII\b/gi, '3').replace(/\bII\b/gi, '2');
}

async function fetchPriceFromPC(title, platform, condition) {
  // Normalise platform before sending to PC (strips PAL/Japan prefix, fixes capitalisation)
  const pcPlatform = normalizeForPcSearch(platform);

  // Strip bracket/paren content from the search query — PC's search API handles
  // "[Steelbook Edition]" poorly and returns zero results. We keep the full title
  // for scoring so steelbook/edition variants still win when PC does return them.
  const searchTitle = title.replace(/\s*\[[^\]]*\]/g, '').replace(/\s*\([^)]*\)/g, '').trim();

  // 1. Search for the game — use type=prices (type=videogames now 301s to this)
  const q = encodeURIComponent([searchTitle, pcPlatform].filter(Boolean).join(' '));
  const searchResp = await axiosWithRetry({
    method: 'get',
    url: `${PC_BASE}/search-products?q=${q}&type=prices`,
    headers: SEARCH_HEADERS, responseType: 'text', timeout: 10000,
    maxRedirects: 5,
  });

  const data = JSON.parse(searchResp.data);
  if (!data.products?.length) {
    logger.warn('pricecharting', `No results for "${title}" on "${pcPlatform}"`);
    throw new Error('Game not found on PriceCharting');
  }
  logger.info('pricecharting', `Searching: "${title}" / "${pcPlatform}" (${data.products.length} results)`);

  // Normalize: lowercase + roman numerals → arabic + collapse non-alphanumeric
  const normalize = s => normalizeNumerals(String(s).toLowerCase()).replace(/[^a-z0-9]+/g, ' ').trim();
  const nt = normalize(title);
  const np = normalize(pcPlatform);

  function scoreProduct(p) {
    // Title score (0–100)
    const pn = normalize(p.productName);
    let titleScore;
    if (pn === nt) titleScore = 100;
    else if (pn.startsWith(nt + ' ')) titleScore = 80;
    else if (pn.includes(nt)) titleScore = 60;
    else if (nt.startsWith(pn + ' ') || nt.includes(pn)) titleScore = 50; // query is more specific than result
    else {
      const pWords = new Set(pn.split(' '));
      const qWords = nt.split(' ').filter(Boolean);
      const overlap = qWords.filter(w => pWords.has(w)).length;
      titleScore = (overlap / Math.max(qWords.length, 1)) * 40;
    }
    // Console score (0–50): bonus when platform matches PriceCharting consoleName
    let consoleScore = 0;
    if (np) {
      const cn = normalize(p.consoleName);
      if (cn === np) consoleScore = 50;
      else if (cn.includes(np) || np.includes(cn)) consoleScore = 25;
    }
    return titleScore + consoleScore;
  }

  let product = data.products[0];
  let bestScore = scoreProduct(product);
  for (const p of data.products.slice(1)) {
    const s = scoreProduct(p);
    if (s > bestScore) { product = p; bestScore = s; }
  }

  const url = `${PC_BASE}/game/${slugify(product.consoleName)}/${slugify(product.productName)}`;
  const priceId = priceIdForCondition(condition);

  // 2a. Try to read price directly from search JSON.
  // PriceCharting search-products now returns price1 (loose), price2 (CIB),
  // price3 (new/sealed) as formatted dollar strings e.g. "$17.49".
  function parseDollarStr(s) {
    if (!s) return null;
    const n = parseFloat(String(s).replace(/[^0-9.]/g, ''));
    return (isNaN(n) || n === 0) ? null : n;
  }

  function priceFromJson(prod, pid) {
    if (pid === 'used_price')     return parseDollarStr(prod.price1);
    if (pid === 'complete_price') return parseDollarStr(prod.price2);
    if (pid === 'new_price')      return parseDollarStr(prod.price3);
    return null; // graded/box-only/manual-only not in search JSON → page scrape fallback
  }

  let price = priceFromJson(product, priceId);
  // Fallback to loose if primary condition has no price in JSON
  if (price === null && priceId !== 'used_price') {
    price = priceFromJson(product, 'used_price');
  }

  // 2b. If the search JSON didn't carry prices, scrape the game page
  if (price === null) {
    logger.info('pricecharting', `No price in search JSON for "${product.productName}", fetching page: ${url}`);
    const pageResp = await axiosWithRetry({
      method: 'get', url,
      headers: PAGE_HEADERS, responseType: 'text', timeout: 10000,
    });
    price = extractPrice(pageResp.data, priceId);
    if (price === null && priceId !== 'used_price') {
      price = extractPrice(pageResp.data, 'used_price');
    }
  }

  if (price === null) throw new Error('Price not available on PriceCharting');

  logger.success('pricecharting', `${product.productName} / ${product.consoleName} → ${priceId}: $${price}`, `query="${title}" platform="${platform}"`);
  return { price, url, product_name: product.productName, console_name: product.consoleName };
}

// POST /fetch-url — fetch price directly from a specific PriceCharting game URL
router.post('/fetch-url', async (req, res) => {
  const { url, condition, item_type, item_id } = req.body;
  if (!url) return res.status(400).json({ error: 'url is required' });

  // Validate it's actually a pricecharting.com URL
  let parsedUrl;
  try { parsedUrl = new URL(url); } catch { return res.status(400).json({ error: 'Invalid URL' }); }
  if (!parsedUrl.hostname.endsWith('pricecharting.com')) {
    return res.status(400).json({ error: 'URL must be from pricecharting.com' });
  }

  const priceId = priceIdForCondition(condition || '');
  logger.info('pricecharting', `Fetching URL: ${url} (condition: ${condition || 'loose'} → ${priceId})`);

  try {
    const pageResp = await axiosWithRetry({
      method: 'get', url,
      headers: PAGE_HEADERS, responseType: 'text', timeout: 12000,
    });

    let price = extractPrice(pageResp.data, priceId);
    if (price === null && priceId !== 'used_price') {
      price = extractPrice(pageResp.data, 'used_price');
    }
    if (price === null) return res.status(404).json({ error: 'Price not found on that page. Make sure the URL points to a specific game.' });

    // Optionally save to DB if item context provided
    if (item_id && item_type) {
      const table = item_type === 'hardware' ? 'hardware' : 'games';
      db.prepare(`UPDATE ${table} SET price_value = ?, price_value_currency = 'USD', updated_at = datetime('now') WHERE id = ?`)
        .run(price, item_id);
      logger.success('pricecharting', `Saved $${price} to ${table} id=${item_id} via URL`);
    }

    res.json({ price, url });
  } catch (err) {
    logger.error('pricecharting', err.message, `url="${url}"`);
    res.status(500).json({ error: err.message });
  }
});

// GET /search — used by hardware page manual price search
router.get('/search', async (req, res) => {
  const { q, condition } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter q is required' });
  try {
    const result = await fetchPriceFromPC(q, '', condition || '');
    res.json({ price: result.price, count: 1, source: result.url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /apply — fetch price and write it to the game/hardware record
router.post('/apply', async (req, res) => {
  const { query, platform, condition, item_type, item_id } = req.body;
  if (!query || !item_type || !item_id) {
    return res.status(400).json({ error: 'query, item_type, and item_id are required' });
  }
  try {
    const result = await fetchPriceFromPC(query, platform || '', condition || '');
    const table = item_type === 'hardware' ? 'hardware' : 'games';
    db.prepare(`UPDATE ${table} SET price_value = ?, price_value_currency = 'USD', updated_at = datetime('now') WHERE id = ?`)
      .run(result.price, item_id);
    res.json({ price: result.price, url: result.url });
  } catch (err) {
    logger.error('pricecharting', err.message, `query="${req.body.query}" platform="${req.body.platform}"`);
    res.status(500).json({ error: err.message });
  }
});

// No API key needed — these are kept so the settings UI doesn't break
router.get('/token', (req, res) => res.json({ configured: true }));
router.post('/token', (req, res) => res.json({ success: true }));

module.exports = router;
