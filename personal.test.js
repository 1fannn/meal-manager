const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createPersonalApp } = require('./personal');

test('personal journal saves meals across restarts and protects local requests', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'personal-meal-test-'));
  const filename = path.join(directory, 'test.sqlite');
  let journal, server, base;
  async function open() {
    journal = createPersonalApp(filename);
    server = journal.app.listen(0, '127.0.0.1');
    await new Promise(resolve => server.once('listening', resolve));
    base = 'http://127.0.0.1:' + server.address().port;
  }
  async function close() {
    await new Promise(resolve => server.close(resolve));
    journal.close();
  }
  async function request(url, data, headers = {}) {
    const response = await fetch(base + url, {
      method: data ? 'POST' : 'GET', redirect: 'manual',
      headers: { ...(data ? {'Content-Type':'application/x-www-form-urlencoded'} : {}), ...headers },
      body: data ? new URLSearchParams(data) : undefined
    });
    return { status: response.status, html: await response.text(), location: response.headers.get('location') };
  }
  try {
    await open();
    assert.equal((await request('/')).status, 200);
    const add = await request('/meals/add');
    assert.equal(add.status, 200);
    const csrf = add.html.match(/name="_csrf" value="([^"]+)"/)[1];
    assert.ok(!add.html.includes('href="/login"'));
    assert.equal((await request('/meals/add', {name:'Blocked'})).status,403);
    assert.equal((await request('/meals/add', {_csrf:csrf,name:'Bad',location:'Here',rating:'9'})).status,400);
    assert.equal((await request('/meals/add', {_csrf:csrf,name:'Cake <test>',location:'Singapore',rating:'5',comment:'Good'})).location,'/meals');
    let list = await request('/meals');
    assert.ok(list.html.includes('Cake &lt;test&gt;'));
    const id = list.html.match(/href="\/meals\/edit\/(\d+)"/)[1];
    assert.equal((await request('/meals/edit/'+id)).status,200);
    await request('/meals/favorite/'+id,{_csrf:csrf});
    await request('/meals/edit/'+id,{_csrf:csrf,name:'Saved cake',location:'Singapore',rating:'4',comment:'Persists'});
    await close();
    await open();
    list = await request('/meals');
    assert.ok(list.html.includes('Saved cake'));
    assert.ok(list.html.includes('Your favorites'));
    assert.ok(!list.html.includes('🍽'));
    assert.ok(!list.html.includes('↗</span>'));
    const nextCsrf = list.html.match(/name="_csrf" value="([^"]+)"/)[1];
    assert.equal((await request('/meals/delete/'+id,{_csrf:csrf})).status,403);
    await request('/meals/delete/'+id,{_csrf:nextCsrf});
    assert.ok(!(await request('/meals')).html.includes('Saved cake'));
    assert.equal((await request('/meals/edit/not-an-id')).status,404);
    const badHostStatus = await new Promise((resolve, reject) => {
      require('node:http').get(base, { headers: { Host: 'untrusted.example' } }, response => {
        response.resume();
        response.on('end', () => resolve(response.statusCode));
      }).on('error', reject);
    });
    assert.equal(badHostStatus,403);
    await close();
    server = null;
  } finally {
    if (server && server.listening) await close();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
