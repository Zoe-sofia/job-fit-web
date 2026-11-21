# 部署与访问

本项目是纯静态站点：**没有构建步骤、没有环境变量、没有服务端**。部署 = 把仓库根目录原样托管。

## 当前入口

| 入口 | 地址 | 说明 |
|---|---|---|
| GitHub Pages | <https://zoe-sofia.github.io/job-fit-web/> | 唯一入口。Source 为 **GitHub Actions**，push `main` 自动发布 |

**目前没有国内备用入口。** 原因是多条备用线路都已评估并实测放弃：

| 曾考虑的方案 | 实测结果 |
|---|---|
| WorkBuddy 托管 | 域名带第三方产品名（`*.workbuddy.host`）；已下线 |
| EdgeOne Makers（直传 / Git 集成） | 两者都只给带 `eo_token` 的 `*.edgeone.cool` 预览域，裸链接 401、token 约 3 小时失效；`*.edgeone.app` 不存在。要公开只能绑自有域名 + 备案 |
| Cloudflare Pages / Vercel | 能拿到真正公开的 `*.pages.dev` / `*.vercel.app`，免备案；需要自有账号授权，暂未启用 |
| 自有域名 + 备案 | 决定走这条时一次做对，避免二次迁移 |

**EdgeOne Git 项目已建好**（推 `main` 会自动重新部署），等自有域名备案下来，在项目「域名管理」里绑定即可转正，无需重建。

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

**EdgeOne Makers（腾讯云）实测结论（2026-11，国内站）：不提供可公开访问的默认域名。**

无论走 Git 集成还是 CLI 直传，部署成功后拿到的都是 `<项目名>-<hash>.edgeone.cool`，**必须带 `eo_token` 参数访问**，裸链接返回 401，token 约 3 小时失效。`<项目名>.edgeone.app` 实测 404。要长期公开访问，只能在项目「域名管理」里绑定自有域名；而加速区域选「含中国大陆」时，该域名必须先完成 ICP 备案。

| 方案 | 免备案的公开地址 | 国内速度 | 备案 | 备注 |
|---|---|---|---|---|
| GitHub Pages | `<用户名>.github.io` | 不稳定 | 不需要 | 当前唯一入口 |
| EdgeOne Makers | **无**（只有带 token 的预览域） | 快（含大陆区域） | 绑自有域名必须备案 | 备案完成后才值得启用 |
| Cloudflare Pages | `<项目名>.pages.dev` | 一般 | 不需要 | 真要免备案备用入口，选这个 |
| Vercel / Netlify | `<项目名>.vercel.app` | 一般偏慢 | 不需要 | 同上，构建配置留空 |
| 对象存储 + CDN（COS/OSS） | 无（需自有域名） | 快 | **必须** | 追求稳定与可控 |

### 备案是硬约束

只要使用**中国大陆节点 + 自有域名**，就必须完成 ICP 备案，周期通常数天到数周，且需要主体资质。这会直接决定上线排期。

不想备案又想要备用入口，可行路径只有两条：

- 用**真正分配公开域名**的平台默认域名：`*.pages.dev`（Cloudflare Pages）、`*.vercel.app`（Vercel）、`*.netlify.app`（Netlify）。**EdgeOne Makers 不属于此类**。
- 主站留 GitHub Pages，暂不设备用入口。

### EdgeOne Makers 部署步骤（备齐已备案域名后再启用）

**方式 A：控制台连 Git，push 自动部署（推荐）**

1. 打开 <https://console.cloud.tencent.com/edgeone/pages>，开通 Pages（免费，不扣费）
2. 新建项目 → 关联 Git 仓库，授权后选 `Zoe-sofia/job-fit-web`，分支 `main`
3. 框架预设选「Other」，**根目录 `/`**，**输出目录填 `/`**（本项目零构建，产物就在根目录），**构建命令与安装命令全部留空**
4. **加速区域选「全球可用区（含中国大陆）」**——决定国内能否打开
5. 环境变量全部留空，点「开始部署」
6. 部署成功后先拿到带 `eo_token` 的预览域，仅供自测；随后在项目「域名管理」绑定已备案域名，才是对外地址

之后每次 push `main` 自动重新部署（已实测生效）。

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
