const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../database');
const logger = require('../logger');

const PC_BASE = 'https://www.pricecharting.com';
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
// Search endpoint returns JSON by default — don't set Accept:text/html or it switches to HTML
const SEARCH_HEADERS = { 'User-Agent': UA };
// Game page needs browser-like headers to return full HTML
const PAGE_HEADERS  = { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.5' };

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
  if (c.includes('cib') || (c.includes('complete') && !c.includes('no manual'))) return 'complete_price';
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

async function fetchPriceFromPC(title, platform, condition) {
  // 1. Search for the game (returns JSON without auth)
  const q = encodeURIComponent([title, platform].filter(Boolean).join(' '));
  const searchResp = await axios.get(`${PC_BASE}/search-products?q=${q}&type=videogames`, {
    headers: SEARCH_HEADERS, responseType: 'text', timeout: 10000,
  });

  const data = JSON.parse(searchResp.data);
  if (!data.products?.length) {
    logger.warn('pricecharting', `No results for "${title}" on "${platform}"`);
    throw new Error('Game not found on PriceCharting');
  }
  logger.info('pricecharting', `Searching: "${title}" / "${platform}" (${data.products.length} results)`);

  // Pick best-matching product by title + console similarity
  const normalize = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const nt = normalize(title);
  const np = normalize(platform);

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

  // 2. Fetch the game page and extract the condition-specific price
  const pageResp = await axios.get(url, {
    headers: PAGE_HEADERS, responseType: 'text', timeout: 10000,
  });

  const priceId = priceIdForCondition(condition);
  let price = extractPrice(pageResp.data, priceId);

  // Fallback: if graded/box/manual price not listed, try used_price
  if (price === null && priceId !== 'used_price') {
    price = extractPrice(pageResp.data, 'used_price');
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
