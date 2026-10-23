import assert from 'node:assert/strict';
import { test } from 'node:test';
import { gardenDate, gardenState, type CheckIn } from '../lib/garden/model.ts';
const time = (s: string) => Date.parse(s + 'T12:00:00+08:00');
const rows = (...days: string[]): CheckIn[] => days.map(day => ({ day, created_at: time(day) }));
test('Beijing midnight, month, year and leap day boundaries', () => {
  for (const [before, after] of [['2026-10-31', '2026-11-01'], ['2026-12-31', '2027-01-01'], ['2028-02-28', '2028-02-29'], ['2028-02-29', '2028-03-01']]) {
    const t = Date.parse(before + 'T15:59:59.999Z');
    assert.equal(gardenDate(t), before); assert.equal(gardenDate(t + 1), after);
    assert.equal(gardenState([], t).nextResetAt, t + 1);
  }
});
test('first visit, first check-in, seventh harvest and eighth new seed', () => {
  const days = Array.from({ length: 8 }, (_, i) => '2026-10-' + String(i + 1).padStart(2, '0'));
  assert.deepEqual([gardenState([], time(days[0])).stage, gardenState([], time(days[0])).streak], [0, 0]);
  for (let n = 1; n <= 8; n++) {
    const s = gardenState(rows(...days.slice(0, n)), time(days[n - 1]));
    assert.equal(s.stage, n === 8 ? 1 : n); assert.equal(s.streak, n); assert.equal(s.checkedIn, true);
    assert.equal(s.harvestCount, n >= 7 ? 1 : 0); assert.equal(s.totalDays, n);
    if (n >= 7) assert.equal(s.harvests[0].day, '2026-10-07');
  }
});
test('missed days preserve growth and harvest; streak resets only after a missed day', () => {
  const r = rows('2026-10-01', '2026-10-02');
  assert.equal(gardenState(r, time('2026-10-03')).streak, 2);
  const missed = gardenState(r, time('2026-10-04'));
  assert.equal(missed.streak, 0); assert.equal(missed.stage, 2); assert.equal(missed.checkedIn, false);
  const resumed = gardenState([...r, ...rows('2026-10-10')], time('2026-10-10'));
  assert.equal(resumed.streak, 1); assert.equal(resumed.stage, 3);
  const mature = rows(...Array.from({ length: 7 }, (_, i) => '2026-10-0' + (i + 1)));
  const later = gardenState(mature, time('2026-11-01'));
  assert.equal(later.harvestCount, 1); assert.equal(later.stage, 7); assert.equal(later.streak, 0);
});
test('continuous streak across leap day and year boundary', () => {
  assert.equal(gardenState(rows('2028-02-28', '2028-02-29', '2028-03-01'), time('2028-03-01')).streak, 3);
  assert.equal(gardenState(rows('2026-12-31', '2027-01-01'), time('2027-01-02')).streak, 2);
});
test('harvest history newest first, pages of 20 and bounded page', () => {
  const r = Array.from({ length: 150 }, (_, i) => { const t = time('2026-01-01') + i * 86400000; return { day: gardenDate(t), created_at: t }; });
  const one = gardenState(r, r.at(-1)!.created_at), two = gardenState(r, r.at(-1)!.created_at, 2);
  assert.equal(one.harvestCount, 21); assert.equal(one.harvests.length, 20); assert.equal(one.harvests[0].number, 21);
  assert.equal(two.harvests.length, 1); assert.equal(two.harvests[0].number, 1);
  assert.equal(gardenState(r, r.at(-1)!.created_at, 999).page, 2);
});
