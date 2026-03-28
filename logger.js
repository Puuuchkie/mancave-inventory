// Simple in-memory ring buffer logger — last 500 entries
const MAX = 500;
const entries = [];

function log(level, source, message, data) {
  const entry = {
    ts: new Date().toISOString(),
    level,   // 'info' | 'success' | 'error' | 'warn'
    source,  // 'igdb' | 'pricecharting' | 'system'
    message,
    data: data !== undefined ? String(data).slice(0, 400) : undefined,
  };
  entries.push(entry);
  if (entries.length > MAX) entries.shift();
  // Also write to stdout
  const prefix = `[${entry.ts.slice(11, 19)}] [${source}]`;
  if (level === 'error') console.error(prefix, message, data || '');
  else console.log(prefix, message, data || '');
}

module.exports = {
  info:    (source, msg, data) => log('info',    source, msg, data),
  success: (source, msg, data) => log('success', source, msg, data),
  warn:    (source, msg, data) => log('warn',    source, msg, data),
  error:   (source, msg, data) => log('error',   source, msg, data),
  getAll:  () => [...entries].reverse(), // newest first
  clear:   () => entries.splice(0),
};
