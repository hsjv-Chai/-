import {
  one,
  run,
  now,
  id,
  json,
  fail,
  getUser,
  body,
  str,
  sha,
  passwordHash,
  cookie,
} from "@/lib/server";
import { issueEmailCode, registerVerified } from "@/lib/email/service";

export async function authAPI(
  req: Request,
  key?: string,
): Promise<Response | undefined> {
  const method = req.method;
  if (method === "POST" && key === "email-code")
    return issueEmailCode(req, await body(req));

  if (method === "GET" && key === "me")
    return json({ user: await getUser(req) });
  if (method === "POST" && key === "logout") {
    const token = req.headers
      .get("cookie")
      ?.match(/(?:^|;\s*)melon_session=([^;]+)/)?.[1];
    if (token)
      await run("DELETE FROM sessions WHERE token=?", await sha(token));
    return json({ ok: true }, 200, { "Set-Cookie": cookie("", req, 0) });
  }
  if (method === "POST" && (key === "register" || key === "login")) {
    const b = await body(req),
      username = str(b.username, "用户名", 3, 24).toLowerCase(),
      password = str(b.password, "密码", 8, 128);
    if (!/^[a-z0-9_]+$/.test(username))
      fail("用户名只能包含英文字母、数字和下划线");
    const throttle = await one<{ count: number; expires: number }>(
      "SELECT * FROM auth_attempts WHERE key=?",
      username,
    );
    if (throttle && throttle.expires > now() && throttle.count >= 10)
      fail("尝试过于频繁，请 15 分钟后再试", 429);
    await run(
      "INSERT INTO auth_attempts(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=CASE WHEN expires<? THEN 1 ELSE count+1 END,expires=CASE WHEN expires<? THEN excluded.expires ELSE expires END",
      username,
      now() + 900000,
      now(),
      now(),
    );
    let user = await one<{
      id: string;
      password: string;
      account_status?: string;
    }>("SELECT * FROM users WHERE username=?", username);
    if (key === "register") {
      return registerVerified(req, b);
    } else {
      const hash = await passwordHash(
        password,
        user?.password.split(":")[0] || "invalid-user-salt",
      );
      if (!user || hash !== user.password) fail("用户名或密码不正确", 401);
      if (user.account_status !== "active")
        fail("账号已封禁或受限，请联系管理员", 403);
    }
    await run("DELETE FROM auth_attempts WHERE key=?", username);
    const token = id() + id();
    const session = await run(
      "INSERT INTO sessions(token,user_id,expires) SELECT ?,id,? FROM users WHERE id=? AND account_status='active'",
      await sha(token),
      now() + 604800000,
      user!.id,
    );
    if (!session.meta.changes) fail("账号已封禁或受限，请联系管理员", 403);
    return json({ ok: true }, 200, { "Set-Cookie": cookie(token, req) });
  }
}
