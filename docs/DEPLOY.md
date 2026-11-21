# 部署与访问

本项目是纯静态站点：**没有构建步骤、没有环境变量、没有服务端**。部署 = 把仓库根目录原样托管。

## 当前入口

| 入口 | 地址 | 说明 |
|---|---|---|
| GitHub Pages | <https://zoe-sofia.github.io/job-fit-web/> | 唯一入口。Source 为 **GitHub Actions**，push `main` 自动发布 |

**目前没有国内备用入口。** 原因是多条备用线路都已评估并放弃：

| 曾考虑的方案 | 放弃原因 |
|---|---|
| WorkBuddy 托管 | 域名带第三方产品名（`*.workbuddy.host`），观感像内部工具；已于 2026-11 下线 |
| EdgeOne Makers 直传 | CLI 只给带 `eo_token` 的临时预览域（3 小时过期），无法作为长期公开链接 |
| EdgeOne Makers 连 Git | 可拿到 `<项目名>.edgeone.app`，但需控制台手动建项目；等确定长期维护时再启用，步骤见第三节 |
| 自有域名 + 备案 | 决定走这条时一次做对，避免二次迁移 |

因此 `*.github.io` 在国内不稳时，当前没有兜底入口——这是已知且已接受的取舍。

## 一、GitHub Pages（当前主站）

仓库已带部署工作流 `.github/workflows/pages.yml`，本仓库已把 **Settings → Pages → Build and deployment → Source** 设为 **`GitHub Actions`**。

之后每次 push 到 `main` 都会自动构建并发布，无需再点。**fork 或新建仓库时要自己再设一次这个开关**（新仓库默认未启用 Pages），设好后在 Actions 里手动跑一次 `Deploy to GitHub Pages` 即可。

访问地址：`https://<用户名>.github.io/<仓库名>/`

> ⚠️ 不要选 `Deploy from a branch`：本仓库的发布目录经过工作流处理（排除 `.git`），选了分支模式会和 `deploy-pages` 冲突。

首次部署常见坑：

| 现象 | 原因 | 处理 |
|---|---|---|
| 404 | 分支或目录选错，或还没跑完 | 看 Actions 里 `pages build and deployment` 是否成功 |
| 页面无样式 | 开启了 Jekyll 处理 | 仓库已含 `.nojekyll`，确认它被提交了 |
| **PDF 解析失败，DOCX 正常** | worker 路径在子路径下算错 | 见下方「子路径验证」 |
| 手机 4G 打不开 | 网络问题，非代码问题 | 用备用入口，见第三节 |

### 子路径验证（每次改动 `import.js` 后必做）

站点部署在 `/job-fit-web/` 而不是根路径，pdf.js 的 worker 由 `location.pathname` 推导：

```js
var base = location.pathname.replace(/[^/]*$/, '');   // → /job-fit-web/
GlobalWorkerOptions.workerSrc = base + 'assets/vendor/pdf.worker.min.js';
```

验证步骤：在**线上地址**（不是本地）上传一份 PDF，能正常提取文字即为通过。若失败，先看 Network 面板里 `pdf.worker.min.js` 的请求路径是不是 `/assets/...`（少了仓库名前缀）。

## 二、自定义域名

1. 仓库 → Settings → Pages → Custom domain，填入域名。
2. DNS 处添加 `CNAME` 记录指向 `<用户名>.github.io`。
3. 勾选 `Enforce HTTPS`（证书签发通常几分钟到 24 小时）。

使用自定义域名时，`base` 推导依然成立（`location.pathname` 仍是 `/`），无需改代码。

## 三、国内访问

`*.github.io` 在国内的连通性不稳定，而本项目的用户正是中文求职者。**建议至少准备一个备用入口。**

**将来若需要备用入口，首选 EdgeOne Makers（腾讯云）**：默认域名形如 `<项目名>.edgeone.app`，不带任何第三方产品名、默认域名无需备案，选对加速区域后国内速度明显好于 GitHub Pages，个人项目免费额度够用。**当前未启用**，步骤保留在下方，决定启用时照做即可。

