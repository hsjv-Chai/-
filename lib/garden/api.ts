import { all, body, fail, json, now, requireUser, run } from '../server';
import { gardenDate, gardenState, type CheckIn } from './model';
import { cooperativeAPI } from './cooperative-api';
export async function gardenAPI(req: Request, segments: string[]) {
  if (segments[0] === 'coops') return cooperativeAPI(req, segments.slice(1));
  const isRead = req.method === 'GET' && segments.length === 0;
  const isWrite = req.method === 'POST' && segments.length === 1 && segments[0] === 'check-in';
  if (!isRead && !isWrite) fail('种瓜接口不存在', 404);
  const user = await requireUser(req);
  const rawPage = new URL(req.url).searchParams.get('page') || '1';
  const page = Number(rawPage);
  if (!/^\d+$/.test(rawPage) || !Number.isSafeInteger(page) || page < 1) fail('页码不正确');
  if (isWrite && Object.keys(await body(req)).length) fail('签到无需提交日期、账户或奖励');
  const time = now();
  let added = false;
  if (isWrite) {
    const result = await run('INSERT INTO garden_check_ins(user_id,day,created_at) VALUES(?,?,?) ON CONFLICT(user_id,day) DO NOTHING', user.id, gardenDate(time), time);
    added = result.meta.changes === 1;
  }
  const rows = await all<CheckIn>('SELECT day,created_at FROM garden_check_ins WHERE user_id=? ORDER BY day', user.id);
  const state = gardenState(rows, time, isWrite ? 1 : page);
  return json({ ...state, ...(isWrite ? { alreadyCheckedIn: !added, harvested: added && state.totalDays % 7 === 0 } : {}) });
}
