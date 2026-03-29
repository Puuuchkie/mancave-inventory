const express = require('express');
const router = express.Router();
const db = require('../database');
const { sumInBase } = require('./currencyHelper');

// GET all listings with their items
router.get('/', (req, res) => {
  const listings = db.prepare('SELECT * FROM sale_listings ORDER BY created_at DESC').all();
  const items    = db.prepare('SELECT * FROM sale_items').all();
  const itemsByListing = {};
  for (const i of items) {
    if (!itemsByListing[i.listing_id]) itemsByListing[i.listing_id] = [];
    itemsByListing[i.listing_id].push(i);
  }
  res.json(listings.map(l => ({ ...l, items: itemsByListing[l.id] || [] })));
});

// GET stats for dashboard
router.get('/stats', (req, res) => {
  const listed = db.prepare("SELECT COUNT(*) as c FROM sale_listings WHERE status = 'listed'").get().c;
  const sold   = db.prepare("SELECT * FROM sale_listings WHERE status = 'sold'").all();
  const allItems = db.prepare('SELECT * FROM sale_items').all();

  const revenue = sumInBase(sold, 'sold_price', 'sold_price_currency');

  // Profit = sold price - price_paid for items in sold listings
  const soldIds = new Set(sold.map(l => l.id));
  const soldItems = allItems.filter(i => soldIds.has(i.listing_id) && i.price_paid != null);
  const costOfSold = sumInBase(soldItems, 'price_paid', 'price_paid_currency');
  const profit = revenue - costOfSold;

  res.json({ listed_count: listed, sold_count: sold.length, revenue, profit });
});

// POST create listing (transfer items to for sale)
router.post('/', (req, res) => {
  const { title, asking_price, asking_price_currency, notes, items } = req.body;
  if (!title) return res.status(400).json({ error: 'Title is required' });
  if (!Array.isArray(items) || !items.length) return res.status(400).json({ error: 'At least one item required' });

  const create = db.transaction(() => {
    const result = db.prepare(`
      INSERT INTO sale_listings (title, asking_price, asking_price_currency, notes)
      VALUES (?, ?, ?, ?)
    `).run(title, asking_price || null, asking_price_currency || 'USD', notes || null);
    const listingId = result.lastInsertRowid;

    for (const item of items) {
      const table = item.item_type === 'hardware' ? 'hardware' : 'games';
      const row = db.prepare(`SELECT * FROM ${table} WHERE id = ?`).get(item.item_id);
      if (!row) continue;

      db.prepare(`
        INSERT INTO sale_items (listing_id, item_type, item_id, title, platform, item_condition, price_paid, price_paid_currency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(listingId, item.item_type, item.item_id,
        item.item_type === 'hardware' ? row.name : row.title,
        row.platform, row.condition, row.price_paid, row.price_paid_currency || 'USD');

      db.prepare(`UPDATE ${table} SET for_sale = 1, updated_at = datetime('now') WHERE id = ?`).run(item.item_id);
    }

    return listingId;
  });

  try {
    const id = create();
    const listing = db.prepare('SELECT * FROM sale_listings WHERE id = ?').get(id);
    const saleItems = db.prepare('SELECT * FROM sale_items WHERE listing_id = ?').all(id);
    res.status(201).json({ ...listing, items: saleItems });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// PUT update listing (title, asking price, notes)
router.put('/:id', (req, res) => {
  const listing = db.prepare('SELECT * FROM sale_listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });

  const { title, asking_price, asking_price_currency, notes } = req.body;
  db.prepare(`
    UPDATE sale_listings SET title = ?, asking_price = ?, asking_price_currency = ?, notes = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(
    title ?? listing.title,
    asking_price != null ? asking_price : listing.asking_price,
    asking_price_currency || listing.asking_price_currency || 'USD',
    notes != null ? notes : listing.notes,
    req.params.id
  );
  const items = db.prepare('SELECT * FROM sale_items WHERE listing_id = ?').all(req.params.id);
  res.json({ ...db.prepare('SELECT * FROM sale_listings WHERE id = ?').get(req.params.id), items });
});

// POST /:id/sell — mark listing as sold
router.post('/:id/sell', (req, res) => {
  const listing = db.prepare('SELECT * FROM sale_listings WHERE id = ?').get(req.params.id);
  if (!listing) return res.status(404).json({ error: 'Listing not found' });

  const { sold_price, sold_price_currency, sold_at } = req.body;
  db.prepare(`
    UPDATE sale_listings SET status = 'sold', sold_price = ?, sold_price_currency = ?, sold_at = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(sold_price || null, sold_price_currency || 'USD', sold_at || new Date().toISOString().slice(0, 10), req.params.id);

  const items = db.prepare('SELECT * FROM sale_items WHERE listing_id = ?').all(req.params.id);
  res.json({ ...db.prepare('SELECT * FROM sale_listings WHERE id = ?').get(req.params.id), items });
});

// DELETE listing — returns items to inventory
router.delete('/:id', (req, res) => {
  const items = db.prepare('SELECT * FROM sale_items WHERE listing_id = ?').all(req.params.id);
  const del = db.transaction(() => {
    for (const item of items) {
      const table = item.item_type === 'hardware' ? 'hardware' : 'games';
      db.prepare(`UPDATE ${table} SET for_sale = 0, updated_at = datetime('now') WHERE id = ?`).run(item.item_id);
    }
    db.prepare('DELETE FROM sale_listings WHERE id = ?').run(req.params.id);
  });
  try {
    del();
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
