const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../database');

const SECRET = process.env.JWT_SECRET || 'mancave-inventory-secret';
const EXPIRES = '30d';

// POST /api/auth/login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: EXPIRES });
  res.json({ token, username: user.username });
});

// POST /api/auth/register
router.post('/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password are required' });
  if (username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });
  if (password.length < 4) return res.status(400).json({ error: 'Password must be at least 4 characters' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: 'Username already taken' });

  const hash = bcrypt.hashSync(password, 10);
  db.prepare('INSERT INTO users (username, password_hash) VALUES (?, ?)').run(username, hash);
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  const token = jwt.sign({ id: user.id, username: user.username }, SECRET, { expiresIn: EXPIRES });
  res.status(201).json({ token, username: user.username });
});

// POST /api/auth/change-username  (requires auth)
router.post('/change-username', requireAuth, (req, res) => {
  const { new_username, password } = req.body;
  if (!new_username || !password) return res.status(400).json({ error: 'new_username and password are required' });
  if (new_username.length < 3) return res.status(400).json({ error: 'Username must be at least 3 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Password is incorrect' });
  }

  const exists = db.prepare('SELECT id FROM users WHERE username = ? AND id != ?').get(new_username, req.user.id);
  if (exists) return res.status(409).json({ error: 'Username already taken' });

  db.prepare("UPDATE users SET username = ?, updated_at = datetime('now') WHERE id = ?").run(new_username, req.user.id);

  // Issue a new token with updated username
  const token = jwt.sign({ id: req.user.id, username: new_username }, SECRET, { expiresIn: EXPIRES });
  res.json({ success: true, token, username: new_username });
});

// POST /api/auth/change-password  (requires auth)
router.post('/change-password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) return res.status(400).json({ error: 'current_password and new_password are required' });
  if (new_password.length < 4) return res.status(400).json({ error: 'New password must be at least 4 characters' });

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current_password, user.password_hash)) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const hash = bcrypt.hashSync(new_password, 10);
  db.prepare("UPDATE users SET password_hash = ?, updated_at = datetime('now') WHERE id = ?").run(hash, user.id);
  res.json({ success: true });
});

// GET /api/auth/users — list users (requires auth)
router.get('/users', requireAuth, (req, res) => {
  const users = db.prepare('SELECT id, username, created_at FROM users ORDER BY id').all();
  res.json(users);
});

// DELETE /api/auth/users/:id — delete user (requires auth, can't delete yourself)
router.delete('/users/:id', requireAuth, (req, res) => {
  const id = parseInt(req.params.id);
  if (id === req.user.id) return res.status(400).json({ error: 'Cannot delete your own account' });
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true });
});

// GET /api/auth/me — verify token and return current user
router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, username: req.user.username });
});

function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = jwt.verify(header.slice(7), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = router;
module.exports.requireAuth = requireAuth;
