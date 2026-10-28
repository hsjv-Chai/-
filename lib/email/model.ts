export const CODE_LIFETIME = 10 * 60 * 1000;
export const MAX_EMAIL_ACCOUNTS = 10;
export function normalizeEmail(value: unknown) {
  if (typeof value !== "string") throw new Error("请填写有效邮箱");
  const address = value.trim().toLowerCase();
  if (
    address.length > 254 ||
    !/^([a-z0-9!#$%&'*+\-/=?^_`{|}~]+(?:\.[a-z0-9!#$%&'*+\-/=?^_`{|}~]+)*)@([a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(
      address,
    ) ||
    address.split("@")[0].length > 64
  )
    throw new Error("请填写有效邮箱");
  const [local, domain] = address.split("@");
  const canonical =
    domain === "gmail.com" || domain === "googlemail.com"
      ? local.split("+")[0].replaceAll(".", "") + "@gmail.com"
      : address;
  if (canonical.startsWith("@")) throw new Error("请填写有效邮箱");
  return { address, canonical };
}
export function randomCode() {
  const values = new Uint32Array(1);
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= 4294000000);
  return String(values[0] % 1000000).padStart(6, "0");
}
export async function hmac(
  secret: string,
  message: string,
  algorithm = "SHA-256",
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: algorithm },
    false,
    ["sign"],
  );
  return new Uint8Array(
    await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message)),
  );
}
export async function codeDigest(
  secret: string,
  challengeId: string,
  canonical: string,
  username: string,
  code: string,
) {
  return [
    ...(await hmac(
      secret,
      JSON.stringify(["register", challengeId, canonical, username, code]),
    )),
  ]
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
export function equalDigest(a: string, b: string) {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++)
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
const encode = (value: string) =>
  encodeURIComponent(value).replace(
    /[!'()*]/g,
    (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase(),
  );
export async function aliyunSignedBody(
  params: Record<string, string>,
  secret: string,
) {
  const query = Object.keys(params)
    .sort()
    .map((k) => encode(k) + "=" + encode(params[k]))
    .join("&");
  const signature = await hmac(
    secret + "&",
    "POST&%2F&" + encode(query),
    "SHA-1",
  );
  return new URLSearchParams({
    ...params,
    Signature: btoa(String.fromCharCode(...signature)),
  }).toString();
}
