const path = require('node:path');
const fs = require('node:fs');
let pool, sqlite;
if (process.env.DATABASE_URL) {
  const { Pool } = require('pg');
  pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
} else {
  if (process.env.NODE_ENV === 'production') throw new Error('DATABASE_URL is required in production');
  const { DatabaseSync } = require('node:sqlite');
  const filename = process.env.DB_FILE || path.join(__dirname, 'data', 'meals.sqlite');
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  sqlite = new DatabaseSync(filename);
  sqlite.exec('PRAGMA foreign_keys = ON');
}
async function query(sql, params = []) {
  if (pool) return pool.query(sql, params);
  const statement = sqlite.prepare(sql.replace(/\$\d+/g, '?'));
  if (/^\s*SELECT/i.test(sql) || /RETURNING/i.test(sql)) return { rows: statement.all(...params) };
  return { rows: [], rowCount: statement.run(...params).changes };
}
async function init() {
  const id = pool ? 'SERIAL PRIMARY KEY' : 'INTEGER PRIMARY KEY';
  await query(`CREATE TABLE IF NOT EXISTS users (id ${id}, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL)`);
  await query(`CREATE TABLE IF NOT EXISTS meals (id ${id}, user_id INTEGER NOT NULL REFERENCES users(id), name TEXT NOT NULL, location TEXT NOT NULL, rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5), comment TEXT NOT NULL, favorite INTEGER NOT NULL DEFAULT 0)`);
  await query('CREATE INDEX IF NOT EXISTS meals_user_id ON meals(user_id)');
}
module.exports = { query, init, pool, close: async () => pool ? pool.end() : sqlite.close() };
