const db = require('../database');

// In-process cache so stats requests don't re-parse the rates JSON on every call
let _cachedRates = null;
let _cachedBase = null;

function loadRates() {
  if (_cachedRates) return _cachedRates;
  const raw = db.prepare("SELECT value FROM settings WHERE key = 'exchange_rates'").get();
  if (!raw) return {};
  try { _cachedRates = JSON.parse(raw.value).rates || {}; } catch { _cachedRates = {}; }
  return _cachedRates;
}

function getBase() {
  if (_cachedBase) return _cachedBase;
  const row = db.prepare("SELECT value FROM settings WHERE key = 'currency_base'").get();
  _cachedBase = (row?.value || 'USD').toLowerCase();
  return _cachedBase;
}

// Call this whenever rates or base currency are updated
function invalidateCache() {
  _cachedRates = null;
  _cachedBase = null;
}

function convertToBase(amount, fromCurrency, base, rates) {
  if (!amount || isNaN(amount)) return 0;
  const f = (fromCurrency || 'usd').toLowerCase();
  const t = base.toLowerCase();
  if (f === t) return amount;
  const rFrom = f === 'usd' ? 1 : (rates[f] ?? 1);
  const rTo   = t === 'usd' ? 1 : (rates[t] ?? 1);
  return amount * rTo / rFrom;
}

// Sum a price field across rows, converting each row to the base currency
function sumInBase(rows, priceField, currencyField) {
  const rates = loadRates();
  const base = getBase();
  let total = 0;
  for (const row of rows) {
    const price = row[priceField];
    const qty = row.quantity || 1;
    if (price != null && !isNaN(price)) {
      total += convertToBase(price * qty, row[currencyField], base, rates);
    }
  }
  return total;
}

module.exports = { sumInBase, getBase, invalidateCache };
