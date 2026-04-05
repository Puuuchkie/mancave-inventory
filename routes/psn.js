const express = require('express');
const router = express.Router();
const db = require('../database');
const logger = require('../logger');

// psn-api is ESM-only — lazy import
let psnApi = null;
async function getPsnApi() {
  if (!psnApi) psnApi = await import('psn-api');
  return psnApi;
}

function getStoredTokens() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'psn_tokens'").get();
  return row ? JSON.parse(row.value) : null;
}
function saveTokens(tokens) {
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('psn_tokens', ?)").run(JSON.stringify(tokens));
}

async function getAccessToken() {
  const { exchangeRefreshTokenForAuthTokens } = await getPsnApi();
  const tokens = getStoredTokens();
  if (!tokens) throw new Error('PSN not connected — save your NPSSO token in Settings first');

  if (tokens.accessToken && tokens.expiresAt && Date.now() < tokens.expiresAt - 300000) {
    return tokens.accessToken;
  }
  if (tokens.refreshToken) {
    try {
      const refreshed = await exchangeRefreshTokenForAuthTokens(tokens.refreshToken);
      const updated = {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || tokens.refreshToken,
        expiresAt: Date.now() + (refreshed.expiresIn || 3600) * 1000,
      };
      saveTokens(updated);
      return updated.accessToken;
    } catch (err) {
      logger.warn('psn', 'Token refresh failed: ' + err.message);
    }
  }
  throw new Error('PSN session expired — reconnect with a new NPSSO token in Settings');
}

// Map PSN platform strings to our platform names
function mapPsnPlatform(psnPlatform, category) {
  const p = (psnPlatform || category || '').toUpperCase();
  if (p.includes('PS5') || p === 'PS5_NATIVE_GAME') return 'PlayStation 5';
  if (p.includes('PS4') || p === 'PS4_GAME')        return 'PlayStation 4';
  if (p.includes('PS3'))                             return 'PlayStation 3';
  if (p.includes('VITA') || p.includes('PSVITA'))   return 'PS Vita';
  if (p.includes('PSP'))                             return 'PSP';
  return null;
}

