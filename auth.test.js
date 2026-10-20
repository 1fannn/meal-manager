const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

test('accounts own their meals; sessions, CSRF, password hashing and persistence', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'meal-auth-'));
  process.env.DB_FILE = path.join(dir, 'test.sqlite');
  delete process.env.DATABASE_URL;
  process.env.NODE_ENV = 'test';
  const store = require('./store');
  const { start } = require('./server');
  const server = await start(0);
  if (!server.listening) await new Promise(resolve => server.once('listening', resolve));
  const base = 'http://127.0.0.1:' + server.address().port;
  function client() {
    let cookie = '';
    let csrf = '';
    return {
      async request(url, data) {
        const response = await fetch(base + url, {
          method: data ? 'POST' : 'GET', redirect: 'manual',
          headers: { Cookie: cookie, ...(data ? {'Content-Type':'application/x-www-form-urlencoded'} : {}) },
          body: data ? new URLSearchParams({ _csrf: csrf, ...data }) : undefined
        });
        const value = response.headers.get('set-cookie');
        if (value) cookie = value.split(';')[0];
        const html = await response.text();
        const match = html.match(/name="_csrf" value="([^"]+)"/);
        if (match) csrf = match[1];
        return { status: response.status, html, location: response.headers.get('location') };
      }
    };
  }
  try {
    const a = client(), b = client(), guest = client();
    assert.equal((await guest.request('/meals')).location, '/login');
    assert.equal((await guest.request('/meals/add', {name:'Blocked'})).status, 403);
    await a.request('/register');
    assert.equal((await a.request('/register', {username:'alice',password:'short',confirmPassword:'short'})).status, 400);
    assert.equal((await a.request('/register', {username:'alice',password:'test-password-123',confirmPassword:'test-password-123'})).location, '/meals');
    await a.request('/meals/add');
    assert.equal((await a.request('/meals/add', {name:'Private cake',location:'Singapore',rating:'5',comment:'Only Alice'})).status, 302);
    const owned = (await store.query('SELECT * FROM meals')).rows[0];
    await b.request('/register');
    assert.equal((await b.request('/register', {username:'alice',password:'other-password-123',confirmPassword:'other-password-123'})).status, 409);
    assert.equal((await b.request('/register', {username:'bob',password:'other-password-123',confirmPassword:'other-password-123'})).status, 302);
    assert.ok(!(await b.request('/meals')).html.includes('Private cake'));
    assert.equal((await b.request('/meals/edit/'+owned.id)).location, '/meals');
    await b.request('/meals/edit/'+owned.id, {name:'Stolen',location:'Tokyo',rating:'1',comment:''});
    await b.request('/meals/favorite/'+owned.id, {});
    await b.request('/meals/delete/'+owned.id, {});
    let saved = (await store.query('SELECT * FROM meals WHERE id=$1',[owned.id])).rows[0];
    assert.equal(saved.name,'Private cake');
    assert.equal(saved.favorite,0);
    await a.request('/meals/favorite/'+owned.id, {});
    assert.equal((await store.query('SELECT * FROM meals WHERE id=$1',[owned.id])).rows[0].favorite,1);
    assert.ok((await a.request('/meals')).html.includes('/meals/edit/'+owned.id));
    await a.request('/meals/edit/'+owned.id, {name:'Updated cake',location:'Singapore',rating:'4',comment:'Good'});
    assert.equal((await store.query('SELECT * FROM meals WHERE id=$1',[owned.id])).rows[0].name,'Updated cake');
    assert.equal((await a.request('/logout',{})).location,'/login');
    assert.equal((await a.request('/meals')).location,'/login');
    await a.request('/login');
    assert.equal((await a.request('/login',{username:'alice',password:'wrong-password'})).status,401);
    assert.equal((await a.request('/login',{username:'alice',password:'test-password-123'})).location,'/meals');
    assert.ok((await a.request('/meals')).html.includes('Updated cake'));
    const user = (await store.query('SELECT * FROM users WHERE username=$1',['alice'])).rows[0];
    assert.ok(!user.password_hash.includes('test-password-123'));
    assert.equal((await a.request('/meals/add',{_csrf:'wrong',name:'bad'})).status,403);
    await a.request('/meals/delete/'+owned.id,{});
    assert.equal((await store.query('SELECT * FROM meals')).rows.length,0);
    const { DatabaseSync } = require('node:sqlite');
    const reopened = new DatabaseSync(process.env.DB_FILE);
    assert.equal(reopened.prepare('SELECT COUNT(*) AS count FROM users').get().count,2);
    reopened.close();
  } finally {
    await new Promise(resolve => server.close(resolve));
    if (server.closeAllConnections) server.closeAllConnections();
    await store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
