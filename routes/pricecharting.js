const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../database');
const logger = require('../logger');

const PC_BASE = 'https://www.pricecharting.com/api';

function getApiKey() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'pricecharting_api_key'").get();
  return row?.value || '';
}

// Map our condition values to the PriceCharting API price field
function priceFieldForCondition(condition) {
  if (!condition) return 'loose-price';
  const c = condition.toLowerCase();
  if (c.includes('sealed')) return 'new-price';
  if (c.includes('graded')) return 'graded-price';
  if (c.includes('cib') || (c.includes('complete') && !c.includes('no manual'))) return 'complete-price';
  if (c.includes('box only')) return 'box-only-price';
  if (c.includes('manual only')) return 'manual-only-price';
  return 'loose-price';
}

async function fetchPriceFromPC(title, platform, condition) {
  const key = getApiKey();
  if (!key) throw new Error('PriceCharting API key not configured — add it in Settings');

  // 1. Search for the product
  const q = [title, platform].filter(Boolean).join(' ');
  const searchResp = await axios.get(`${PC_BASE}/products`, {
    params: { q, id: key },
    timeout: 10000,
  });

  const data = searchResp.data;
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
    const pn = normalize(p['product-name'] || '');
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
    let consoleScore = 0;
    if (np) {
      const cn = normalize(p['console-name'] || '');
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

  // 2. Fetch full product details by ID to get condition-specific prices
  const detailResp = await axios.get(`${PC_BASE}/product`, {
    params: { id: product.id, key },
    timeout: 10000,
  });

  const detail = detailResp.data;
  const priceField = priceFieldForCondition(condition);
  // Prices come back in cents — divide by 100
  let price = detail[priceField] != null ? detail[priceField] / 100 : null;

  // Fallback: if specific condition price not available, try loose
  if ((price === null || price === 0) && priceField !== 'loose-price') {
    const fallback = detail['loose-price'];
    price = fallback != null ? fallback / 100 : null;
  }

  if (price === null || price === 0) throw new Error('Price not available on PriceCharting');

  const productName = detail['product-name'] || product['product-name'];
  const consoleName = detail['console-name'] || product['console-name'];
  logger.success('pricecharting', `${productName} / ${consoleName} → ${priceField}: $${price}`);
  return { price, product_name: productName, console_name: consoleName };
}

// GET /search — used by hardware page manual price search
router.get('/search', async (req, res) => {
  const { q, condition } = req.query;
  if (!q) return res.status(400).json({ error: 'Query parameter q is required' });
  try {
    const result = await fetchPriceFromPC(q, '', condition || '');
    res.json({ price: result.price, count: 1 });
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
    res.json({ price: result.price });
  } catch (err) {
    logger.error('pricecharting', err.message, `query="${req.body.query}" platform="${req.body.platform}"`);
    res.status(500).json({ error: err.message });
  }
});

// GET /token — key status (keeps existing frontend calls working)
router.get('/token', (req, res) => {
  const key = getApiKey();
  res.json({ configured: !!key });
});

// POST /token — save API key
router.post('/token', (req, res) => {
  const { token } = req.body;
  if (!token) return res.status(400).json({ error: 'API key is required' });
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('pricecharting_api_key', ?)").run(token);
  res.json({ success: true });
});

module.exports = router;