function normTitle(s) {
  return String(s || '').toLowerCase().replace(/[®™©]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}

// ── POST /api/psn/connect ────────────────────────────────────────────────────
router.post('/connect', async (req, res) => {
  const { npsso } = req.body;
  if (!npsso || npsso.length < 20) return res.status(400).json({ error: 'Valid NPSSO token required' });
  try {
    const { exchangeNpssoForCode, exchangeCodeForAccessToken } = await getPsnApi();
    const code = await exchangeNpssoForCode(npsso);
    const auth = await exchangeCodeForAccessToken(code);
    saveTokens({
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt: Date.now() + (auth.expiresIn || 3600) * 1000,
    });
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('psn_npsso_hint', ?)").run(npsso.slice(0, 6) + '…');
    logger.success('psn', 'Connected successfully');
    res.json({ success: true });
  } catch (err) {
    logger.error('psn', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/psn/status ──────────────────────────────────────────────────────
router.get('/status', (req, res) => {
  const tokens = getStoredTokens();
  const hint = db.prepare("SELECT value FROM settings WHERE key = 'psn_npsso_hint'").get();
  if (!tokens) return res.json({ connected: false });
  const expired = !tokens.expiresAt || Date.now() > tokens.expiresAt;
  res.json({ connected: true, expired, hint: hint?.value || null });
});

// ── DELETE /api/psn/disconnect ────────────────────────────────────────────────
router.delete('/disconnect', (req, res) => {
  db.prepare("DELETE FROM settings WHERE key IN ('psn_tokens', 'psn_npsso_hint')").run();
  res.json({ success: true });
});

// ── GET /api/psn/trophy-summary ──────────────────────────────────────────────
// Overall trophy stats: level, tier, platinum/gold/silver/bronze counts
router.get('/trophy-summary', async (req, res) => {
  try {
    const { getUserTrophyProfileSummary } = await getPsnApi();
    const accessToken = await getAccessToken();
    const summary = await getUserTrophyProfileSummary({ accessToken }, 'me');
    res.json(summary);
  } catch (err) {
    logger.error('psn', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /api/psn/import-preview ──────────────────────────────────────────────
// Returns merged list of played games + trophy data for the import modal
router.get('/import-preview', async (req, res) => {
  try {
    const { getUserPlayedGames, getUserTitles } = await getPsnApi();
    const accessToken = await getAccessToken();

    // Fetch up to 800 played games and trophy titles in parallel
    const [playedRes, trophyRes] = await Promise.all([
      getUserPlayedGames({ accessToken }, 'me', { limit: 800 }),
      getUserTitles({ accessToken }, 'me', { limit: 800 }),
    ]);

    // Build trophy lookup map: normTitle → trophy entry
    const trophyMap = new Map();
    for (const t of trophyRes.trophyTitles || []) {
      trophyMap.set(normTitle(t.trophyTitleName), t);
    }

    // Get existing games from DB for dedup check
    const existing = db.prepare('SELECT title, platform, psn_title_id FROM games').all();
    const existingByPsnId = new Map(existing.filter(g => g.psn_title_id).map(g => [g.psn_title_id, g]));
    const existingByTitle = new Map(existing.map(g => [normTitle(g.title) + '|' + (g.platform || ''), g]));

    const games = [];
    const seen = new Set();

    for (const pg of playedRes.titles || []) {
      const platform = mapPsnPlatform(null, pg.category);
      if (!platform) continue; // skip non-PS platforms

      // Try to find trophy data by title match
      const trophy = trophyMap.get(normTitle(pg.name));

      const npCommunicationId = trophy?.npCommunicationId || null;
      const trophyPct = trophy?.progress ?? null;
      const earnedTrophies = trophy?.earnedTrophies || null;
      const definedTrophies = trophy?.definedTrophies || null;

      // Get cover image
      const imageUrl = pg.concept?.media?.images?.find(i => i.type === 'MASTER') ?.url
        || pg.concept?.media?.images?.[0]?.url
        || pg.imageUrl
        || null;

      // Deduplicate by npCommunicationId or (title+platform)
      const dedupeKey = npCommunicationId || (normTitle(pg.name) + '|' + platform);
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);

      // Check if already in library
      let alreadyInLibrary = false;
      if (npCommunicationId && existingByPsnId.has(npCommunicationId)) {
        alreadyInLibrary = true;
      } else {
        const key = normTitle(pg.name) + '|' + platform;
        if (existingByTitle.has(key)) alreadyInLibrary = true;
      }

      games.push({
        titleId: pg.titleId,
        npCommunicationId,
        name: pg.name,
        platform,
        imageUrl,
        trophyPct,
        earnedTrophies,
        definedTrophies,
        playCount: pg.playCount,
        firstPlayedDateTime: pg.firstPlayedDateTime,
        lastPlayedDateTime: pg.lastPlayedDateTime,
        service: pg.service, // 'none_purchased' | 'ps_plus' | 'none'
        alreadyInLibrary,
      });
    }

    // Sort: not-in-library first, then by lastPlayedDateTime desc
    games.sort((a, b) => {
      if (a.alreadyInLibrary !== b.alreadyInLibrary) return a.alreadyInLibrary ? 1 : -1;
      return new Date(b.lastPlayedDateTime) - new Date(a.lastPlayedDateTime);
    });

    res.json({ games, totalPlayed: playedRes.totalItemCount });
  } catch (err) {
    logger.error('psn', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── POST /api/psn/import ─────────────────────────────────────────────────────
// Bulk import selected PSN games into the library
router.post('/import', (req, res) => {
  const { games } = req.body;
  if (!Array.isArray(games) || !games.length) return res.status(400).json({ error: 'games array required' });

  const insert = db.prepare(`
    INSERT INTO games (
      title, platform, condition, edition, region, quantity,
      finished, ownership_type, psn_title_id, trophy_pct,
      cover_url, date_acquired
    ) VALUES (?, ?, 'Digital', 'Standard', ?, 1, ?, 'digital', ?, ?, ?, ?)
  `);

  const insertMany = db.transaction((items) => {
    let imported = 0;
    for (const g of items) {
      if (!g.name || !g.platform) continue;
      // Skip if already in library (double-check server-side)
      if (g.npCommunicationId) {
        const exists = db.prepare('SELECT id FROM games WHERE psn_title_id = ?').get(g.npCommunicationId);
        if (exists) continue;
      }
      const region = g.platform.includes('Japan') ? 'NTSC-J (Japan)' : 'NTSC (USA)';
      const finished = g.trophyPct === 100 ? 1 : 0;
      const dateAcquired = g.firstPlayedDateTime ? g.firstPlayedDateTime.slice(0, 10) : null;
      insert.run(g.name, g.platform, region, finished, g.npCommunicationId || null, g.trophyPct ?? null, g.imageUrl || null, dateAcquired);
      imported++;
    }
    return imported;
  });

  const imported = insertMany(games);
  logger.success('psn', `Imported ${imported} games from PSN`);
  res.json({ imported });
});

// ── POST /api/psn/sync-trophies ──────────────────────────────────────────────
// Fetch trophy progress for all titles and update matching games in DB
router.post('/sync-trophies', async (req, res) => {
  try {
    const { getUserTitles } = await getPsnApi();
    const accessToken = await getAccessToken();
    const trophyRes = await getUserTitles({ accessToken }, 'me', { limit: 800 });

    const trophyTitles = trophyRes.trophyTitles || [];

    // Build lookup: npCommunicationId → progress
    const byPsnId = new Map(trophyTitles.map(t => [t.npCommunicationId, t.progress]));
    // Build lookup: normTitle+platform → progress
    const byTitle = new Map();
    for (const t of trophyTitles) {
      const platform = mapPsnPlatform(t.trophyTitlePlatform);
      if (platform) byTitle.set(normTitle(t.trophyTitleName) + '|' + platform, { progress: t.progress, id: t.npCommunicationId });
    }

    // Get all PS4/PS5/PS3/Vita/PSP games from DB
    const psGames = db.prepare(
      "SELECT id, title, platform, psn_title_id, trophy_pct, finished FROM games WHERE platform IN ('PlayStation 4','PlayStation 5','PlayStation 3','PS Vita','PSP')"
    ).all();

    const updateTrophy = db.prepare("UPDATE games SET trophy_pct = ?, psn_title_id = ?, finished = ?, updated_at = datetime('now') WHERE id = ?");

    let synced = 0, autoFinished = 0;
    const syncTx = db.transaction(() => {
      for (const g of psGames) {
        let progress = null;
        let psnId = g.psn_title_id;

        // 1. Match by stored PSN ID
        if (psnId && byPsnId.has(psnId)) {
          progress = byPsnId.get(psnId);
        } else {
          // 2. Fuzzy match by title + platform
          const key = normTitle(g.title) + '|' + g.platform;
          const match = byTitle.get(key);
          if (match != null) {
            progress = match.progress;
            psnId = match.id;
          }
        }

        if (progress == null) continue;
        if (progress === g.trophy_pct && psnId === g.psn_title_id) continue; // no change

        const newFinished = progress === 100 ? 1 : g.finished;
        if (progress === 100 && !g.finished) autoFinished++;
        updateTrophy.run(progress, psnId || g.psn_title_id, newFinished, g.id);
        synced++;
      }
    });
    syncTx();

    logger.success('psn', `Trophy sync: ${synced} updated, ${autoFinished} auto-finished`);
    res.json({ synced, autoFinished });
  } catch (err) {
    logger.error('psn', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
