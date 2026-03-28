const express = require('express');
const router = express.Router();
const axios = require('axios');
const db = require('../database');
const logger = require('../logger');

// ── IGDB platform ID map ───────────────────────────────────────────────────────
const PLATFORM_IDS = {
  // Nintendo home (regional variants share the same IGDB ID)
  'NES': [18], 'PAL NES': [18], 'Famicom': [18],
  'SNES': [19], 'PAL SNES': [19], 'Super Famicom': [19],
  'Nintendo 64': [4], 'PAL Nintendo 64': [4], 'Japan Nintendo 64': [4],
  'GameCube': [21],
  'Wii': [5],
  'Wii U': [41],
  'Nintendo Switch': [130],
  // Nintendo handheld
  'Game Boy': [33],
  'Game Boy Color': [22],
  'Game Boy Advance': [24],
  'Nintendo DS': [20],
  'Nintendo 3DS': [37],
  // Sony home
  'PlayStation': [7], 'PAL PlayStation': [7], 'Japan PlayStation': [7],
  'PlayStation 2': [8], 'PAL PlayStation 2': [8], 'Japan PlayStation 2': [8],
  'PlayStation 3': [9],
  'PlayStation 4': [48],
  'PlayStation 5': [167],
  // Sony handheld
  'PSP': [38],
  'PS Vita': [46],
  // Microsoft
  'Xbox': [11],
  'Xbox 360': [12],
  'Xbox One': [49],
  'Xbox Series X/S': [169],
  // Sega
  'Sega Master System': [64],
  'Sega Genesis': [29], 'Sega Mega Drive': [29], 'Japan Mega Drive': [29],
  'Sega Saturn': [32], 'PAL Sega Saturn': [32], 'Japan Sega Saturn': [32],
  'Sega Dreamcast': [23],
  'Game Gear': [35],
  // Other
  'Atari 2600': [59],
  'Neo Geo': [80],
  'PC': [6],
};

// ── Credentials & token cache ─────────────────────────────────────────────────
let _tokenCache = null; // { token, expires }

function getCredentials() {
  const id     = db.prepare("SELECT value FROM settings WHERE key = 'igdb_client_id'").get();
  const secret = db.prepare("SELECT value FROM settings WHERE key = 'igdb_client_secret'").get();
  return { clientId: id?.value || '', clientSecret: secret?.value || '' };
}

async function getToken() {
  if (_tokenCache && _tokenCache.expires > Date.now()) return _tokenCache.token;
  const { clientId, clientSecret } = getCredentials();
  if (!clientId || !clientSecret) throw new Error('IGDB credentials not configured — add them in Settings.');

  const resp = await axios.post('https://id.twitch.tv/oauth2/token', null, {
    params: { client_id: clientId, client_secret: clientSecret, grant_type: 'client_credentials' },
    timeout: 10000,
  });
  _tokenCache = {
    token: resp.data.access_token,
    expires: Date.now() + (resp.data.expires_in - 60) * 1000,
  };
  return _tokenCache.token;
}

