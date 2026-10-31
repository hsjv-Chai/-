import {
  all,
  body,
  db,
  fail,
  id,
  json,
  now,
  one,
  requireUser,
  run,
  str,
} from "../server";
import {
  coopClock,
  coopStage,
  type CoopCard,
  type CoopMember,
} from "./cooperative-model";
import { coopQueries as queries } from "./cooperative-queries";

type CardRow = Omit<CoopCard, "stage" | "mature">;
const cardsSQL = `SELECT c.id,c.name,c.intro,c.owner_id AS ownerId,u.nickname AS ownerNickname,
  c.current_round AS round,r.growth,r.matured_day AS maturedDay,c.created_at AS createdAt,c.last_watered_at AS lastWateredAt,
  (SELECT COUNT(*) FROM coop_members m WHERE m.coop_id=c.id AND m.left_at IS NULL) AS memberCount,
  (SELECT COUNT(*) FROM coop_rounds h WHERE h.coop_id=c.id AND h.matured_at IS NOT NULL) AS harvestCount
  FROM coop_gardens c JOIN coop_rounds r ON r.coop_id=c.id AND r.number=c.current_round LEFT JOIN users u ON u.id=c.owner_id`;
const card = (r: CardRow): CoopCard => ({
  ...r,
  stage: coopStage(r.growth),
  mature: r.maturedDay !== null,
});
const pages = (total: number) => Math.max(1, Math.ceil(total / 20));
function pageOf(req: Request) {
  const raw = new URL(req.url).searchParams.get("page") || "1";
  const page = Number(raw);
  if (
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1_000_000
  )
    fail("页码不正确");
  return page;
}
function exactFields(value: Record<string, unknown>, keys: string[]) {
  if (Object.keys(value).some((k) => !keys.includes(k)))
    fail("请求包含不支持的字段");
}
async function garden(coopId: string) {
  const row = await one<CardRow>(cardsSQL + " WHERE c.id=?", coopId);
  if (!row) fail("这块合种瓜田不存在", 404);
  return card(row);
}
async function list(req: Request) {
  const q = (new URL(req.url).searchParams.get("q") || "").trim();
  if (q.length > 100) fail("搜索内容不能超过 100 个字符");
  const pattern = "%" + q.replace(/[\\%_]/g, "\\$&") + "%";
  const where =
    " WHERE (c.name LIKE ? ESCAPE '\\' OR c.intro LIKE ? ESCAPE '\\')";
  const total = (await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM coop_gardens c" + where,
    pattern,
    pattern,
  ))!.n;
  const page = Math.min(pageOf(req), pages(total));
  const rows = await all<CardRow>(
    cardsSQL +
      where +
      " ORDER BY c.last_watered_at DESC,c.created_at DESC,c.id LIMIT 20 OFFSET ?",
    pattern,
    pattern,
    (page - 1) * 20,
  );
  return json({
    ...coopClock(now()),
    items: rows.map(card),
    q,
    total,
    page,
    totalPages: pages(total),
  });
}
async function mine(req: Request) {
  const user = await requireUser(req),
    clock = coopClock(now());
  const rows = await all<CardRow>(
    cardsSQL +
      " WHERE EXISTS(SELECT 1 FROM coop_members m WHERE m.coop_id=c.id AND m.user_id=? AND m.left_at IS NULL) ORDER BY c.last_watered_at DESC,c.created_at DESC,c.id",
    user.id,
  );
  const todayWater = await one(
    "SELECT w.coop_id AS coopId,c.name FROM coop_waters w JOIN coop_gardens c ON c.id=w.coop_id WHERE w.user_id=? AND w.day=?",
    user.id,
    clock.today,
  );
  const total = (await one<{ n: number }>(
    "SELECT COUNT(*) AS n FROM coop_memories WHERE user_id=?",
    user.id,
  ))!.n;
  const page = Math.min(pageOf(req), pages(total));
  const memories = await all(
    `SELECT a.coop_id AS coopId,c.name,a.round_number AS round,a.day,a.awarded_at AS awardedAt,
    (SELECT COUNT(*) FROM coop_waters w WHERE w.coop_id=a.coop_id AND w.round_number=a.round_number AND w.user_id=a.user_id) AS contribution
    FROM coop_memories a JOIN coop_gardens c ON c.id=a.coop_id WHERE a.user_id=?
    ORDER BY a.awarded_at DESC,a.coop_id,a.round_number DESC LIMIT 20 OFFSET ?`,
    user.id,
    (page - 1) * 20,
  );
  return json({
    ...clock,
    gardens: rows.map(card),
    todayWater,
    memories,
    total,
    page,
    totalPages: pages(total),
  });
}
async function detail(req: Request, coopId: string) {
  const value = await garden(coopId),
    clock = coopClock(now());
  const rawMembers = await all<
    Omit<CoopMember, "canParticipate" | "wateredToday"> & {
      canParticipate: number;
      wateredToday: number;
    }
  >(
    `SELECT m.user_id AS userId,u.nickname,m.joined_at AS joinedAt,(u.account_status='active') AS canParticipate,
    (SELECT COUNT(*) FROM coop_waters w WHERE w.coop_id=m.coop_id AND w.user_id=m.user_id AND w.round_number=?) AS roundContribution,
    (SELECT COUNT(*) FROM coop_waters w WHERE w.coop_id=m.coop_id AND w.user_id=m.user_id) AS totalContribution,
    EXISTS(SELECT 1 FROM coop_waters w WHERE w.coop_id=m.coop_id AND w.user_id=m.user_id AND w.day=?) AS wateredToday
    FROM coop_members m JOIN users u ON u.id=m.user_id WHERE m.coop_id=? AND m.left_at IS NULL ORDER BY m.joined_at,m.id`,
    value.round,
    clock.today,
    coopId,
  );
  const activity = await all(
    `SELECT w.id,w.user_id AS userId,u.nickname,w.round_number AS round,w.created_at AS createdAt
    FROM coop_waters w JOIN users u ON u.id=w.user_id WHERE w.coop_id=? ORDER BY w.created_at DESC,w.id DESC LIMIT 20`,
    coopId,
  );
  const page = Math.min(pageOf(req), pages(value.harvestCount));
  const harvests = await all(
    `SELECT r.number AS round,r.matured_day AS day,r.matured_at AS createdAt,
    (SELECT COUNT(*) FROM coop_memories a WHERE a.coop_id=r.coop_id AND a.round_number=r.number) AS contributors
    FROM coop_rounds r WHERE r.coop_id=? AND r.matured_at IS NOT NULL ORDER BY r.number DESC LIMIT 20 OFFSET ?`,
    coopId,
    (page - 1) * 20,
  );
  return json({
    ...clock,
    garden: value,
    members: rawMembers.map((m) => ({
      ...m,
      canParticipate: !!m.canParticipate,
      wateredToday: !!m.wateredToday,
    })),
    activity,
    harvests,
    page,
    total: value.harvestCount,
    totalPages: pages(value.harvestCount),
  });
}
async function create(req: Request) {
  const user = await requireUser(req),
    input = await body(req);
  exactFields(input, ["name", "intro", "requestId"]);
  const name = str(input.name, "瓜田名称", 2, 24),
    intro = str(input.intro ?? "", "瓜田简介", 0, 160);
  const coopId = str(input.requestId, "创建请求标识", 36, 36);
  if (!/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(coopId))
    fail("创建请求标识不正确");
  const previous = await one<{ creator_id: string }>(
    "SELECT creator_id FROM coop_gardens WHERE id=?",
    coopId,
  );
  if (previous) {
    if (previous.creator_id !== user.id) fail("创建请求标识已被使用", 409);
    return json({
      garden: await garden(coopId),
      ...coopClock(now()),
      alreadyCreated: true,
    });
  }
  const time = now();
  await db().batch([
    db().prepare(queries.create).bind(coopId, name, intro, user.id, time, time),
    db().prepare(queries.firstRound).bind(time, coopId, user.id),
    db()
      .prepare(queries.createMember)
      .bind(id(), user.id, time, coopId, user.id, user.id),
  ]);
  const created = await one<{ creator_id: string }>(
    "SELECT creator_id FROM coop_gardens WHERE id=?",
    coopId,
  );
  if (created?.creator_id !== user.id) fail("创建请求标识已被使用", 409);
  return json(
    { garden: await garden(coopId), ...coopClock(time), alreadyCreated: false },
    201,
  );
}
async function mutate(req: Request, coopId: string, action?: string) {
  const user = await requireUser(req),
    input = await body(req),
    time = now(),
    clock = coopClock(time);
  await garden(coopId);
  if (req.method === "PATCH") {
    exactFields(input, ["name", "intro"]);
    const name = str(input.name, "瓜田名称", 2, 24),
      intro = str(input.intro ?? "", "瓜田简介", 0, 160);
    const changed = await run(
      queries.edit,
      name,
      intro,
      time,
      coopId,
      user.id,
      user.id,
      user.id,
    );
    if (!changed.meta.changes) fail("只有当前负责人可以编辑这块瓜田", 403);
    return json({ ...clock, garden: await garden(coopId) });
  }
  exactFields(input, []);
  if (action === "join") {
    const changed = await run(
      queries.join,
      id(),
      user.id,
      time,
      coopId,
      user.id,
    );
    return json({
      ...clock,
      garden: await garden(coopId),
      alreadyJoined: !changed.meta.changes,
    });
  }
  if (action === "leave") {
    await run(queries.leave, time, coopId, user.id);
    return json({ ...clock, garden: await garden(coopId) });
  }
  const waterId = id();
  const changed = await run(
    queries.water,
    waterId,
    clock.today,
    user.id,
    clock.today,
    time,
    coopId,
    user.id,
    clock.today,
  );
  const actual = await one<{ coop_id: string }>(
    "SELECT coop_id FROM coop_waters WHERE user_id=? AND day=?",
    user.id,
    clock.today,
  );
  if (actual?.coop_id !== coopId)
    fail("今天已经在另一块合种瓜田浇过水，明天再来吧", 409);
  return json({
    ...clock,
    garden: await garden(coopId),
    alreadyWatered: !changed.meta.changes,
  });
}

