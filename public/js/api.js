// API client
const API = {
  async request(method, url, body) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  // Games
  getGames: (params = {}) => API.request('GET', '/api/games?' + new URLSearchParams(params)),
  getGame: (id) => API.request('GET', `/api/games/${id}`),
  getGameStats: () => API.request('GET', '/api/games/stats'),
  getGameOptions: () => API.request('GET', '/api/games/options'),
  createGame: (data) => API.request('POST', '/api/games', data),
  updateGame: (id, data) => API.request('PUT', `/api/games/${id}`, data),
  deleteGame: (id) => API.request('DELETE', `/api/games/${id}`),

  // Hardware
  getHardware: (params = {}) => API.request('GET', '/api/hardware?' + new URLSearchParams(params)),
  getHardwareItem: (id) => API.request('GET', `/api/hardware/${id}`),
  getHardwareStats: () => API.request('GET', '/api/hardware/stats'),
  getHardwareOptions: () => API.request('GET', '/api/hardware/options'),
  createHardware: (data) => API.request('POST', '/api/hardware', data),
  updateHardware: (id, data) => API.request('PUT', `/api/hardware/${id}`, data),
  deleteHardware: (id) => API.request('DELETE', `/api/hardware/${id}`),

  // Game DB autocomplete (IGDB)
  searchGameDB: (q, platform) => API.request('GET', '/api/autocomplete/search?' + new URLSearchParams(platform ? { q, platform } : { q })),
  getGameDetails: (id) => API.request('GET', `/api/autocomplete/game/${id}`),
  checkIgdbKey: () => API.request('GET', '/api/autocomplete/key'),
  saveIgdbKey: (data) => API.request('POST', '/api/autocomplete/key', data),

  // Currency
  getCurrencyRates: () => API.request('GET', '/api/currency/rates'),
  getCurrencySettings: () => API.request('GET', '/api/currency/settings'),
  saveCurrencySettings: (data) => API.request('POST', '/api/currency/settings', data),
  refreshRates: () => API.request('POST', '/api/currency/refresh'),

  // Platforms
  getPlatformSettings: () => API.request('GET', '/api/platforms/settings'),
  savePlatformSettings: (data) => API.request('POST', '/api/platforms/settings', data),

  // eBay pricing
  searchPrices: (q, category) => API.request('GET', '/api/pricecharting/search?' + new URLSearchParams(category ? { q, category } : { q })),
  applyPrice: (data) => API.request('POST', '/api/pricecharting/apply', data),
  getTokenStatus: () => API.request('GET', '/api/pricecharting/token'),
  saveToken: (token) => API.request('POST', '/api/pricecharting/token', { token }),

  // Catalog number lookup (PS1/PS2/PS3)
  lookupCatalog: (serial) => API.request('GET', `/api/catalog/${encodeURIComponent(serial)}`),

  // Logs
  getLogs:   () => API.request('GET', '/api/logs'),
  clearLogs: () => API.request('DELETE', '/api/logs'),
};
