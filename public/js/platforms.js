// Platforms module — manages enabled platform list and populates datalists
const Platforms = (() => {
  let _all = [];
  let _enabled = [];

  // Ordered groups for the settings chip grid
  const GROUPS = [
    { label: 'Nintendo Home', platforms: ['NES', 'PAL NES', 'Famicom', 'SNES', 'PAL SNES', 'Super Famicom', 'Nintendo 64', 'PAL Nintendo 64', 'Japan Nintendo 64', 'GameCube', 'PAL GameCube', 'Wii', 'PAL Wii', 'Wii U', 'Nintendo Switch'] },
    { label: 'Nintendo Handheld', platforms: ['Game Boy', 'Game Boy Color', 'Game Boy Advance', 'Nintendo DS', 'Nintendo 3DS'] },
    { label: 'Sony Home', platforms: ['PlayStation', 'PAL PlayStation', 'Japan PlayStation', 'PlayStation 2', 'PAL PlayStation 2', 'Japan PlayStation 2', 'PlayStation 3', 'PlayStation 4', 'PlayStation 5'] },
    { label: 'Sony Handheld', platforms: ['PSP', 'PS Vita'] },
    { label: 'Microsoft', platforms: ['Xbox', 'Xbox 360', 'Xbox One', 'Xbox Series X/S'] },
    { label: 'Sega', platforms: ['Sega Master System', 'Sega Genesis', 'Sega Mega Drive', 'Japan Mega Drive', 'Sega Saturn', 'PAL Sega Saturn', 'Japan Sega Saturn', 'Sega Dreamcast', 'Game Gear'] },
    { label: 'Other', platforms: ['Atari 2600', 'Neo Geo', 'PC'] },
  ];

  async function load() {
    try {
      const data = await API.getPlatformSettings();
      _all = data.all || [];
      _enabled = data.enabled || [];
      populateDatalists();
    } catch {}
  }

  function all() { return _all; }
  function enabled() { return _enabled; }

  function populateDatalists() {
    const list = _enabled.length ? _enabled : _all;
    ['platformList', 'hwPlatformList'].forEach(id => {
      const dl = document.getElementById(id);
      if (!dl) return;
      dl.innerHTML = list.map(p => `<option>${p}</option>`).join('');
    });
  }

  return { load, all, enabled, GROUPS, populateDatalists };
})();
