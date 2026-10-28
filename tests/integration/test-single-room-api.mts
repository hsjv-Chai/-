import {testFetch as fetch} from "../helpers/verified-registration.mjs";
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { join, resolve } from 'node:path';
import { createState, type Phase } from '../../lib/games/engine.ts';

const base = process.env.MELON_TEST_URL || 'http://127.0.0.1:5175';
const directory = resolve(process.env.MELON_DATA_DIR || '');
if (!['127.0.0.1', 'localhost'].includes(new URL(base).hostname) || !directory.includes('card-room-qa')) {
  throw new Error('Requires an isolated loopback card-room-qa database');
}
const db = new DatabaseSync(join(directory, 'melon.sqlite'));
db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
const clients = Array.from({ length: 4 }, (_, i) => ({ id: randomUUID(), nickname: `单桌验证${i}`, token: randomUUID() }));
const ids = new Set<string>();
type Client = typeof clients[number];
type Room = { id: string; version: number; seats: ({ id: string } | null)[]; phase: Phase };
let checks = 0;
async function send(client: Client, path: string, data?: unknown) {
  const response = await fetch(base + '/api/games' + path, {
    method: data === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', Origin: new URL(base).origin, Cookie: `melon_session=${client.token}` },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const value = await response.json() as Room & { error?: string };
  if (response.status === 201) ids.add(value.id);
  return { status: response.status, value };
}
async function expect(client: Client, path: string, data?: unknown, status = 200) {
  const result = await send(client, path, data);
  assert.equal(result.status, status, JSON.stringify(result)); checks++;
  return result.value;
}
function fixture(client: Client, phase: Phase = 'waiting', updatedAt = Date.now()) {
  const id = randomUUID(), state = createState('guandan', { ...client, ready: false });
  state.phase = phase;
  db.prepare('INSERT INTO game_rooms(id,owner_id,game,phase,state,version,created_at,updated_at) VALUES(?,?,?,?,?,0,?,?)')
    .run(id, client.id, 'guandan', phase, JSON.stringify(state), updatedAt, updatedAt);
  ids.add(id);
  return { id, version: 0 };
}
function clearRooms() {
  for (const id of ids) db.prepare('DELETE FROM game_rooms WHERE id=?').run(id);
  ids.clear();
}
function occupied(client: Client) {
  return Number(db.prepare(`SELECT COUNT(*) AS n FROM game_rooms r, json_each(r.state,'$.seats') s
    WHERE r.phase<>'closed' AND r.updated_at>? AND json_extract(s.value,'$.id')=?`).get(Date.now() - 7 * 86400000, client.id)!.n);
}
try {
  for (const client of clients) {
    db.prepare('INSERT INTO users(id,username,nickname,password,role,created_at) VALUES(?,?,?,?,?,?)')
      .run(client.id, 'qa_' + client.id.replaceAll('-', '').slice(0, 20), client.nickname, 'disabled:test-only', 'member', Date.now());
    db.prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)')
      .run(createHash('sha256').update(client.token).digest('hex'), client.id, Date.now() + 3600000);
  }
  const [actor, host, other] = clients;
  // Both game types and every seat-reserving phase must block a second room.
  for (const phase of ['waiting', 'bidding', 'tribute', 'return', 'playing', 'roundEnd', 'finished'] as Phase[]) {
    const first = fixture(actor, phase), second = fixture(host);
    await expect(actor, '', { game: 'doudizhu' }, 409);
    await expect(actor, '/' + second.id, { type: 'join', version: 0 }, 409);
    await expect(actor, '/' + second.id); // Spectating is still permitted.
    await expect(actor, '/' + first.id, { type: 'leave', version: 0 });
    const joined = await expect(actor, '/' + second.id, { type: 'join', version: 0 });
    await expect(actor, '/' + second.id, { type: 'join', value: 2, version: joined.version });
    assert.equal(occupied(actor), 1); checks++;
    clearRooms();
  }
  const creates = await Promise.all(Array.from({ length: 8 }, () => send(actor, '', { game: 'doudizhu' })));
  assert.deepEqual(creates.map(r => r.status).sort(), [201, 409, 409, 409, 409, 409, 409, 409]);
  assert.equal(occupied(actor), 1); checks += 2; clearRooms();

  for (let attempt = 0; attempt < 5; attempt++) {
    const a = fixture(host), b = fixture(other);
    const joins = await Promise.all([a, b].map(r => send(actor, '/' + r.id, { type: 'join', version: 0 })));
    assert.deepEqual(joins.map(r => r.status).sort(), [200, 409]);
    assert.equal(occupied(actor), 1); checks += 2; clearRooms();
    const target = fixture(host);
    const mixed = await Promise.all([send(actor, '', { game: 'doudizhu' }), send(actor, '/' + target.id, { type: 'join', version: 0 })]);
    assert.equal(mixed.filter(r => r.status === 200 || r.status === 201).length, 1);
    assert.equal(mixed.filter(r => r.status === 409).length, 1);
    assert.equal(occupied(actor), 1); checks += 3; clearRooms();
  }
  for (const inactive of ['closed', 'expired']) {
    fixture(actor, inactive === 'closed' ? 'closed' : 'playing', inactive === 'expired' ? Date.now() - 8 * 86400000 : Date.now());
    await expect(actor, '', { game: 'guandan' }, 201);
    assert.equal(occupied(actor), 1); checks++; clearRooms();
  }
  // A conflicting room outside the lobby's 60-row window still blocks entry.
  fixture(actor, 'waiting', Date.now() - 3600000);
  for (let i = 0; i < 61; i++) fixture(host);
  await expect(actor, '', { game: 'guandan' }, 409);
  clearRooms();

  // Historical duplicates cannot be restarted by another player, but can be left.
  const old = fixture(host, 'finished'), extra = fixture(actor);
  const state = JSON.parse(db.prepare('SELECT state FROM game_rooms WHERE id=?').get(old.id)!.state as string);
  state.seats[1] = { id: actor.id, nickname: actor.nickname, ready: false };
  db.prepare('UPDATE game_rooms SET state=? WHERE id=?').run(JSON.stringify(state), old.id);
  await expect(host, '/' + old.id, { type: 'rematch', version: 0 }, 409);
  await expect(actor, '/' + extra.id, { type: 'leave', version: 0 });
  await expect(host, '/' + old.id, { type: 'rematch', version: 0 });
  assert.equal(occupied(actor), 1); checks++;
  console.log(`PASS: ${checks} single-room API assertions; concurrent creates/joins, all phases, switching seats, leaving, expiry, lobby limit and rematches.`);
} finally {
  clearRooms();
  for (const client of clients) {
    db.prepare('DELETE FROM sessions WHERE user_id=?').run(client.id);
    db.prepare('DELETE FROM users WHERE id=?').run(client.id);
  }
  db.close();
}
