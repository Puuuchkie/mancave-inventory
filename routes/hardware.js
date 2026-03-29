const express = require('express');
const router = express.Router();
const db = require('../database');
const { sumInBase } = require('./currencyHelper');

// Type-category helpers
const SYSTEM_TYPES     = ['Console', 'Handheld Console'];
const CONTROLLER_TYPES = ['Controller / Gamepad', 'Arcade Stick', 'Light Gun'];
const PERIPHERAL_TYPES = ['Memory Card', 'Peripheral', 'Cable / Adapter', 'Storage', 'Accessory', 'Other'];
const CATEGORY_TYPES   = { systems: SYSTEM_TYPES, controllers: CONTROLLER_TYPES, peripherals: PERIPHERAL_TYPES };

// GET all hardware with optional filters
router.get('/', (req, res) => {
  const { search, platform, type, condition, working_condition, category, for_sale } = req.query;
  let query = 'SELECT * FROM hardware WHERE (for_sale = 0 OR for_sale IS NULL)';
  const params = [];

  if (search) {
    query += ' AND (name LIKE ? OR manufacturer LIKE ? OR model_number LIKE ? OR serial_number LIKE ?)';
    const s = `%${search}%`;
    params.push(s, s, s, s);
  }
  if (platform) { query += ' AND platform = ?'; params.push(platform); }
  if (type) { query += ' AND type = ?'; params.push(type); }
  if (condition) { query += ' AND condition = ?'; params.push(condition); }
  if (working_condition) { query += ' AND working_condition = ?'; params.push(working_condition); }
  if (category && CATEGORY_TYPES[category]) {
    const placeholders = CATEGORY_TYPES[category].map(() => '?').join(',');
    query += ` AND type IN (${placeholders})`;
    params.push(...CATEGORY_TYPES[category]);
  }
  if (for_sale === 'true') {
    // Override: show for_sale items instead
    query = query.replace('(for_sale = 0 OR for_sale IS NULL)', 'for_sale = 1');
  }

  query += ' ORDER BY platform ASC, type ASC, name ASC';
  const items = db.prepare(query).all(...params);
  res.json(items);
});

// GET stats — single query, aggregate in JS to minimise DB round-trips
router.get('/stats', (req, res) => {
  const rows = db.prepare('SELECT quantity, price_paid, price_paid_currency, price_value, price_value_currency, platform, type FROM hardware WHERE (for_sale = 0 OR for_sale IS NULL)').all();

  let total_qty = 0;
  const paidRows = [], valueRows = [], typeMap = {}, platformMap = {};

  for (const r of rows) {
    const qty = r.quantity || 1;
    total_qty += qty;
    if (r.price_paid  != null) paidRows.push(r);
    if (r.price_value != null) valueRows.push(r);
    if (r.type)     typeMap[r.type]         = (typeMap[r.type]         || 0) + 1;
    if (r.platform) platformMap[r.platform] = (platformMap[r.platform] || 0) + 1;
  }

  const types     = Object.entries(typeMap)    .map(([type, count])     => ({ type, count }))    .sort((a, b) => b.count - a.count);
  const platforms = Object.entries(platformMap).map(([platform, count]) => ({ platform, count })).sort((a, b) => b.count - a.count);

  // Per-category counts for sidebar badges
  const catCount = (cats) => rows.filter(r => cats.includes(r.type)).length;

  res.json({
    total_items: rows.length,
    total_qty,
    total_paid:  sumInBase(paidRows,  'price_paid',  'price_paid_currency'),
    total_value: sumInBase(valueRows, 'price_value', 'price_value_currency'),
    types,
    platforms,
    systems_count:     catCount(SYSTEM_TYPES),
    controllers_count: catCount(CONTROLLER_TYPES),
    peripherals_count: catCount(PERIPHERAL_TYPES),
  });
});

// GET filter options — single pass, aggregate in JS; supports ?category filter
router.get('/options', (req, res) => {
  const { category } = req.query;
  let query = 'SELECT platform, type, condition FROM hardware WHERE (for_sale = 0 OR for_sale IS NULL)';
  const params = [];
  if (category && CATEGORY_TYPES[category]) {
    const placeholders = CATEGORY_TYPES[category].map(() => '?').join(',');
    query += ` AND type IN (${placeholders})`;
    params.push(...CATEGORY_TYPES[category]);
  }
  const rows = db.prepare(query).all(...params);
  const pSet = new Set(), tSet = new Set(), cSet = new Set();
  for (const r of rows) {
    if (r.platform)  pSet.add(r.platform);
    if (r.type)      tSet.add(r.type);
    if (r.condition) cSet.add(r.condition);
  }
  res.json({
    platforms:  [...pSet].sort(),
    types:      [...tSet].sort(),
    conditions: [...cSet].sort(),
  });
});

// GET single hardware item
router.get('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM hardware WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });
  res.json(item);
});

