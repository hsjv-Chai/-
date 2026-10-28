// Test-only client: exercises the real verification endpoints using the private local outbox.
import { readFileSync } from "node:fs";
import { resolve, join } from "node:path";
let serial = 0;
/** @type {typeof globalThis.fetch} */
export const testFetch = async (input, init) => {
  if (process.env.MELON_EMAIL_TEST_OUTBOX !== "1")
    return globalThis.fetch(input, init);
  const url = new URL(
    typeof input === "string" || input instanceof URL ? input : input.url,
  );
  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    !resolve(process.env.MELON_DATA_DIR || "").includes("email-qa")
  )
    throw Error(
      "Verified test registration requires loopback and isolated email-qa storage",
    );
  if (
    !url.pathname.endsWith("/api/auth/register") ||
    init?.method !== "POST" ||
    typeof init.body !== "string"
  )
    return globalThis.fetch(input, init);
  let data;
  try {
    data = JSON.parse(init.body);
  } catch {
    return globalThis.fetch(input, init);
  }
  if (
    data.email ||
    !/^\w{3,24}$/.test(data.username || "") ||
    typeof data.password !== "string" ||
    data.password.length < 8 ||
    typeof data.nickname !== "string" ||
    data.nickname.trim().length < 2 ||
    data.nickname.trim().length > 20
  )
    return globalThis.fetch(input, init);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("X-Forwarded-For", "2001:db8:ff::" + (++serial).toString(16));
  const email = data.username.toLowerCase() + "@example.test";
  const issued = await globalThis.fetch(
    url.href.replace(/register$/, "email-code"),
    {
      method: "POST",
      headers,
      body: JSON.stringify({ email, username: data.username }),
    },
  );
  if (issued.status === 409) return globalThis.fetch(input, init); // Existing username is tested by the registration handler.
  if (!issued.ok)
    throw Error("Test email-code request failed: " + issued.status);
  const info = await issued.json();
  const message = JSON.parse(
    readFileSync(
      join(
        resolve(process.env.MELON_DATA_DIR),
        "uploads",
        "mail-preview-" + info.challengeId,
      ),
      "utf8",
    ),
  );
  return globalThis.fetch(input, {
    ...init,
    body: JSON.stringify({
      ...data,
      email,
      challengeId: info.challengeId,
      code: message.code,
    }),
  });
};
