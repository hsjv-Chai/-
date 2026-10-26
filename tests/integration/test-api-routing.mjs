// Exercise the real HTTP entrypoint, including async errors from extracted handlers.
import assert from "node:assert/strict";
const base = process.env.MELON_TEST_URL || "http://127.0.0.1:5173";
const origin = new URL(base).origin;
if (!["127.0.0.1", "localhost"].includes(new URL(base).hostname))
  throw Error("Requires an isolated loopback server");
let checks = 0;
async function expect(
  path,
  method,
  status,
  { source = origin, body, headers = {} } = {},
) {
  const r = await fetch(base + "/api/" + path, {
    method,
    headers: { Origin: source, "Content-Type": "application/json", ...headers },
    body,
    redirect: "manual",
  });
  const data = await r.json();
  assert.equal(r.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
  checks++;
  assert.equal(r.headers.get("cache-control"), "no-store");
  checks++;
  if (status >= 400) {
    assert.equal(typeof data.error, "string");
    checks++;
  }
  return data;
}
for (const resource of [
  "auth/login",
  "posts",
  "uploads",
  "users/unknown",
  "admin",
  "categories",
  "stats",
  "games",
  "garden/check-in",
  "health",
  "unknown",
]) {
  await expect(resource, "POST", 403, {
    source: "https://untrusted.example",
    body: "{}",
  });
}
await expect("health", "POST", 403, {
  headers: { "Sec-Fetch-Site": "cross-site" },
});
for (const path of ["health", "categories", "stats", "posts", "auth/me"])
  await expect(path, "GET", 200);
for (const path of [
  "unknown",
  "auth/unknown",
  "users",
  "posts/not-a-post",
  "uploads/not-an-image",
])
  await expect(path, "GET", 404);
for (const path of [
  "categories",
  "stats",
  "health",
  "users/not-a-user",
  "auth/me",
])
  await expect(path, "POST", 404, { body: "{}" });
for (const path of ["posts", "uploads", "admin", "games", "garden/check-in"])
  await expect(path, "POST", 401, { body: "{}" });
for (const path of ["admin", "games", "garden"]) await expect(path, "GET", 401);
await expect("auth/login", "POST", 400, { body: "{invalid json" });
await expect("auth/register", "POST", 400, { body: "{}" });
assert.deepEqual(await expect("auth/me", "GET", 200), { user: null });
checks++;
console.log(
  `PASS: ${checks} API routing assertions; shared origin gate, awaited handler errors, JSON 404, input errors and guest isolation.`,
);
