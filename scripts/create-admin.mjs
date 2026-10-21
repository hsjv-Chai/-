import { sql, sqlQuote } from "./local-db.mjs";
const username = process.argv[2];
if (!username || !/^[a-z0-9_]{3,24}$/.test(username)) {
  console.error("用法：npm run admin -- 已注册的用户名");
  process.exit(1);
}
const result = sql(
  `SELECT id FROM users WHERE username=${sqlQuote(username)}`,
  true,
);
if (!result.length) {
  console.error("请先在网页注册此账号，然后再授予管理员权限。");
  process.exit(1);
}
sql(`UPDATE users SET role='admin' WHERE username=${sqlQuote(username)}`);
console.log(`已将 ${username} 设为本地管理员。刷新网页即可。`);
