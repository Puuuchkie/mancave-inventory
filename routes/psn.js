const express = require('express');
const router = express.Router();
const db = require('../database');
const logger = require('../logger');

// psn-api uses ESM, so we import it dynamically
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
  let tokens = getStoredTokens();
  if (!tokens) throw new Error('PSN not connected — save your NPSSO token first');

  // If token is still valid (with 5 min buffer), return it
  if (tokens.accessToken && tokens.expiresAt && Date.now() < tokens.expiresAt - 300000) {
    return tokens.accessToken;
  }

  // Try to refresh
  if (tokens.refreshToken) {
    try {
      const refreshed = await exchangeRefreshTokenForAuthTokens(tokens.refreshToken);
      tokens = {
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken || tokens.refreshToken,
        expiresAt: Date.now() + (refreshed.expiresIn || 3600) * 1000,
      };
      saveTokens(tokens);
      return tokens.accessToken;
    } catch (err) {
      logger.warn('psn', 'Refresh failed: ' + err.message);
    }
  }

  throw new Error('PSN session expired — reconnect with a new NPSSO token');
}

// POST /api/psn/connect — exchange NPSSO for access token and store it
router.post('/connect', async (req, res) => {
  const { npsso } = req.body;
  if (!npsso || npsso.length < 20) return res.status(400).json({ error: 'Valid NPSSO token required' });

  try {
    const { exchangeNpssoForCode, exchangeCodeForAccessToken } = await getPsnApi();
    const code = await exchangeNpssoForCode(npsso);
    const auth = await exchangeCodeForAccessToken(code);

    const tokens = {
      accessToken: auth.accessToken,
      refreshToken: auth.refreshToken,
      expiresAt: Date.now() + (auth.expiresIn || 3600) * 1000,
    };
    saveTokens(tokens);
    // Also save the npsso for display purposes (masked)
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('psn_npsso_hint', ?)").run(npsso.slice(0, 6) + '…');

    logger.success('psn', 'Connected successfully');
    res.json({ success: true });
  } catch (err) {
    logger.error('psn', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/psn/status
router.get('/status', (req, res) => {
  const tokens = getStoredTokens();
  const hint = db.prepare("SELECT value FROM settings WHERE key = 'psn_npsso_hint'").get();
  if (!tokens) return res.json({ connected: false });
  const expired = !tokens.expiresAt || Date.now() > tokens.expiresAt;
  res.json({ connected: true, expired, hint: hint?.value || null });
});

// GET /api/psn/profile — fetch current user's profile
router.get('/profile', async (req, res) => {
  try {
    const { getProfileFromUserName, getUserTitles } = await getPsnApi();
    const accessToken = await getAccessToken();
    const profile = await getProfileFromUserName({ accessToken }, 'me');
    res.json(profile);
  } catch (err) {
    logger.error('psn', err.message);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/psn/trophies?accountId=:accountId — fetch recently played titles with trophy data
router.get('/trophies', async (req, res) => {
  try {
    const { getUserTitles } = await getPsnApi();
    const accessToken = await getAccessToken();
    const titles = await getUserTitles({ accessToken }, 'me');
    res.json(titles);
  } catch (err) {
    logger.error('psn', err.message);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/psn/disconnect
router.delete('/disconnect', (req, res) => {
  db.prepare("DELETE FROM settings WHERE key IN ('psn_tokens', 'psn_npsso_hint')").run();
  res.json({ success: true });
});

module.exports = router;
