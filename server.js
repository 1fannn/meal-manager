const express = require('express');
const session = require('express-session');
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const path = require('node:path');
const store = require('./store');
const scrypt = promisify(crypto.scrypt);
const app = express();
const production = process.env.NODE_ENV === 'production';
if (production && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET is required in production');
app.set('trust proxy', 1);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.disable('x-powered-by');
app.use(express.urlencoded({ extended: false, limit: '16kb' }));
app.use(express.static(path.join(__dirname, 'public')));
const sessionOptions = {
  name: 'meal.sid', secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
  resave: false, saveUninitialized: false, rolling: true,
  cookie: { httpOnly: true, secure: production, sameSite: 'lax', maxAge: 2592000000 }
};
if (store.pool) {
  const PgStore = require('connect-pg-simple')(session);
  sessionOptions.store = new PgStore({ pool: store.pool, createTableIfMissing: true });
}
app.use(session(sessionOptions));
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  res.locals.csrf = req.session.csrf;
  res.locals.currentUser = req.session.user || null;
  if (req.method === 'POST' && req.body._csrf !== req.session.csrf) return res.status(403).send('This form expired. Refresh the page and try again.');
  next();
});
const requireLogin = (req, res, next) => req.session.user ? next() : res.redirect('/login');
const authPage = (req, res, mode, error = '', username = '', status = 200) => res.status(status).render('auth', { mode, error, username });
const attempts = new Map();
function throttle(req, res, next) {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.until < now) attempts.delete(key);
  const value = attempts.get(req.ip) || { count: 0, until: now + 900000 };
  attempts.set(req.ip, value);
  if (++value.count > 20) return authPage(req, res, req.path === '/register' ? 'register' : 'login', 'Too many attempts. Please try again in 15 minutes.', '', 429);
  next();
}
async function passwordHash(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return salt + ':' + (await scrypt(password, salt, 64)).toString('hex');
}
async function passwordMatches(password, hash) {
  const [salt, hex] = hash.split(':');
  const key = await scrypt(password, salt, 64);
  const saved = Buffer.from(hex, 'hex');
  return saved.length === key.length && crypto.timingSafeEqual(saved, key);
}
async function signIn(req, user) {
  await new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
  req.session.user = { id: user.id, username: user.username };
  req.session.csrf = crypto.randomBytes(24).toString('hex');
  await new Promise((resolve, reject) => req.session.save(error => error ? reject(error) : resolve()));
}
app.get('/', (req, res) => res.render('index'));
app.get('/login', (req, res) => req.session.user ? res.redirect('/meals') : authPage(req, res, 'login'));
app.get('/register', (req, res) => req.session.user ? res.redirect('/meals') : authPage(req, res, 'register'));
app.post('/register', throttle, async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (!/^[a-z0-9_]{3,30}$/.test(username)) return authPage(req, res, 'register', 'Use 3–30 letters, numbers or underscores.', username, 400);
  if (password.length < 8 || password.length > 128) return authPage(req, res, 'register', 'Use a password between 8 and 128 characters.', username, 400);
  if (password !== req.body.confirmPassword) return authPage(req, res, 'register', 'Passwords do not match.', username, 400);
  try {
    const hash = await passwordHash(password);
    const result = await store.query('INSERT INTO users (username, password_hash) VALUES ($1, $2) RETURNING id, username', [username, hash]);
    await signIn(req, result.rows[0]);
    res.redirect('/meals');
  } catch (error) {
    if (error.code === '23505' || error.message.includes('UNIQUE constraint failed: users.username')) return authPage(req, res, 'register', 'This username is already taken.', username, 409);
    throw error;
  }
});
app.post('/login', throttle, async (req, res) => {
  const username = String(req.body.username || '').trim().toLowerCase();
  const password = String(req.body.password || '');
  if (password.length > 128) return authPage(req, res, 'login', 'Incorrect username or password.', username, 401);
  const { rows } = await store.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
  const user = rows[0];
  const dummy = '00000000000000000000000000000000:' + '00'.repeat(64);
  if (!await passwordMatches(password, user ? user.password_hash : dummy) || !user) return authPage(req, res, 'login', 'Incorrect username or password.', username, 401);
  await signIn(req, user);
  attempts.delete(req.ip);
  res.redirect('/meals');
});
app.post('/logout', (req, res, next) => req.session.destroy(error => {
  if (error) return next(error);
  res.clearCookie('meal.sid', { httpOnly: true, secure: production, sameSite: 'lax' });
  res.redirect('/login');
}));
app.use('/meals', requireLogin);
app.get('/meals', async (req, res) => {
  const { rows } = await store.query('SELECT * FROM meals WHERE user_id = $1 ORDER BY id DESC', [req.session.user.id]);
  res.render('meals', { meals: rows.map(meal => ({ ...meal, favorite: Boolean(meal.favorite) })) });
});
app.get('/meals/add', (req, res) => res.render('addMeal'));
function mealInput(body) {
  const name = String(body.name || '').trim();
  const location = String(body.location || '').trim();
  const rating = Number(body.rating);
  const comment = String(body.comment || '').trim();
  if (!name || name.length > 150 || !location || location.length > 2000 || !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 5000) return null;
  return [name, location, rating, comment];
}
app.post('/meals/add', async (req, res) => {
  const values = mealInput(req.body);
  if (!values) return res.status(400).send('Please enter a name, address and rating from 1 to 5. Go back to correct the form.');
  await store.query('INSERT INTO meals (name, location, rating, comment, user_id) VALUES ($1,$2,$3,$4,$5)', [...values, req.session.user.id]);
  res.redirect('/meals');
});
app.param('index', (req, res, next, value) => {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) return res.status(404).send('Meal not found.');
  next();
});
app.get('/meals/edit/:index', async (req, res) => {
  const { rows } = await store.query('SELECT * FROM meals WHERE id = $1 AND user_id = $2', [Number(req.params.index), req.session.user.id]);
  if (!rows[0]) return res.redirect('/meals');
  res.render('editMeal', { meal: rows[0], index: req.params.index });
});
app.post('/meals/edit/:index', async (req, res) => {
  const values = mealInput(req.body);
  if (!values) return res.status(400).send('Please enter valid meal details. Go back to correct the form.');
  await store.query('UPDATE meals SET name=$1, location=$2, rating=$3, comment=$4 WHERE id=$5 AND user_id=$6', [...values, Number(req.params.index), req.session.user.id]);
  res.redirect('/meals');
});
app.post('/meals/delete/:index', async (req, res) => {
  await store.query('DELETE FROM meals WHERE id=$1 AND user_id=$2', [Number(req.params.index), req.session.user.id]);
  res.redirect('/meals');
});
app.post('/meals/favorite/:index', async (req, res) => {
  await store.query('UPDATE meals SET favorite=1-favorite WHERE id=$1 AND user_id=$2', [Number(req.params.index), req.session.user.id]);
  res.redirect('/meals');
});
app.use((error, req, res, next) => {
  console.error('Request failed:', error.code || error.name);
  res.status(500).send('Something went wrong. Please try again shortly.');
});
async function start(port = process.env.PORT || 3000) {
  await store.init();
  return app.listen(port, () => console.log('Meal Manager server started'));
}
module.exports = { app, start };
