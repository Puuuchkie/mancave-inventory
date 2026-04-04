require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const logger = require('./logger');
const { requireAuth } = require('./routes/auth');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Auth routes are public (no token needed)
app.use('/api/auth', require('./routes/auth'));

// All other /api/* routes require a valid JWT
app.use('/api', requireAuth);

app.use('/api/games', require('./routes/games'));
app.use('/api/hardware', require('./routes/hardware'));
app.use('/api/pricecharting', require('./routes/pricecharting'));
app.use('/api/autocomplete', require('./routes/autocomplete'));
app.use('/api/currency', require('./routes/currency'));
app.use('/api/platforms', require('./routes/platforms'));
app.use('/api/catalog', require('./routes/catalog'));
app.use('/api/io', require('./routes/io'));
app.use('/api/forsale', require('./routes/forsale'));
app.use('/api/scan',   require('./routes/scan'));
app.use('/api/psn',    require('./routes/psn'));
app.get('/api/logs', (req, res) => res.json(logger.getAll()));
app.delete('/api/logs', (req, res) => { logger.clear(); res.json({ success: true }); });

logger.info('system', 'Server started');

// Serve login page for /login route
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

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
