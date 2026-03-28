const express = require('express');
const router = express.Router();
const db = require('../database');
const { sumInBase } = require('./currencyHelper');

// GET all games with optional filters
router.get('/', (req, res) => {
  const { search, platform, condition, genre, finished } = req.query;
  let query = 'SELECT * FROM games WHERE 1=1';
  const params = [];

  if (search) {
    query += ' AND (title LIKE ? OR developer LIKE ? OR publisher LIKE ? OR catalog_number LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  if (platform) { query += ' AND platform = ?'; params.push(platform); }
  if (condition) { query += ' AND condition = ?'; params.push(condition); }
  if (genre) { query += ' AND genre = ?'; params.push(genre); }
  if (finished !== undefined && finished !== '') {
    query += ' AND finished = ?';
    params.push(finished === 'true' || finished === '1' ? 1 : 0);
  }

  query += ' ORDER BY title ASC';
  const games = db.prepare(query).all(...params);
  res.json(games);
});

// GET stats — single query, aggregate in JS to minimise DB round-trips
const _statsStmt = db.prepare('SELECT quantity, price_paid, price_paid_currency, price_value, price_value_currency, platform, genre, finished FROM games');
router.get('/stats', (req, res) => {
  const rows = _statsStmt.all();

  let total_items = 0, finished = 0;
  const paidRows = [], valueRows = [], platformMap = {}, genreMap = {};

  for (const r of rows) {
    const qty = r.quantity || 1;
    total_items += qty;
    if (r.finished) finished++;
    if (r.price_paid  != null) paidRows.push(r);
    if (r.price_value != null) valueRows.push(r);
    if (r.platform) platformMap[r.platform] = (platformMap[r.platform] || 0) + 1;
    if (r.genre)    genreMap[r.genre]       = (genreMap[r.genre]       || 0) + 1;
  }

  const platforms = Object.entries(platformMap)
    .map(([platform, count]) => ({ platform, count }))
    .sort((a, b) => b.count - a.count);

  const genres = Object.entries(genreMap)
    .map(([genre, count]) => ({ genre, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  res.json({
    total_titles: rows.length,
    total_items,
    total_paid:  sumInBase(paidRows,  'price_paid',  'price_paid_currency'),
    total_value: sumInBase(valueRows, 'price_value', 'price_value_currency'),
    finished,
    platforms,
    genres,
  });
});

// GET filter options — single pass over all games, aggregate in JS
const _optStmt = db.prepare('SELECT platform, genre, condition FROM games');
router.get('/options', (req, res) => {
  const rows = _optStmt.all();
  const pSet = new Set(), gSet = new Set(), cSet = new Set();
  for (const r of rows) {
    if (r.platform) pSet.add(r.platform);
    if (r.genre)    gSet.add(r.genre);
    if (r.condition) cSet.add(r.condition);
  }
  res.json({
    platforms:  [...pSet].sort(),
    genres:     [...gSet].sort(),
    conditions: [...cSet].sort(),
  });
});

// GET single game
router.get('/:id', (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });
  res.json(game);
});

// POST create game
router.post('/', (req, res) => {
  const {
    title, platform, condition, edition, region, quantity, genre,
    developer, publisher, release_year, catalog_number,
    finished, personal_rating, price_paid, price_paid_currency,
    price_value, price_value_currency, pricecharting_id,
    date_acquired, where_purchased, remarks, cover_url
  } = req.body;

  if (!title || !platform) return res.status(400).json({ error: 'Title and platform are required' });

  const result = db.prepare(`
    INSERT INTO games (
      title, platform, condition, edition, region, quantity, genre,
      developer, publisher, release_year, catalog_number,
      finished, personal_rating, price_paid, price_paid_currency,
      price_value, price_value_currency, pricecharting_id,
      date_acquired, where_purchased, remarks, cover_url
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    title, platform, condition, edition, region, quantity || 1, genre,
    developer, publisher, release_year, catalog_number,
    finished ? 1 : 0, personal_rating,
    price_paid, price_paid_currency || 'USD',
    price_value, price_value_currency || 'USD',
    pricecharting_id, date_acquired, where_purchased, remarks, cover_url || null
  );

  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json(game);
});

// PUT update game
router.put('/:id', (req, res) => {
  const game = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
  if (!game) return res.status(404).json({ error: 'Game not found' });

  const {
    title, platform, condition, edition, region, quantity, genre,
    developer, publisher, release_year, catalog_number,
    finished, personal_rating, price_paid, price_paid_currency,
    price_value, price_value_currency, pricecharting_id,
    date_acquired, where_purchased, remarks, cover_url
  } = req.body;

  db.prepare(`
    UPDATE games SET
      title = ?, platform = ?, condition = ?, edition = ?, region = ?,
      quantity = ?, genre = ?, developer = ?, publisher = ?, release_year = ?,
      catalog_number = ?, finished = ?, personal_rating = ?,
      price_paid = ?, price_paid_currency = ?,
      price_value = ?, price_value_currency = ?,
      pricecharting_id = ?, date_acquired = ?, where_purchased = ?,
      remarks = ?, cover_url = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title ?? game.title, platform ?? game.platform, condition, edition, region,
    quantity ?? game.quantity, genre, developer, publisher, release_year,
    catalog_number, finished ? 1 : 0, personal_rating,
    price_paid, price_paid_currency || game.price_paid_currency || 'USD',
    price_value, price_value_currency || game.price_value_currency || 'USD',
    pricecharting_id, date_acquired, where_purchased, remarks,
    cover_url !== undefined ? cover_url : game.cover_url,
    req.params.id
  );

  res.json(db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id));
});

// DELETE game
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Game not found' });
  res.json({ success: true });
});

module.exports = router;
