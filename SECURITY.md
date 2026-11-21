# 安全说明

## 本仓库的安全边界

OfferFit **没有后端、没有数据库、没有账号体系**。因此不存在「服务器被拖库」这类风险，攻击面基本收敛为：静态托管 + 浏览器端 JS。

**唯一需要守住的纪律：仓库里永远不出现任何真实 API Key。**

前端代码是公开可读的。任何写进源码、`localStorage` 默认值、示例配置里的密钥，等同于公开发布。AI 模式刻意采用 BYOK（Bring Your Own Key）——由访问者自己填，只存内存。

## 已实施的前端防护

| 措施 | 位置 |
|---|---|
| 严格 CSP：`default-src 'self'`，禁止内联脚本与外部脚本 | `index.html` `<meta http-equiv>` |
| API Key 仅存闭包变量，`autocomplete=new-password`、粘贴事件单独处理 | `assets/js/app.js` |
| 所有渲染路径统一 HTML 转义，避免简历内容造成 XSS | `assets/js/privacy.js` |
| PDF 解析关闭 `isEvalSupported` | `assets/js/import.js` |
| `referrer: no-referrer`，避免导出/跳转泄露来源 | `index.html` |
| 本地服务限制 `127.0.0.1` 绑定 + 目录穿越防护 | `serve.js` |

## 请注意

- **CSP 中的 `connect-src *` 是有意放宽的**：AI 模式需要访问用户任意填写的接口地址。若你只使用本地引擎，可自行收紧为 `connect-src 'self'`。
- **不要在本项目的 Issue 中粘贴真实简历、真实 API Key 或含个人信息的面经**。复现问题时请用脱敏数据。
- AI 模式下的数据发往**用户自选**的第三方接口，其安全性由该服务商决定。

## 报告漏洞

发现 XSS、脱敏绕过、密钥泄漏等问题，请**不要**开公开 Issue。

- 首选：仓库 **Security → Report a vulnerability**（私有披露）
- 或邮件联系仓库所有者，标题注明 `[OfferFit Security]`

请在报告中说明：受影响版本（commit）、复现步骤、影响范围。一般会在 7 天内回复。

## 支持范围

仅维护默认分支的最新提交。这是个人项目，不提供 SLA。
