const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(process.env.DB_PATH || path.join(__dirname, 'inventory.db'));

// Performance pragmas — critical on network filesystems
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');    // safe with WAL; avoids fsync on every write
db.pragma('cache_size = -32000');     // 32 MB page cache — keep hot pages in memory
db.pragma('temp_store = MEMORY');     // temp tables stay in RAM
db.pragma('mmap_size = 268435456');   // 256 MB memory-mapped I/O; reads come from RAM after first access
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS games (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      platform TEXT NOT NULL,
      condition TEXT,
      edition TEXT,
      region TEXT,
      quantity INTEGER DEFAULT 1,
      genre TEXT,
      developer TEXT,
      publisher TEXT,
      release_year INTEGER,
      catalog_number TEXT,
      has_box INTEGER DEFAULT 0,
      has_manual INTEGER DEFAULT 0,
      has_inserts INTEGER DEFAULT 0,
      finished INTEGER DEFAULT 0,
      personal_rating INTEGER,
      price_paid REAL,
      price_value REAL,
      pricecharting_id TEXT,
      date_acquired TEXT,
      where_purchased TEXT,
      remarks TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS hardware (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      platform TEXT NOT NULL,
      manufacturer TEXT,
      model_number TEXT,
      condition TEXT,
      color_variant TEXT,
      region TEXT,
      quantity INTEGER DEFAULT 1,
      serial_number TEXT,
      has_original_box INTEGER DEFAULT 0,
      has_all_accessories INTEGER DEFAULT 0,
      working_condition TEXT DEFAULT 'Fully Working',
      modifications TEXT,
      price_paid REAL,
      price_value REAL,
      pricecharting_id TEXT,
      date_acquired TEXT,
      where_purchased TEXT,
      remarks TEXT,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);
}

function migrate() {
  // Safe column additions for existing databases
  const add = (table, col, def) => {
    try { db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`); } catch {}
  };
  add('games',    'price_paid_currency',  "TEXT DEFAULT 'USD'");
  add('games',    'price_value_currency', "TEXT DEFAULT 'USD'");
  add('games',    'cover_url',            'TEXT');
  add('hardware', 'price_paid_currency',  "TEXT DEFAULT 'USD'");
  add('hardware', 'price_value_currency', "TEXT DEFAULT 'USD'");
  add('hardware', 'integrity',            'TEXT');
  add('hardware', 'jailbroken',           'INTEGER DEFAULT 0');

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_games_title    ON games(title);
    CREATE INDEX IF NOT EXISTS idx_games_platform ON games(platform);
    CREATE INDEX IF NOT EXISTS idx_games_finished ON games(finished);
    CREATE INDEX IF NOT EXISTS idx_hw_platform    ON hardware(platform);
    CREATE INDEX IF NOT EXISTS idx_hw_type        ON hardware(type);
  `);
}

init();
migrate();

module.exports = db;
