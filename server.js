require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./logger');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.use('/api/games', require('./routes/games'));
app.use('/api/hardware', require('./routes/hardware'));
app.use('/api/pricecharting', require('./routes/pricecharting'));
app.use('/api/autocomplete', require('./routes/autocomplete'));
app.use('/api/currency', require('./routes/currency'));
app.use('/api/platforms', require('./routes/platforms'));
app.use('/api/catalog', require('./routes/catalog'));
app.get('/api/logs', (req, res) => res.json(logger.getAll()));
app.delete('/api/logs', (req, res) => { logger.clear(); res.json({ success: true }); });

logger.info('system', 'Server started');

// Serve the SPA for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Man Cave Inventory running at http://localhost:${PORT}`);
});
