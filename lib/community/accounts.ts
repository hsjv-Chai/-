import { normalizeEmail } from "@/lib/email/model";
import {
  all,
  one,
  db,
  now,
  id,
  json,
  fail,
  body,
  str,
  settleRestrictions,
  type User,
} from "@/lib/server";

type Account = {
  id: string;
  username: string;
  nickname: string;
  role: string;
  created_at: number;
  registration_ip: string | null;
  account_status: string;
  restricted_room_id: string | null;
  ban_reason: string | null;
  banned_at: number | null;
  account_version: number;
};
const columns = `u.id,u.username,u.nickname,u.role,u.created_at,u.registration_ip,u.account_status,u.restricted_room_id,u.ban_reason,u.banned_at,u.account_version,u.email,u.email_canonical,u.email_verified_at,COALESCE((SELECT registered_count FROM email_quotas WHERE canonical=u.email_canonical),0) AS email_account_count`;
const alertColumns = `a.created_at AS suspicious_at,a.account_count AS suspicious_count,a.id AS alert_id`;
const latestAlert = `LEFT JOIN registration_alerts a ON a.id=(SELECT au.alert_id FROM registration_alert_users au JOIN registration_alerts x ON x.id=au.alert_id WHERE au.user_id=u.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1)`;
function pageOf(req: Request) {
  const params = new URL(req.url).searchParams,
    raw = params.get("page") || "1",
    page = Number(raw);
  if (
    !/^\d+$/.test(raw) ||
    !Number.isSafeInteger(page) ||
    page < 1 ||
    page > 1000000
  )
    fail("页码不正确");
  return { params, page, offset: (page - 1) * 20 };
}
export async function accountsAPI(
  req: Request,
  admin: User,
  userId?: string,
  section?: string,
) {
  if (req.method === "GET") {
    await settleRestrictions();
    const { params, page, offset } = pageOf(req);
    if (section === "audit" && userId) {
      if (!(await one("SELECT id FROM users WHERE id=?", userId)))
        fail("账号不存在", 404);
      const count = await one<{ count: number }>(
        "SELECT COUNT(*) count FROM account_audit WHERE user_id=?",
        userId,
      );
      const items = await all(
        `SELECT a.id,a.action,a.reason,a.created_at,u.username AS actor_username,u.nickname AS actor_nickname FROM account_audit a JOIN users u ON u.id=a.actor_id WHERE a.user_id=? ORDER BY a.created_at DESC,a.id DESC LIMIT 20 OFFSET ?`,
        userId,
        offset,
      );
      return json({ items, total: count!.count, page, pageSize: 20 });
    }
    if (section) fail("接口不存在", 404);
    if (userId) {
      const user = await one(
        `SELECT ${columns},${alertColumns} FROM users u ${latestAlert} WHERE u.id=?`,
        userId,
      );
      if (!user) fail("账号不存在", 404);
      return json({ user });
    }
    const query = (params.get("q") || "").trim();
    if (query.length > 100) fail("搜索内容过长");
    const filter = params.get("status") || "",
      alert = params.get("alert") || "";
    if (!["", "active", "restricted", "banned", "suspicious"].includes(filter))
      fail("账号筛选条件不正确");
    const emailFilter = params.get("email") || "";
    const clauses: string[] = [],
      values: unknown[] = [];
    if (emailFilter) {
      let canonical;
      try {
        canonical = normalizeEmail(emailFilter).canonical;
      } catch {
        fail("请填写有效邮箱");
      }
      clauses.push("u.email_canonical=?");
      values.push(canonical);
    }
    if (query) {
      clauses.push(
        "(u.username LIKE ? ESCAPE '\\' OR u.nickname LIKE ? ESCAPE '\\')",
      );
      const pattern = "%" + query.replace(/[\\%_]/g, "\\$&") + "%";
      values.push(pattern, pattern);
    }
    if (["active", "restricted", "banned"].includes(filter)) {
      clauses.push("u.account_status=?");
      values.push(filter);
    }
    if (filter === "suspicious")
      clauses.push(
        "EXISTS(SELECT 1 FROM registration_alert_users WHERE user_id=u.id)",
      );
    if (alert) {
      clauses.push(
        "EXISTS(SELECT 1 FROM registration_alert_users WHERE user_id=u.id AND alert_id=?)",
      );
      values.push(alert);
    }
    const where = clauses.length ? "WHERE " + clauses.join(" AND ") : "";
    const count = await one<{ count: number }>(
      `SELECT COUNT(*) count FROM users u ${where}`,
      ...values,
    );
    const items = await all(
      `SELECT ${columns},${alertColumns} FROM users u ${latestAlert} ${where} ORDER BY u.created_at DESC,u.id DESC LIMIT 20 OFFSET ?`,
      ...values,
      offset,
    );
    const registrationAlert = alert
      ? await one(
          "SELECT id,window_start,created_at,account_count FROM registration_alerts WHERE id=?",
          alert,
        )
      : null;
    return json({
      items,
      total: count!.count,
      page,
      pageSize: 20,
      registrationAlert,
    });
  }
  if (req.method !== "PATCH" || !userId || section) fail("接口不存在", 404);
  const b = await body(req);
  if (
    Object.keys(b).some((k) => !["action", "reason"].includes(k)) ||
    !["ban", "unban"].includes(b.action)
  )
    fail("无效的账号管理操作");
  const reason = str(b.reason, "操作原因", 1, 200);
  const target = await one<Account>(
    "SELECT id,role,account_status,account_version FROM users WHERE id=?",
    userId,
  );
  if (!target) fail("账号不存在", 404);
  if (userId === admin.id || target.role === "admin")
    fail("不能封禁或解封自己及其他管理员", 403);
  if (
    (b.action === "ban" && target.account_status !== "active") ||
    (b.action === "unban" && target.account_status === "active")
  )
    fail("账号状态已更新，请刷新后重试", 409);
  const time = now();
  const room = `SELECT r.id FROM game_rooms r WHERE r.updated_at>${time - 7 * 86400000} AND r.phase IN ('bidding','tribute','return','playing','roundEnd') AND EXISTS(SELECT 1 FROM json_each(r.state,'$.seats') s WHERE json_extract(s.value,'$.id')=users.id) ORDER BY r.updated_at DESC LIMIT 1`;
  const update =
    b.action === "ban"
      ? db()
          .prepare(
            `UPDATE users SET account_status=CASE WHEN EXISTS(${room}) THEN 'restricted' ELSE 'banned' END,restricted_room_id=(${room}),ban_reason=?,banned_at=?,account_version=account_version+1 WHERE id=? AND role='member' AND account_version=?`,
          )
          .bind(reason, time, userId, target.account_version)
      : db()
          .prepare(
            "UPDATE users SET account_status='active',restricted_room_id=NULL,ban_reason=NULL,banned_at=NULL,account_version=account_version+1 WHERE id=? AND role='member' AND account_version=?",
          )
          .bind(userId, target.account_version);
  const results = (await db().batch([
    update,
    db()
      .prepare(
        "INSERT INTO account_audit(id,actor_id,user_id,action,reason,created_at) SELECT ?,?,?,?,?,? WHERE changes()>0",
      )
      .bind(id(), admin.id, userId, b.action, reason, time),
    db()
      .prepare(
        "DELETE FROM sessions WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND account_status='banned')",
      )
      .bind(userId, userId),
  ])) as { meta: { changes: number } }[];
  if (!results[0].meta.changes) fail("账号状态已更新，请刷新后重试", 409);
  return json({
    user: await one(`SELECT ${columns} FROM users u WHERE u.id=?`, userId),
  });
}