async function igdbRequest(endpoint, body) {
  const { clientId } = getCredentials();
  const token = await getToken();
  const resp = await axios.post(`https://api.igdb.com/v4/${endpoint}`, body, {
    headers: {
      'Client-ID': clientId,
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
    timeout: 10000,
  });
  return resp.data;
}

function formatGame(g) {
  return {
    id: g.id,
    name: g.name,
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getFullYear() : null,
    platforms: (g.platforms || []).map(p => p.name),
    cover_url: g.cover?.url ? 'https:' + g.cover.url.replace('t_thumb', 't_cover_small') : null,
    genre: g.genres?.[0]?.name || null,
    developer: g.involved_companies?.find(c => c.developer)?.company?.name || null,
    publisher: g.involved_companies?.find(c => !c.developer)?.company?.name || null,
  };
}

const IGDB_FIELDS = 'fields name, cover.url, genres.name, involved_companies.company.name, involved_companies.developer, first_release_date, platforms.name;';

// ── Search ────────────────────────────────────────────────────────────────────
router.get('/search', async (req, res) => {
  const { q, platform } = req.query;
  if (!q || q.length < 2) return res.json([]);

  const platformIds = platform ? (PLATFORM_IDS[platform] || []) : [];
  const safe = q.replace(/"/g, '');
  const platPart = platformIds.length ? `platforms = (${platformIds.join(',')})` : null;

  // Query 1: IGDB keyword search (includes alternative names in their index)
  const q1Where = platPart ? `where ${platPart};` : '';
  const body1 = `${IGDB_FIELDS} search "${safe}"; ${q1Where} limit 10;`;

  // Query 2: substring match on primary name
  const q2Where = platPart
    ? `where name ~ *"${safe}"* & ${platPart};`
    : `where name ~ *"${safe}"*;`;
  const body2 = `${IGDB_FIELDS} ${q2Where} limit 10;`;

  // Query 3: explicit alternative_names lookup — catches regional variants like
  //          "Tombi!" (PAL) whose primary IGDB entry is named "Tomba!" (NTSC)
  const body3 = `where name ~ *"${safe}"*; fields game, name; limit 15;`;

  try {
    const [r1, r2, altNames] = await Promise.all([
      igdbRequest('games', body1).catch(() => []),
      igdbRequest('games', body2).catch(() => []),
      igdbRequest('alternative_names', body3).catch(() => []),
    ]);

    // Build alt-name map FIRST so it can override canonical names from any query.
    // e.g. altNameMap[tombaId] = "Tombi!" — even if search "Tombi" already found
    // the game as "Tomba!", we replace it with the regional name the user typed.
    const altNameMap = {};
    for (const a of altNames) {
      if (a.game && !altNameMap[a.game]) altNameMap[a.game] = a.name;
    }

    const applyAltName = g => altNameMap[g.id] ? { ...g, name: altNameMap[g.id] } : g;

    // Merge r1 + r2, applying alt names where applicable
    const seen = new Set();
    const merged = [];
    for (const g of [...r1, ...r2]) {
      if (!seen.has(g.id)) { seen.add(g.id); merged.push(applyAltName(g)); }
    }

    // Fetch any games only reachable via alternative_names (not returned by search/name queries)
    const altOnlyIds = [...new Set(altNames.map(a => a.game).filter(id => id && !seen.has(id)))];
    if (altOnlyIds.length) {
      const platFilter = platPart ? ` & ${platPart}` : '';
      const body4 = `${IGDB_FIELDS} where id = (${altOnlyIds.join(',')})${platFilter}; limit 10;`;
      const r4 = await igdbRequest('games', body4).catch(() => []);
      for (const g of r4) {
        if (!seen.has(g.id)) { seen.add(g.id); merged.push(applyAltName(g)); }
      }
    }

    const results = merged.slice(0, 15).map(formatGame);
    logger.info('igdb', `Search "${q}" (platform: ${platform || 'any'}) → ${results.length} results`, results.map(r => r.name).join(', '));
    res.json(results);
  } catch (e) {
    logger.error('igdb', `Search failed: ${e.message}`, `q="${q}"`);
    res.status(500).json({ error: e.message });
  }
});

// ── Full details by IGDB game ID ──────────────────────────────────────────────
router.get('/game/:id', async (req, res) => {
  const id = parseInt(req.params.id);
  if (!id) return res.status(400).json({ error: 'Invalid ID' });

  const body = `${IGDB_FIELDS} where id = ${id}; limit 1;`;

  try {
    const games = await igdbRequest('games', body);
    if (!games.length) return res.status(404).json({ error: 'Game not found' });
    res.json(formatGame(games[0]));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Credentials ───────────────────────────────────────────────────────────────
router.get('/key', (req, res) => {
  const { clientId, clientSecret } = getCredentials();
  res.json({ configured: !!(clientId && clientSecret) });
});

router.post('/key', (req, res) => {
  const { client_id, client_secret } = req.body;
  if (!client_id || !client_secret)
    return res.status(400).json({ error: 'Both Client ID and Client Secret are required.' });
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('igdb_client_id', ?)").run(client_id);
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('igdb_client_secret', ?)").run(client_secret);
  _tokenCache = null; // force token refresh with new credentials
  res.json({ success: true });
});

module.exports = router;
