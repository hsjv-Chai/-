import {
  all,
  one,
  run,
  getUser,
  body,
  json,
  fail,
  id,
  now,
  db,
  restrictionStatements,
  sha,
  cookie,
} from "@/lib/server";
import {
  createState,
  applyAction,
  publicState,
  type GameState,
} from "./engine";
type Row = {
  id: string;
  game: string;
  phase: string;
  state: string;
  version: number;
  created_at: number;
  updated_at: number;
};
const lifetime = 7 * 86400000;
// This predicate is part of the write itself: a read-then-write check would
// allow simultaneous requests to put the same account in different rooms.
// Finished rooms still reserve seats because the host can start a rematch.
const seatsAvailable = `NOT EXISTS (
  SELECT 1 FROM game_rooms AS occupied, json_each(occupied.state, '$.seats') AS seat
  WHERE occupied.id<>? AND occupied.phase<>'closed' AND occupied.updated_at>?
    AND json_extract(seat.value, '$.id') IN (
      SELECT json_extract(value, '$.id') FROM json_each(?, '$.seats')
      WHERE value IS NOT NULL
    )
)`;
export async function gamesAPI(req: Request, key?: string) {
  const user = await getUser(req);
  if (!user) {
    // A revoked session can only collect its final public result, for five minutes.
    const token = req.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)melon_session=([^;]+)/)?.[1];
    if (req.method === "GET" && key && token) {
      const receipt = await one<{ user_id: string }>(
        "SELECT user_id FROM game_result_receipts WHERE token=? AND room_id=? AND expires>?",
        await sha(token),
        key,
        now(),
      );
      const final = receipt
        ? await one<Row>(
            "SELECT * FROM game_rooms WHERE id=? AND phase IN ('finished','closed')",
            key,
          )
        : null;
      if (final)
        return json(
          {
            id: final.id,
            version: final.version,
            serverTime: now(),
            ...publicState(JSON.parse(final.state), receipt!.user_id),
            accountEnded: true,
          },
          200,
          { "Set-Cookie": cookie("", req, 0) },
        );
    }
    fail("请先登录，再参与讨论", 401);
  }
  if (user.account_status === "restricted" && key !== user.restricted_room_id)
    fail("账号已受限，仅可完成当前整场牌局", 403);
  if (req.method === "GET" && !key) {
    const rows = await all<Row>(
      "SELECT * FROM game_rooms WHERE phase<>'closed' AND updated_at>? ORDER BY updated_at DESC LIMIT 60",
      now() - lifetime,
    );
    return json({
      rooms: rows.map((row) => {
        const s = JSON.parse(row.state) as GameState;
        return {
          id: row.id,
          game: s.game,
          phase: s.phase,
          seats: s.seats.map((p) =>
            p ? { id: p.id, nickname: p.nickname } : null,
          ),
          round: s.round,
          mine: s.seats.some((p) => p?.id === user.id),
          updatedAt: row.updated_at,
        };
      }),
    });
  }
  if (req.method === "POST" && !key) {
    const b = await body(req);
    if (b.game !== "doudizhu" && b.game !== "guandan")
      fail("请选择斗地主或掼蛋");
    const roomId = id(),
      time = now(),
      s = createState(b.game, {
        id: user.id,
        nickname: user.nickname,
        ready: false,
      });
    // Atomic per-account creation cap, including concurrent create requests.
    const state = JSON.stringify(s);
    const inserted = await run(
      `INSERT INTO game_rooms(id,owner_id,game,phase,state,version,created_at,updated_at) SELECT ?,?,?,?,?,0,?,? WHERE EXISTS(SELECT 1 FROM users WHERE id=? AND account_status='active' AND account_version=?) AND (SELECT COUNT(*) FROM game_rooms WHERE owner_id=? AND created_at>?)<10 AND ${seatsAvailable}`,
      roomId,
      user.id,
      b.game,
      "waiting",
      state,
      time,
      time,
      user.id,
      user.account_version,
      user.id,
      time - 3600000,
      roomId,
      time - lifetime,
      state,
    );
    if (!inserted.meta.changes) {
      if (
        !(await one(
          "SELECT id FROM users WHERE id=? AND account_status='active' AND account_version=?",
          user.id,
          user.account_version,
        ))
      )
        fail("账号状态已更新，请刷新后重试", 409);
      const occupied = await one<{ id: string }>(
        `SELECT r.id FROM game_rooms r, json_each(r.state, '$.seats') seat WHERE r.phase<>'closed' AND r.updated_at>? AND json_extract(seat.value, '$.id')=? LIMIT 1`,
        time - lifetime,
        user.id,
      );
      if (occupied) fail("你已在其他房间入座，请先退出原房间再开桌", 409);
      fail("每小时最多创建 10 个房间，请先使用已有房间", 429);
    }
    return json(
      { id: roomId, version: 0, serverTime: time, ...publicState(s, user.id) },
      201,
    );
  }
  if (!key || !/^[a-f0-9-]{36}$/.test(key)) fail("房间不存在", 404);
  const row = await one<Row>("SELECT * FROM game_rooms WHERE id=?", key);
  if (!row || row.updated_at <= now() - lifetime)
    fail("房间不存在或已超过 7 天未活动", 404);
  const s = JSON.parse(row.state) as GameState;
  if (req.method === "GET")
    return json({
      id: row.id,
      version: row.version,
      serverTime: now(),
      ...publicState(s, user.id),
    });
  if (req.method === "POST") {
    const b = await body(req);
    if (!Number.isInteger(b.version) || b.version !== row.version)
      fail("牌桌状态已更新，请重试", 409);
    if (typeof b.type !== "string") fail("请选择有效操作");
    if (
      user.account_status === "restricted" &&
      (!["bid", "exchange", "play", "pass", "tick", "leave", "ready"].includes(
        b.type,
      ) ||
        (b.type === "ready" && s.phase !== "roundEnd"))
    )
      fail("账号已受限，仅可完成当前整场牌局", 403);
    const startsMatch =
      b.type === "rematch" || (b.type === "ready" && s.phase === "waiting");
    const allowedActor = `EXISTS(SELECT 1 FROM users actor WHERE actor.id=? AND actor.account_version=? AND (actor.account_status='active' OR (actor.account_status='restricted' AND actor.restricted_room_id=?)))`;
    const allowedSeats = startsMatch
      ? `AND NOT EXISTS(SELECT 1 FROM json_each(?, '$.seats') seat JOIN users u ON u.id=json_extract(seat.value,'$.id') WHERE u.account_status<>'active')`
      : "";
    const time = now(),
      next = applyAction(s, user, b, time);
    const state = JSON.stringify(next);
    // Leaving must remain possible for accounts affected by the old bug.
    // All other writes validate every retained seat, including rematches.
    const args: unknown[] = [
      state,
      next.phase,
      time,
      key,
      row.version,
      user.id,
      user.account_version,
      key,
    ];
    if (startsMatch) args.push(state);
    if (b.type !== "leave") args.push(key, time - lifetime, state);
    const result = (await db().batch([
      db()
        .prepare(
          `UPDATE game_rooms SET state=?,phase=?,version=version+1,updated_at=? WHERE id=? AND version=? AND ${allowedActor} ${allowedSeats} ${b.type === "leave" ? "" : `AND ${seatsAvailable}`}`,
        )
        .bind(...args),
      ...restrictionStatements(time),
    ])) as { meta: { changes: number } }[];
    const updated = result[0];
    if (!updated.meta.changes) {
      const latest = await one<{ version: number }>(
        "SELECT version FROM game_rooms WHERE id=?",
        key,
      );
      if (latest?.version !== row.version)
        fail("其他玩家刚刚操作，请重试", 409);
      const actor = await one<{
        account_status: string;
        account_version: number;
      }>(
        "SELECT account_status,account_version FROM users WHERE id=?",
        user.id,
      );
      if (actor?.account_version !== user.account_version)
        fail("账号状态已更新，请刷新后重试", 409);
      if (
        startsMatch &&
        (await one(
          `SELECT 1 FROM json_each(?, '$.seats') seat JOIN users u ON u.id=json_extract(seat.value,'$.id') WHERE u.account_status<>'active' LIMIT 1`,
          state,
        ))
      )
        fail("房间有受限玩家，请退出后重新开桌", 403);
      fail("你或同桌玩家已在其他房间入座，请先退出多余的房间", 409);
    }
    const ended = !!(await one(
      "SELECT id FROM users WHERE id=? AND account_status='banned'",
      user.id,
    ));
    return json(
      {
        id: row.id,
        version: row.version + 1,
        serverTime: time,
        ...publicState(next, user.id),
        ...(ended ? { accountEnded: true } : {}),
      },
      200,
      ended ? { "Set-Cookie": cookie("", req, 0) } : {},
    );
  }
  return json({ error: "不支持的牌室操作" }, 405);
}
