import { env } from "@/lib/storage-runtime";
import { aliyunSignedBody } from "./model";
export type VerificationMessage = {
  challengeId: string;
  email: string;
  username: string;
  code: string;
};
export function verificationSecret() {
  const secret = process.env.MELON_EMAIL_HMAC_SECRET || "";
  if (secret.length < 32) throw new Error("邮箱验证服务尚未配置，请稍后再试");
  if (
    process.env.NODE_ENV === "production" &&
    process.env.MELON_MAIL_PROVIDER === "preview"
  )
    throw new Error("生产环境不能使用模拟发信");
  return secret;
}
export function mailConfiguration() {
  const secret = verificationSecret();
  const provider = process.env.MELON_MAIL_PROVIDER;
  if (provider === "preview") {
    let local = false;
    try {
      local = ["localhost", "127.0.0.1", "[::1]"].includes(
        new URL(process.env.MELON_PUBLIC_ORIGIN || "").hostname,
      );
    } catch {}
    if (process.env.NODE_ENV === "production" || !local)
      throw new Error("生产环境不能使用模拟发信");
    return { secret, provider };
  }
  if (
    provider !== "aliyun" ||
    !process.env.MELON_MAIL_ACCESS_KEY_ID ||
    !process.env.MELON_MAIL_ACCESS_KEY_SECRET ||
    !process.env.MELON_MAIL_FROM
  )
    throw new Error("邮箱验证服务尚未配置，请稍后再试");
  const region = process.env.MELON_MAIL_REGION || "cn-hangzhou";
  if (!["cn-hangzhou", "ap-southeast-1", "ap-southeast-2"].includes(region))
    throw new Error("发信区域配置不正确");
  return { secret, provider, region };
}
export async function sendVerification(message: VerificationMessage) {
  const config = mailConfiguration();
  if (config.provider === "preview") {
    // Private development-only outbox; uploads API cannot read objects without upload rows.
    await env.BUCKET.put(
      "mail-preview-" + message.challengeId,
      new TextEncoder().encode(JSON.stringify(message)),
    );
    return;
  }
  const region = config.region!,
    endpoint =
      region === "cn-hangzhou"
        ? "dm.aliyuncs.com"
        : `dm.${region}.aliyuncs.com`;
  const params: Record<string, string> = {
    Action: "SingleSendMail",
    Version: "2015-11-23",
    Format: "JSON",
    RegionId: region,
    AccessKeyId: process.env.MELON_MAIL_ACCESS_KEY_ID!,
    SignatureMethod: "HMAC-SHA1",
    SignatureVersion: "1.0",
    SignatureNonce: crypto.randomUUID(),
    Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    AccountName: process.env.MELON_MAIL_FROM!,
    AddressType: "1",
    ReplyToAddress: "false",
    ToAddress: message.email,
    FromAlias: process.env.MELON_MAIL_FROM_NAME || "🍉 社区",
    Subject: "🍉 注册验证码",
    TextBody: `你的注册验证码是：${message.code}\n\n注册用户名：${message.username}\n验证码有效期为 10 分钟，请勿向他人透露。\n如果不是你本人操作，请忽略此邮件。`,
    ClickTrace: "0",
  };
  const response = await fetch("https://" + endpoint + "/", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: await aliyunSignedBody(
      params,
      process.env.MELON_MAIL_ACCESS_KEY_SECRET!,
    ),
    signal: AbortSignal.timeout(10000),
  });
  const result = (await response.json()) as {
    RequestId?: string;
    Code?: string;
  };
  if (!response.ok || result.Code || !result.RequestId)
    throw new Error("邮件服务未确认发送");
}