// POST create hardware
router.post('/', (req, res) => {
  const {
    name, type, platform, manufacturer, model_number, condition,
    color_variant, variant, edition, region, quantity, serial_number, has_original_box,
    has_all_accessories, working_condition, modifications, integrity, jailbroken,
    price_paid, price_paid_currency, price_value, price_value_currency,
    pricecharting_id, date_acquired, where_purchased, remarks
  } = req.body;

  if (!name || !type || !platform) return res.status(400).json({ error: 'Name, type, and platform are required' });

  const result = db.prepare(`
    INSERT INTO hardware (
      name, type, platform, manufacturer, model_number, condition,
      color_variant, variant, edition, region, quantity, serial_number, has_original_box,
      has_all_accessories, working_condition, modifications, integrity, jailbroken,
      price_paid, price_paid_currency, price_value, price_value_currency,
      pricecharting_id, date_acquired, where_purchased, remarks
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    name, type, platform, manufacturer, model_number, condition,
    color_variant, variant, edition, region, quantity || 1, serial_number,
    has_original_box ? 1 : 0, has_all_accessories ? 1 : 0,
    working_condition || null, modifications,
    integrity || null, jailbroken ? 1 : 0,
    price_paid, price_paid_currency || 'USD',
    price_value, price_value_currency || 'USD',
    pricecharting_id, date_acquired, where_purchased, remarks
  );

  res.status(201).json(db.prepare('SELECT * FROM hardware WHERE id = ?').get(result.lastInsertRowid));
});

// PUT update hardware
router.put('/:id', (req, res) => {
  const item = db.prepare('SELECT * FROM hardware WHERE id = ?').get(req.params.id);
  if (!item) return res.status(404).json({ error: 'Item not found' });

  const {
    name, type, platform, manufacturer, model_number, condition,
    color_variant, variant, edition, region, quantity, serial_number, has_original_box,
    has_all_accessories, working_condition, modifications, integrity, jailbroken,
    price_paid, price_paid_currency, price_value, price_value_currency,
    pricecharting_id, date_acquired, where_purchased, remarks
  } = req.body;

  db.prepare(`
    UPDATE hardware SET
      name = ?, type = ?, platform = ?, manufacturer = ?, model_number = ?,
      condition = ?, color_variant = ?, variant = ?, edition = ?, region = ?, quantity = ?,
      serial_number = ?, has_original_box = ?, has_all_accessories = ?,
      working_condition = ?, modifications = ?, integrity = ?, jailbroken = ?,
      price_paid = ?, price_paid_currency = ?,
      price_value = ?, price_value_currency = ?,
      pricecharting_id = ?, date_acquired = ?, where_purchased = ?,
      remarks = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    name ?? item.name, type ?? item.type, platform ?? item.platform,
    manufacturer, model_number, condition, color_variant, variant, edition, region,
    quantity ?? item.quantity, serial_number,
    has_original_box ? 1 : 0, has_all_accessories ? 1 : 0,
    working_condition || null, modifications,
    integrity || null, jailbroken ? 1 : 0,
    price_paid, price_paid_currency || item.price_paid_currency || 'USD',
    price_value, price_value_currency || item.price_value_currency || 'USD',
    pricecharting_id, date_acquired, where_purchased,
    remarks, req.params.id
  );

  res.json(db.prepare('SELECT * FROM hardware WHERE id = ?').get(req.params.id));
});

// DELETE hardware
router.delete('/:id', (req, res) => {
  const result = db.prepare('DELETE FROM hardware WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Item not found' });
  res.json({ success: true });
});

// DELETE batch
router.delete('/batch/delete', (req, res) => {
  const { ids } = req.body;
  if (!Array.isArray(ids) || !ids.length) return res.status(400).json({ error: 'ids array required' });
  const del = db.transaction(() => {
    for (const id of ids) db.prepare('DELETE FROM hardware WHERE id = ?').run(id);
  });
  del();
  res.json({ deleted: ids.length });
});

// PATCH batch edit
router.patch('/batch/edit', (req, res) => {
  const { ids, data } = req.body;
  if (!Array.isArray(ids) || !ids.length || !data) return res.status(400).json({ error: 'ids and data required' });

  const allowed = ['platform', 'condition', 'type', 'region', 'working_condition', 'where_purchased', 'date_acquired', 'price_paid_currency', 'price_value_currency'];
  const fields = Object.keys(data).filter(k => allowed.includes(k) && data[k] !== null && data[k] !== '');
  if (!fields.length) return res.status(400).json({ error: 'No valid fields to update' });

  const set = fields.map(f => `${f} = ?`).join(', ') + ', updated_at = datetime(\'now\')';
  const vals = fields.map(f => data[f]);

  const update = db.transaction(() => {
    for (const id of ids) db.prepare(`UPDATE hardware SET ${set} WHERE id = ?`).run(...vals, id);
  });
  update();
  res.json({ updated: ids.length });
});

module.exports = router;
