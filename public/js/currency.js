const Currency = (() => {
  const DEFS = {
    USD: { name: 'US Dollar',          symbol: '$',    flag: '🇺🇸' },
    EUR: { name: 'Euro',               symbol: '€',    flag: '🇪🇺' },
    GBP: { name: 'British Pound',      symbol: '£',    flag: '🇬🇧' },
    ILS: { name: 'Israeli Shekel',     symbol: '₪',    flag: '🇮🇱' },
    JPY: { name: 'Japanese Yen',       symbol: '¥',    flag: '🇯🇵' },
    AUD: { name: 'Australian Dollar',  symbol: 'A$',   flag: '🇦🇺' },
    CAD: { name: 'Canadian Dollar',    symbol: 'C$',   flag: '🇨🇦' },
    CHF: { name: 'Swiss Franc',        symbol: 'Fr',   flag: '🇨🇭' },
    MXN: { name: 'Mexican Peso',       symbol: 'MX$',  flag: '🇲🇽' },
    BRL: { name: 'Brazilian Real',     symbol: 'R$',   flag: '🇧🇷' },
    KRW: { name: 'Korean Won',         symbol: '₩',    flag: '🇰🇷' },
    SEK: { name: 'Swedish Krona',      symbol: 'kr',   flag: '🇸🇪' },
    NOK: { name: 'Norwegian Krone',    symbol: 'kr',   flag: '🇳🇴' },
    PLN: { name: 'Polish Złoty',       symbol: 'zł',   flag: '🇵🇱' },
    NZD: { name: 'NZ Dollar',          symbol: 'NZ$',  flag: '🇳🇿' },
    SGD: { name: 'Singapore Dollar',   symbol: 'S$',   flag: '🇸🇬' },
    HKD: { name: 'HK Dollar',         symbol: 'HK$',  flag: '🇭🇰' },
    CNY: { name: 'Chinese Yuan',       symbol: '¥',    flag: '🇨🇳' },
    INR: { name: 'Indian Rupee',       symbol: '₹',    flag: '🇮🇳' },
    RUB: { name: 'Russian Ruble',      symbol: '₽',    flag: '🇷🇺' },
  };

  // rates[code] = how many of that currency per 1 USD
  let rates = { usd: 1 };
  let cfg = { base: 'USD', enabled: ['USD'] };

  async function load() {
    try {
      const [ratesRes, settingsRes] = await Promise.all([
        API.getCurrencyRates(),
        API.getCurrencySettings(),
      ]);
      rates = { ...ratesRes.rates, usd: 1 };
      cfg = settingsRes;
    } catch (e) {
      console.warn('Currency load failed:', e.message);
    }
  }

  // Convert amount from one currency to another using USD as pivot
  function convert(amount, from, to) {
    if (!amount || isNaN(amount)) return 0;
    const f = (from || 'USD').toLowerCase();
    const t = (to || 'USD').toLowerCase();
    if (f === t) return amount;
    const rFrom = f === 'usd' ? 1 : (rates[f] ?? 1);
    const rTo   = t === 'usd' ? 1 : (rates[t] ?? 1);
    return amount * rTo / rFrom;
  }

  // Format amount with the currency's symbol
  function format(amount, code) {
    if (amount === null || amount === undefined || isNaN(amount)) return '—';
    const c = (code || cfg.base).toUpperCase();
    const def = DEFS[c];
    const sym = def?.symbol ?? c + ' ';
    const decimals = (c === 'JPY' || c === 'KRW') ? 0 : 2;
    return sym + parseFloat(amount).toFixed(decimals);
  }

  // Show value in its original currency; if different from base also show base equivalent
  function formatWithBase(amount, fromCode) {
    if (amount === null || amount === undefined) return '—';
    const from = (fromCode || cfg.base).toUpperCase();
    const base = cfg.base.toUpperCase();
    const original = format(amount, from);
    if (from === base) return original;
    const converted = convert(amount, from, base);
    return `${original} <span class="price-converted">≈ ${format(converted, base)}</span>`;
  }

  // Conversion preview string: "₪ 183.50 · € 46.20"
  function preview(amount, fromCode) {
    if (!amount || isNaN(amount) || !parseFloat(amount)) return '';
    const from = (fromCode || cfg.base).toUpperCase();
    return cfg.enabled
      .filter(c => c !== from)
      .map(c => format(convert(parseFloat(amount), from, c), c))
      .join(' · ');
  }

  // Populate a <select> with currently enabled currencies, selecting `selected`
  function populateSelect(el, selected) {
    if (!el) return;
    const sel = (selected || cfg.base).toUpperCase();
    el.innerHTML = cfg.enabled.map(c => {
      const d = DEFS[c] || { symbol: c, flag: '' };
      return `<option value="${c}" ${c === sel ? 'selected' : ''}>${d.flag} ${c}</option>`;
    }).join('');
  }

  // Get/set config externally
  function settings() { return cfg; }
  function setSettings(s) { cfg = s; }
  function setRates(r) { rates = { ...r, usd: 1 }; }

  return { load, convert, format, formatWithBase, preview, populateSelect, settings, setSettings, setRates, DEFS };
})();
