import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { join, resolve } from 'node:path';
import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { gardenDate } from '../../lib/garden/model.ts';
const base = process.env.MELON_TEST_URL || 'http://127.0.0.1:5173/melon';
const directory = resolve(process.env.MELON_DATA_DIR || '');
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname) || !directory.includes('garden-qa')) throw new Error('Requires an isolated loopback garden-qa database');
const db = new DatabaseSync(join(directory, 'melon.sqlite'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
const checkpoint = join(directory, 'garden-qa-restart.json');
type Client = { id: string; cookie: string; username: string };
let clients: Client[] = [], checks = 0;
async function api(path = '', method = 'GET', data?: unknown, client = clients[0], status = 200, origin = new URL(base).origin) {
  const r = await fetch(base + '/api/' + path, { method, headers: { 'Content-Type': 'application/json', Origin: origin, ...(client?.cookie ? { Cookie: client.cookie } : {}) }, body: data === undefined ? undefined : JSON.stringify(data) });
  const b = await r.json() as any;
  assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(b)}`); checks++;
  assert.equal(r.headers.get('cache-control'), 'no-store'); checks++;
  if (client && r.headers.get('set-cookie')) client.cookie = r.headers.get('set-cookie')!.split(';')[0];
  return b;
}
function clean() {
  for (const c of clients) {
    if (c.id) { db.prepare('DELETE FROM garden_check_ins WHERE user_id=?').run(c.id); db.prepare('DELETE FROM sessions WHERE user_id=?').run(c.id); db.prepare('DELETE FROM users WHERE id=?').run(c.id); }
    db.prepare('DELETE FROM auth_attempts WHERE key=?').run(c.username);
  }
  try { unlinkSync(checkpoint); } catch {}
}
try {
  if (process.argv.includes('--after-restart')) {
    clients = JSON.parse(readFileSync(checkpoint, 'utf8'));
    for (const [i, c] of clients.entries()) {
      const s = await api('garden', 'GET', undefined, c);
      assert.equal(s.totalDays, i === 0 ? 7 : 1); assert.equal(s.harvestCount, i === 0 ? 1 : 0); checks += 2;
      const repeat = await api('garden/check-in', 'POST', {}, c);
      assert.equal(repeat.alreadyCheckedIn, true); assert.equal(repeat.harvested, false); checks += 2;
    }
    clean(); console.log(`Garden restart: ${checks} assertions passed; sessions, growth and harvest persisted; fixtures removed.`);
  } else {
    const stamp = Date.now();
    clients = Array.from({ length: 2 }, (_, i) => ({ id: '', cookie: '', username: `garden_${stamp}_${i}` }));
    for (const [i, c] of clients.entries()) {
      await api('auth/register', 'POST', { username: c.username, nickname: '种瓜验证' + i, password: 'Garden_QA_12345' }, c);
      c.id = (await api('auth/me', 'GET', undefined, c)).user.id;
    }
    const guest = { id: '', cookie: '', username: '' };
    await api('garden', 'GET', undefined, guest, 401);
    await api('garden/check-in', 'POST', {}, guest, 401);
    await api('garden', 'GET', undefined, { ...guest, cookie: 'melon_session=expired' }, 401);
    await api('garden/check-in', 'POST', {}, clients[0], 403, 'https://invalid.example');
    await api('garden/check-in', 'POST', { day: '2099-01-01', user_id: clients[1].id, reward: 999 }, clients[0], 400);
    for (const path of ['garden?page=0', 'garden?page=-1', 'garden?page=1.5', 'garden?page=abc', 'garden?page=9007199254740992']) await api(path, 'GET', undefined, clients[0], 400);
    await api('garden/check-in/extra', 'POST', {}, clients[0], 404);
    const initial = await api('garden');
    assert.equal(initial.totalDays, 0); assert.equal(initial.stage, 0); assert.equal(initial.checkedIn, false); checks += 3;
    const first = await api('garden/check-in', 'POST', {}, clients[1]);
    assert.equal(first.stage, 1); assert.equal(first.totalDays, 1); assert.equal(first.streak, 1); assert.equal(first.harvested, false); checks += 4;
    const today = gardenDate(Date.now());
    const insert = db.prepare('INSERT INTO garden_check_ins(user_id,day,created_at) VALUES(?,?,?)');
    for (let i = 6; i >= 1; i--) { const t = Date.parse(today + 'T12:00:00+08:00') - i * 86400000; insert.run(clients[0].id, gardenDate(t), t); }
    const concurrent = await Promise.all(Array.from({ length: 16 }, () => api('garden/check-in', 'POST', {})));
    assert.equal(concurrent.filter(r => !r.alreadyCheckedIn).length, 1);
    assert.equal(concurrent.filter(r => r.harvested).length, 1);
    assert.ok(concurrent.every(r => r.totalDays === 7 && r.harvestCount === 1 && r.stage === 7)); checks += 3;
    const repeated = await api('garden/check-in', 'POST', {});
    assert.equal(repeated.harvested, false); assert.equal(repeated.alreadyCheckedIn, true); checks += 2;
    const isolated = await api('garden?user_id=' + clients[0].id, 'GET', undefined, clients[1]);
    assert.equal(isolated.totalDays, 1); assert.equal(isolated.harvestCount, 0); checks += 2;
    for (let i = 147; i >= 1; i--) { const t = Date.parse(today + 'T12:00:00+08:00') - i * 86400000; insert.run(clients[1].id, gardenDate(t), t); }
    const p1 = await api('garden', 'GET', undefined, clients[1]), p2 = await api('garden?page=2', 'GET', undefined, clients[1]);
    assert.equal(p1.harvests.length, 20); assert.equal(p1.harvests[0].number, 21); assert.equal(p2.harvests.length, 1); assert.equal(p2.harvests[0].number, 1); checks += 4;
    db.prepare('DELETE FROM garden_check_ins WHERE user_id=? AND day<>?').run(clients[1].id, today);
    // Expired sessions cannot read private harvest history.
    db.prepare('UPDATE sessions SET expires=0 WHERE user_id=?').run(clients[1].id);
    await api('garden', 'GET', undefined, clients[1], 401);
    await api('auth/login', 'POST', { username: clients[1].username, password: 'Garden_QA_12345' }, clients[1]);
    writeFileSync(checkpoint, JSON.stringify(clients), { mode: 0o600 });
    console.log(`Garden API: ${checks} assertions passed. Restart this isolated server and run with --after-restart to check persistence and remove fixtures.`);
  }
} catch (error) { clean(); throw error; } finally { db.close(); }
