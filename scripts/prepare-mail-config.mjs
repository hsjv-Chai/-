// Prepare credentials locally without printing them or creating cloud resources.
import { mkdirSync, existsSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { randomBytes } from "node:crypto";
const destination = resolve(".sites-runtime/mail/production.env");
mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
if (existsSync(destination)) {
  console.log("Existing private mail configuration preserved: " + destination);
  process.exit(0);
}
writeFileSync(
  destination,
  [
    "# Private runtime configuration. Never paste its contents into chat or commit it.",
    "MELON_MAIL_PROVIDER=aliyun",
    "MELON_MAIL_REGION=cn-hangzhou",
    "MELON_MAIL_FROM=",
    "MELON_MAIL_FROM_NAME=🍉 社区",
    "MELON_MAIL_ACCESS_KEY_ID=",
    "MELON_MAIL_ACCESS_KEY_SECRET=",
    "MELON_EMAIL_HMAC_SECRET=" + randomBytes(32).toString("base64url"),
    "",
  ].join("\n"),
  { mode: 0o600, flag: "wx" },
);
console.log("Private mail configuration prepared: " + destination);