| 方案 | 默认域名 | 国内速度 | 备案 | 备注 |
|---|---|---|---|---|
| GitHub Pages | `<用户名>.github.io` | 不稳定 | 不需要 | 主站，与仓库同源、零配置 |
| **EdgeOne Makers** | `<项目名>.edgeone.app` | 快（须选含大陆区域） | 默认域名不需要 | 启用时的首选 |
| Cloudflare Pages | `<项目名>.pages.dev` | 一般 | 不需要 | 连 Git 自动部署，配合自有域名最省事 |
| Vercel / Netlify | `<项目名>.vercel.app` | 一般偏慢 | 不需要 | 同上，构建配置留空即可 |
| 对象存储 + CDN（COS/OSS） | 自有域名 | 快 | **必须** | 追求稳定与可控 |

### 备案是硬约束

只要使用**中国大陆节点 + 自有域名**，就必须完成 ICP 备案，周期通常数天到数周，且需要主体资质。这会直接决定上线排期。

不想备案的可行路径：

- 用平台分配的默认域名（`*.edgeone.app`、`*.pages.dev` 等）——通常无需备案，但可能被限速。
- 主站留 GitHub Pages，国内用户走默认域名做的备用入口。

### EdgeOne Makers 部署步骤（启用备用入口时照做）

**方式 A：控制台连 Git，push 自动部署（推荐）**

1. 打开 <https://console.cloud.tencent.com/edgeone/pages>，开通 Pages（免费，不扣费）
2. 新建项目 → 关联 Git 仓库，授权后选 `Zoe-sofia/job-fit-web`，分支 `main`
3. 框架预设选「静态站点 / 其他」，**构建命令留空**，**输出目录填 `/`**（本项目零构建，根目录即产物）
4. **加速区域选「中国大陆」或「全球（含中国大陆）」**——这一项直接决定国内能否打开，选错了国内会返回 401
5. 部署，拿到 `https://<项目名>.edgeone.app`

之后每次 push `main` 自动重新部署。

**方式 B：CLI 直接上传（不连仓库，适合一次性的临时预览）**

```bash
npm i -g edgeone
edgeone login --site china     # 浏览器授权一次
edgeone makers deploy .        # 在仓库根目录执行
```

CLI 部署拿到的是临时预览域名，**长期使用请走方式 A**（临时域名可能失效）。

**已知坑**

| 现象 | 原因 | 处理 |
|---|---|---|
| 国内打开 401 | 加速区域选了「全球可用区（不含中国大陆）」 | 改成含中国大陆的区域后重新部署 |
| 改完不生效 | 边缘缓存 | 在部署记录里手动「重新部署」 |
| 绑定自有域名报错 | 域名已在其它腾讯云加速产品中 | 先从 CDN / 旧 EdgeOne 删除该域名 |

### 备选：Cloudflare Pages

1. Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
2. 选本仓库，分支 `main`
3. **Build command 留空**，**Build output directory 填 `/`**
4. Deploy，拿到 `https://<项目名>.pages.dev`

其它静态托管同理：构建命令留空、输出目录为根。

## 四、部署后验收

按顺序过一遍，任何一条不通过都不要宣布上线：

- [ ] 首屏无 404、控制台 0 报错（强刷 Ctrl+F5 / Cmd+Shift+R）
- [ ] 粘贴文本 → 本地引擎 → 出分
- [ ] **上传 PDF → 能提取文字**（子路径最容易坏的一环）
- [ ] 上传 DOCX / TXT → 正常
- [ ] 明暗主题切换正常，刷新后记住选择
- [ ] 390 / 768 / 1440 三个宽度无横向滚动
- [ ] 断网后本地引擎仍可用（离线是核心承诺）
- [ ] AI 模式：填入 https 接口 → 测试连接 → 分析成功；填 http 接口 → 有明确错误提示
- [ ] Network 面板：默认状态下只有本站静态资源，无第三方请求
- [ ] 手机 4G 实测能打开（含备用入口）

## 五、不要做的事

- ❌ 不要加 `package.json` 和构建流程——现在的「零构建」是特性，不是欠债。
- ❌ 不要把 API Key 写进任何配置文件或 Actions Secret 供前端读取——前端代码是公开的。
- ❌ 不要为「统计有多少人用」引入第三方脚本，那会直接摧毁隐私承诺。
- ❌ 不要用 `git push --force` 覆盖 `main`，Pages 会重新部署旧版本。
