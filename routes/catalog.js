const express = require('express');
const router = express.Router();
const path = require('path');

// ── Load databases once at startup ───────────────────────────────────────────
const DATA = path.join(__dirname, '../data');

function loadDB(file) {
  try { return require(path.join(DATA, file)); }
  catch { return {}; }
}

const PSX = loadDB('PSX.titles.json');
const PS2 = loadDB('PS2.titles.json');
const PS3 = loadDB('PS3.titles.json');

// ── Region from serial prefix ─────────────────────────────────────────────────
// PS1/PS2 prefixes
const PS12_REGION = {
  SLUS: 'NTSC', SCUS: 'NTSC', NPUA: 'NTSC',
  SLES: 'PAL',  SCES: 'PAL',  NPEB: 'PAL',
  SLPS: 'NTSC-J', SCPS: 'NTSC-J', SLPM: 'NTSC-J',
  PAPX: 'NTSC-J', CPCS: 'NTSC-J',
};
// PS3 prefixes
const PS3_REGION = {
  BLUS: 'NTSC', NPUA: 'NTSC', BCUS: 'NTSC',
  BLES: 'PAL',  NPEB: 'PAL',  BCES: 'PAL',
  BLJM: 'NTSC-J', BCJS: 'NTSC-J', NPJB: 'NTSC-J', BCAS: 'NTSC-J', BLAS: 'NTSC-J',
};

// Map region code → our platform name
function platformName(basePlatform, region) {
  if (basePlatform === 'PlayStation 3') return 'PlayStation 3'; // no regional variants in our list
  if (region === 'PAL')    return `PAL ${basePlatform}`;
  if (region === 'NTSC-J') return `Japan ${basePlatform}`;
  return basePlatform; // NTSC (USA)
}

// ── Lookup ────────────────────────────────────────────────────────────────────
router.get('/:serial', (req, res) => {
  // Normalise: uppercase, collapse whitespace, ensure hyphen present
  const raw = req.params.serial.trim().toUpperCase().replace(/\s+/g, '');
  // Accept with or without hyphen: SCES50967 → SCES-50967
  const serial = raw.includes('-') ? raw : raw.slice(0, 4) + '-' + raw.slice(4);
  const prefix = serial.slice(0, 4);

  // Try PS2 first (shares some prefixes with PS1, but PS2 came later so more likely)
  if (PS2[serial]) {
    const region = PS12_REGION[prefix] || 'NTSC';
    return res.json({
      title:    PS2[serial],
      platform: platformName('PlayStation 2', region),
      region,
      serial,
    });
  }

  // Try PS1
  if (PSX[serial]) {
    const region = PS12_REGION[prefix] || 'NTSC';
    return res.json({
      title:    PSX[serial],
      platform: platformName('PlayStation', region),
      region,
      serial,
    });
  }

  // Try PS3
  if (PS3[serial]) {
    const region = PS3_REGION[prefix] || 'NTSC';
    return res.json({
      title:    PS3[serial],
      platform: platformName('PlayStation 3', region),
      region,
      serial,
    });
  }

  res.status(404).json({ error: 'Serial not found' });
});

module.exports = router;
