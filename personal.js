const express = require('express');
const { DatabaseSync } = require('node:sqlite');
const { randomBytes, timingSafeEqual } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

function createPersonalApp(filename = path.join(__dirname, 'data', 'personal-meals.sqlite')) {
  fs.mkdirSync(path.dirname(filename), { recursive: true });
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(`CREATE TABLE IF NOT EXISTS personal_meals (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    location TEXT NOT NULL,
    rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    comment TEXT NOT NULL DEFAULT '',
    favorite INTEGER NOT NULL DEFAULT 0
  )`);
  const app = express();
  const csrf = randomBytes(32).toString('hex');
  app.disable('x-powered-by');
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use((req, res, next) => {
    if (!['localhost', '127.0.0.1'].includes(req.hostname)) return res.status(403).send('This journal is available only on this computer.');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    next();
  });
  app.use(express.static(path.join(__dirname, 'public')));
  app.use(express.urlencoded({ extended: false, limit: '16kb' }));
  app.use((req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.locals.personalMode = true;
    res.locals.currentUser = null;
    res.locals.csrf = csrf;
    if (req.method === 'POST') {
      const submitted = Buffer.from(String(req.body._csrf || ''));
      const expected = Buffer.from(csrf);
      if (submitted.length !== expected.length || !timingSafeEqual(submitted, expected)) return res.status(403).send('Please refresh this page before saving changes.');
    }
    next();
  });
  app.get('/', (req, res) => res.render('index'));
  app.get('/meals', (req, res) => {
    const meals = db.prepare('SELECT * FROM personal_meals ORDER BY id DESC').all().map(meal => ({ ...meal, favorite: Boolean(meal.favorite) }));
    res.render('personalMeals', { meals });
  });
  app.get('/meals/add', (req, res) => res.render('addMeal'));
  function values(body) {
    const name = String(body.name || '').trim();
    const location = String(body.location || '').trim();
    const rating = Number(body.rating);
    const comment = String(body.comment || '').trim();
    if (!name || name.length > 150 || !location || location.length > 2000 || !Number.isInteger(rating) || rating < 1 || rating > 5 || comment.length > 5000) return null;
    return [name, location, rating, comment];
  }
  function invalid(res) {
    return res.status(400).send('Please enter a meal name, address and rating from 1 to 5. Go back to correct the form.');
  }
  app.post('/meals/add', (req, res) => {
    const input = values(req.body);
    if (!input) return invalid(res);
    db.prepare('INSERT INTO personal_meals (name,location,rating,comment) VALUES (?,?,?,?)').run(...input);
    res.redirect('/meals');
  });
  app.param('index', (req, res, next, id) => {
    if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id))) return res.status(404).send('Meal not found.');
    req.mealId = Number(id);
    next();
  });
  app.get('/meals/edit/:index', (req, res) => {
    const meal = db.prepare('SELECT * FROM personal_meals WHERE id=?').get(req.mealId);
    if (!meal) return res.redirect('/meals');
    res.render('editMeal', { meal, index: meal.id });
  });
  app.post('/meals/edit/:index', (req, res) => {
    const input = values(req.body);
    if (!input) return invalid(res);
    db.prepare('UPDATE personal_meals SET name=?,location=?,rating=?,comment=? WHERE id=?').run(...input, req.mealId);
    res.redirect('/meals');
  });
  app.post('/meals/favorite/:index', (req, res) => {
    db.prepare('UPDATE personal_meals SET favorite=1-favorite WHERE id=?').run(req.mealId);
    res.redirect('/meals');
  });
  app.post('/meals/delete/:index', (req, res) => {
    db.prepare('DELETE FROM personal_meals WHERE id=?').run(req.mealId);
    res.redirect('/meals');
  });
  app.use((error, req, res, next) => {
    console.error('Journal request failed:', error.code || error.name);
    res.status(500).send('Could not save this change. Please try again.');
  });
  return { app, close: () => db.close() };
}

function start(port = process.env.PORT || 3000) {
  const journal = createPersonalApp();
  const server = journal.app.listen(port, '127.0.0.1', () => console.log('Personal Meal Manager: http://localhost:' + server.address().port));
  server.on('close', journal.close);
  return server;
}
module.exports = { createPersonalApp, start };