export async function cooperativeAPI(req: Request, path: string[]) {
  try {
    const [coopId, action] = path;
    if (!path.length && req.method === "GET") return await list(req);
    if (!path.length && req.method === "POST") return await create(req);
    if (path.length === 1 && coopId === "me" && req.method === "GET")
      return await mine(req);
    if (coopId && coopId !== "me" && path.length === 1 && req.method === "GET")
      return await detail(req, coopId);
    if (
      coopId &&
      coopId !== "me" &&
      path.length === 1 &&
      req.method === "PATCH"
    )
      return await mutate(req, coopId);
    if (
      coopId &&
      coopId !== "me" &&
      path.length === 2 &&
      req.method === "POST" &&
      ["join", "leave", "water"].includes(action)
    )
      return await mutate(req, coopId, action);
    fail("合种接口不存在", 404);
  } catch (error) {
    const message = (error as Error).message;
    const errors: Record<string, [string, number]> = {
      COOP_FULL: ["这块瓜田已经有 10 位成员，看看其他瓜田吧", 409],
      COOP_MEMBERSHIP_LIMIT: ["最多同时参与 3 块合种瓜田，请先退出一块", 409],
      COOP_NOT_MEMBER: ["请先加入这块瓜田，再一起浇水", 403],
      COOP_MATURED: ["这颗西瓜今天已成熟，明天开启新一轮", 409],
      COOP_ROUND_CONFLICT: ["瓜田状态已更新，请刷新后重试", 409],
    };
    for (const [code, [text, status]] of Object.entries(errors))
      if (message.includes(code)) fail(text, status);
    throw error;
  }
}
