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

// Strip regional prefix and normalise capitalisation so PC search gets a clean platform name.
// e.g. "PAL Playstation 1" → "PlayStation"  /  "Japan Nintendo 64" → "Nintendo 64"
function normalizeForPcSearch(platform) {
  if (!platform) return '';
  let p = platform.trim();
  // Remove leading regional prefix
  p = p.replace(/^(PAL|Japan|NTSC-J|NTSC-U\/C|NTSC)\s+/i, '');
  // Fix capitalisation: "Playstation" → "PlayStation"
  p = p.replace(/\bPlaystation\b/gi, 'PlayStation');
  // PriceCharting uses "PlayStation" (not "PlayStation 1")
  p = p.replace(/^PlayStation\s*1$/i, 'PlayStation');
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

async function fetchPriceFromPC(title, platform, condition) {
  // Normalise platform before sending to PC (strips PAL/Japan prefix, fixes capitalisation)
  const pcPlatform = normalizeForPcSearch(platform);

  // 1. Search for the game (returns JSON without auth)
  const q = encodeURIComponent([title, pcPlatform].filter(Boolean).join(' '));
  const searchResp = await axiosWithRetry({
    method: 'get',
    url: `${PC_BASE}/search-products?q=${q}&type=videogames`,
    headers: SEARCH_HEADERS, responseType: 'text', timeout: 10000,
  });

  const data = JSON.parse(searchResp.data);
  if (!data.products?.length) {
    logger.warn('pricecharting', `No results for "${title}" on "${pcPlatform}"`);
    throw new Error('Game not found on PriceCharting');
  }
  logger.info('pricecharting', `Searching: "${title}" / "${pcPlatform}" (${data.products.length} results)`);

  // Pick best-matching product by title + console similarity
  const normalize = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const nt = normalize(title);
  const np = normalize(pcPlatform);

  function scoreProduct(p) {
    // Title score (0–100)
    const pn = normalize(p.productName);
    let titleScore;
    if (pn === nt) titleScore = 100;
    else if (pn.startsWith(nt + ' ')) titleScore = 80;
    else if (pn.includes(nt)) titleScore = 60;
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

  // 2a. Try to read price directly from search JSON (prices are in cents)
  // Field names used by PriceCharting search-products endpoint:
  const JSON_PRICE_MAP = {
    'used_price':     ['loosePrice',      'used_price',    'loose_price'],
    'complete_price': ['cibPrice',        'complete_price','cib_price'],
    'new_price':      ['newPrice',        'new_price',     'sealed_price'],
    'graded_price':   ['gradedPrice',     'graded_price'],
    'box_only_price': ['boxOnlyPrice',    'box_only_price'],
    'manual_only_price':['manualOnlyPrice','manual_only_price'],
  };

  function priceFromJson(prod, pid) {
    for (const field of (JSON_PRICE_MAP[pid] || [])) {
      const v = prod[field];
      if (v != null && v > 0) return parseFloat((v / 100).toFixed(2));
    }
    return null;
  }

  let price = priceFromJson(product, priceId);
  // Fallback to loose/used if primary condition has no price in JSON
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
