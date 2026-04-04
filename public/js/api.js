// API client
const API = {
  async request(method, url, body) {
    const token = localStorage.getItem('mci_token');
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    if (res.status === 401) {
      localStorage.removeItem('mci_token');
      localStorage.removeItem('mci_username');
      window.location.href = '/login';
      throw new Error('Not authenticated');
    }
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Request failed');
    return data;
  },

  // Auth
  login:          (u, p)   => API.request('POST', '/api/auth/login',           { username: u, password: p }),
  register:       (u, p)   => API.request('POST', '/api/auth/register',        { username: u, password: p }),
  changePassword: (cur, nw)=> API.request('POST', '/api/auth/change-password', { current_password: cur, new_password: nw }),
  getUsers:       ()       => API.request('GET',  '/api/auth/users'),
  deleteUser:     (id)     => API.request('DELETE', `/api/auth/users/${id}`),
  getMe:          ()       => API.request('GET',  '/api/auth/me'),

  // Games
  getGames: (params = {}) => API.request('GET', '/api/games?' + new URLSearchParams(params)),
  getGame: (id) => API.request('GET', `/api/games/${id}`),
  getGameStats: () => API.request('GET', '/api/games/stats'),
  getGameOptions: () => API.request('GET', '/api/games/options'),
  createGame: (data) => API.request('POST', '/api/games', data),
  updateGame: (id, data) => API.request('PUT', `/api/games/${id}`, data),
  deleteGame: (id) => API.request('DELETE', `/api/games/${id}`),
  batchDeleteGames: (ids) => API.request('DELETE', '/api/games/batch/delete', { ids }),
  batchEditGames:   (ids, data) => API.request('PATCH',  '/api/games/batch/edit',   { ids, data }),

  // Hardware
  getHardware: (params = {}) => API.request('GET', '/api/hardware?' + new URLSearchParams(params)),
  getHardwareItem: (id) => API.request('GET', `/api/hardware/${id}`),
  getHardwareStats: () => API.request('GET', '/api/hardware/stats'),
  getHardwareOptions: (params = {}) => API.request('GET', '/api/hardware/options?' + new URLSearchParams(params)),
  createHardware: (data) => API.request('POST', '/api/hardware', data),
  updateHardware: (id, data) => API.request('PUT', `/api/hardware/${id}`, data),
  deleteHardware: (id) => API.request('DELETE', `/api/hardware/${id}`),
  batchDeleteHardware: (ids) => API.request('DELETE', '/api/hardware/batch/delete', { ids }),
  batchEditHardware:   (ids, data) => API.request('PATCH',  '/api/hardware/batch/edit',   { ids, data }),

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

  // PriceCharting
  applyPrice: (data) => API.request('POST', '/api/pricecharting/apply', data),
  fetchPriceFromUrl: (data) => API.request('POST', '/api/pricecharting/fetch-url', data),

  // Catalog number lookup (PS1/PS2/PS3)
  lookupCatalog: (serial) => API.request('GET', `/api/catalog/${encodeURIComponent(serial)}`),

  // Import / Export
  exportGames:    (format) => '/api/io/export/games?format=' + format,
  exportHardware: (format) => '/api/io/export/hardware?format=' + format,
  previewGames:   (file)           => API.request('POST', '/api/io/preview/games',    { file }),
  previewHardware:(file)           => API.request('POST', '/api/io/preview/hardware', { file }),
  importGames:    (file, mappings) => API.request('POST', '/api/io/import/games',    { file, mappings }),
  importHardware: (file, mappings) => API.request('POST', '/api/io/import/hardware', { file, mappings }),

  // For Sale
  getForSaleListings:    ()         => API.request('GET',    '/api/forsale'),
  getForSaleStats:       ()         => API.request('GET',    '/api/forsale/stats'),
  createForSaleListing:  (data)     => API.request('POST',   '/api/forsale', data),
  updateForSaleListing:  (id, data) => API.request('PUT',    `/api/forsale/${id}`, data),
  markForSaleSold:       (id, data) => API.request('POST',   `/api/forsale/${id}/sell`, data),
  deleteForSaleListing:  (id)       => API.request('DELETE', `/api/forsale/${id}`),

  // Logs
  getLogs:   () => API.request('GET', '/api/logs'),
  clearLogs: () => API.request('DELETE', '/api/logs'),

  // Scan
  getScanStatus: ()                     => API.request('GET',  '/api/scan/status'),
  scanGame:      (image, mimeType)      => API.request('POST', '/api/scan', { image, mimeType }),

  // PSN
  getPsnStatus:     ()        => API.request('GET',    '/api/psn/status'),
  connectPsn:       (npsso)   => API.request('POST',   '/api/psn/connect', { npsso }),
  disconnectPsn:    ()        => API.request('DELETE', '/api/psn/disconnect'),
  getPsnProfile:    ()        => API.request('GET',    '/api/psn/profile'),
  getPsnTrophies:   ()        => API.request('GET',    '/api/psn/trophies'),
};
