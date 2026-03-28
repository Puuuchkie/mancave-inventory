const express = require('express');
const router = express.Router();
const db = require('../database');

const ALL_PLATFORMS = [
  // Nintendo home
  'NES', 'PAL NES', 'Famicom',
  'SNES', 'PAL SNES', 'Super Famicom',
  'Nintendo 64', 'PAL Nintendo 64', 'Japan Nintendo 64',
  'GameCube', 'PAL GameCube', 'Wii', 'PAL Wii', 'Wii U', 'Nintendo Switch',
  // Nintendo handheld
  'Game Boy', 'Game Boy Color', 'Game Boy Advance', 'Nintendo DS', 'Nintendo 3DS',
  // Sony home
  'PlayStation', 'PAL PlayStation', 'Japan PlayStation',
  'PlayStation 2', 'PAL PlayStation 2', 'Japan PlayStation 2',
  'PlayStation 3', 'PlayStation 4', 'PlayStation 5',
  // Sony handheld
  'PSP', 'PS Vita',
  // Microsoft
  'Xbox', 'Xbox 360', 'Xbox One', 'Xbox Series X/S',
  // Sega
  'Sega Master System',
  'Sega Genesis', 'Sega Mega Drive', 'Japan Mega Drive',
  'Sega Saturn', 'PAL Sega Saturn', 'Japan Sega Saturn',
  'Sega Dreamcast', 'Game Gear',
  // Other
  'Atari 2600', 'Neo Geo', 'PC',
];

router.get('/settings', (req, res) => {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'enabled_platforms'").get();
  const enabled = row ? JSON.parse(row.value) : ALL_PLATFORMS;
  res.json({ enabled, all: ALL_PLATFORMS });
});

router.post('/settings', (req, res) => {
  const { enabled } = req.body;
  if (!Array.isArray(enabled) || !enabled.length) {
    return res.status(400).json({ error: 'At least one platform must be enabled' });
  }
  db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('enabled_platforms', ?)").run(JSON.stringify(enabled));
  res.json({ success: true });
});

module.exports = router;
