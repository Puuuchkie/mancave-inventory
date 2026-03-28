const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../database');
const { invalidateCache } = require('./currencyHelper');

const TTL = 60 * 60 * 1000; // 1 hour cache

async function doFetch() {
  // fawazahmed0's free currency API — no key required, 150+ currencies
  const response = await axios.get(
    'https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json',
    { timeout: 8000 }
  );
  const stored = {
    rates: response.data.usd,
    date: response.data.date,
    fetched_at: Date.now(),
  };
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('exchange_rates', ?)").run(JSON.stringify(stored));
  invalidateCache();
  return stored;
}

async function fetchRates() {
  const cached = db.prepare("SELECT value FROM settings WHERE key = 'exchange_rates'").get();
  if (cached) {
    const stored = JSON.parse(cached.value);
    if (Date.now() - stored.fetched_at < TTL) return stored;
    // Stale: return cached data immediately, refresh in background
    doFetch().catch(() => {});
    return stored;
  }
  // No data at all — must fetch synchronously (first ever run)
  return await doFetch();
}

router.get('/rates', async (req, res) => {
  try {
    const stored = await fetchRates();
    res.json({ rates: stored.rates, date: stored.date, fetched_at: stored.fetched_at });
  } catch (err) {
    res.status(500).json({ error: `Could not fetch rates: ${err.message}` });
  }
});

router.post('/refresh', async (req, res) => {
  try {
    db.prepare("DELETE FROM settings WHERE key = 'exchange_rates'").run();
    const stored = await fetchRates();
    res.json({ rates: stored.rates, date: stored.date });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/settings', (req, res) => {
  const base = db.prepare("SELECT value FROM settings WHERE key = 'currency_base'").get();
  const enabled = db.prepare("SELECT value FROM settings WHERE key = 'currency_enabled'").get();
  res.json({
    base: base?.value || 'USD',
    enabled: enabled?.value ? JSON.parse(enabled.value) : ['USD'],
  });
});

router.post('/settings', (req, res) => {
  const { base, enabled } = req.body;
  if (!base || !Array.isArray(enabled) || !enabled.length) {
    return res.status(400).json({ error: 'base and enabled[] are required' });
  }
  // Ensure base is always in enabled list
  const enabledSet = [...new Set([base, ...enabled])];
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('currency_base', ?)").run(base);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('currency_enabled', ?)").run(JSON.stringify(enabledSet));
  invalidateCache();
  res.json({ success: true });
});

module.exports = router;
