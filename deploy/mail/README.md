# 注册验证码发信接入

使用阿里云邮件推送 HTTP API，应用存储继续沿用现有 SQLite 与图片目录。SMTP 密码不需要配置。生产启用前必须完成真实投递验收，不能以模拟发送或 API 接受请求代替收件箱确认。

## 控制台与 DNS

1. 开通邮件推送，选择实际发信区域；默认 `cn-hangzhou`。
2. 创建独立子域名，例如 `notify.example.com`。核对现有解析后，按控制台提供的值增加 DKIM、SPF、DMARC、MX；不要更改网站 A、根域名 MX 或名称服务器。
3. SPF 在同一名称下只能有一条，已有规则需合并。DKIM 必须复制本账户控制台公钥，不能使用其他账户的示例公钥。DMARC 报告接收地址需经域名持有人同意。
4. 验证发信域名，创建 `no-reply@notify.example.com`，类型选“触发邮件”。验证码不需要回信地址或营销追踪，本实现设置 `ClickTrace=0`。
5. 创建专用 RAM 程序身份，仅附加 [发送权限策略](send-only-policy.json)，不启用控制台登录。此 API 的资源范围为 `*`，允许使用账户下已授权的发信地址；应用配置固定发件人，但 RAM 策略不将权限进一步限定到单个邮箱。
6. 由账户持有人创建并私密保存专用 AccessKey。不要使用主账号密钥，不要将密钥、短信码或验证码写入聊天、Git、日志或截图。

网站域名尚未切换时也可以单独准备邮件解析。网站上线仍遵守所在地和接入商要求。公开文档只保留示例配置，实际域名、公钥、邮箱和控制台记录存入忽略目录。

## 私密配置

```sh
npm run mail:prepare
```

脚本在 `.sites-runtime/mail/production.env` 创建权限 `0600` 的文件并生成独立 HMAC 密钥；已存在时不会覆盖。按 [示例](mail.env.example) 私密填写发信地址、AccessKey ID 与 Secret。HMAC 密钥需至少三十二字符，与邮件密钥分开；轮换 HMAC 会使尚未验证的旧码失效，累计名额和旧账号不受影响。

将这些变量安全合并到服务器 Compose 的私密 `.env`，不要直接输出整个文件、执行带密钥的命令行或启用 shell tracing。`deploy/compose.yml` 已传递变量。不要在镜像构建参数或 `NEXT_PUBLIC_*` 中放入发信凭证。

Worker 使用运行时私密变量/绑定；不得将生产凭证写入公开的 Wrangler 配置。Node 与 Worker 都使用 WebCrypto 和 HTTPS，业务代码不依赖阿里云 Node SDK。

## 费用与限额

应用每日最多二百次发送尝试，失败也占额度。此限制只约束本应用，不是 RAM 或云账户预算上限；应同时关注邮件推送账户配额与费用。免费额度、资源包和按量费用以实际账户及阿里云当前计费规则为准。

## 启用检查

1. 完成类型检查、单元/接口回归和 Worker、Node 构建。
2. 先在隔离存储中配置真实发信，只向持有人明确指定的测试邮箱发一封验证码。确认实际收到、可正确验证、不可重放，不记录明文验证码。
3. 验证历史账户登录、封禁与权限、管理员邮箱查询、同源保护、私有响应及第十/十一个账户限制。
4. 检查没有进行中牌局，备份数据库、图片、镜像及 Compose/环境/Nginx 配置。保留当前部署前缀和来源设置，仅发布已验收的邮件版本。
5. 启用后检查注册失败提示与投递状态，不能在邮件故障时退回免验证注册。

## 故障回退

回退到旧应用之前，先在承载论坛的 Nginx server 中关闭注册与发码接口，包括多余路径尾部。以下正则需放在通用 API 代理正则之前，且不能被上层 `^~` location 绕过；依实际配置检查 `nginx -T` 的匹配顺序。

```nginx
location ~ ^/(?:melon/)?api/auth/(?:register|email-code)(?:/|$) {
    default_type application/json;
    add_header Cache-Control "no-store" always;
    add_header Retry-After 300 always;
    return 503 '{"error":"注册暂时维护中，请稍后再试"}';
}
```

先验证配置再重载；单文件挂载的 Nginx 配置必须原位写入以保留 inode。确认注册和发码均被阻断，再恢复旧镜像，保留登录与所有新增数据。不还原旧数据库、不删除邮箱名额或迁移、不恢复免验证注册。修复并验收邮件版本后，才解除维护规则。

官方资料：[SingleSendMail](https://help.aliyun.com/zh/direct-mail/api-dm-2015-11-23-singlesendmail)、[发信域名配置](https://help.aliyun.com/zh/direct-mail/user-guide/how-to-configure-sending-domain-names)、[计费说明](https://help.aliyun.com/zh/direct-mail/billing-methods/)。
