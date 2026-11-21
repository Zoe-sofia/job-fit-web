# 部署与访问

本项目是纯静态站点：**没有构建步骤、没有环境变量、没有服务端**。部署 = 把仓库根目录原样托管。

## 当前入口

| 入口 | 地址 | 说明 |
|---|---|---|
| GitHub Pages | <https://zoe-sofia.github.io/job-fit-web/> | Source 为 **GitHub Actions**，push `main` 自动发布 |

只有一个入口，没有备用站。`*.github.io` 在国内部分网络下连通性不稳，这是已知限制；需要改善时按「二、自定义域名」把站点绑到自己的域名上，而不是再搭一个镜像站。

## 一、GitHub Pages

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
| 手机 4G 打不开 | 网络侧对 `*.github.io` 的连接问题，非代码问题 | 换个网络或稍后重试；长期方案是绑自定义域名 |

### 子路径验证（每次改动 `import.js` 后必做）

站点部署在 `/job-fit-web/` 而不是根路径，pdf.js 的 worker 由 `location.pathname` 推导：

```js
var base = location.pathname.replace(/[^/]*$/, '');   // → /job-fit-web/
GlobalWorkerOptions.workerSrc = base + 'assets/vendor/pdf.worker.min.js';
```

验证步骤：在**线上地址**（不是本地）上传一份 PDF，能正常提取文字即为通过。若失败，先看 Network 面板里 `pdf.worker.min.js` 的请求路径是不是 `/assets/...`（少了仓库名前缀）。

## 二、自定义域名

这是提升国内可访问性与观感的正路，也是唯一推荐的路：

1. 仓库 → Settings → Pages → Custom domain，填入域名。
2. DNS 处添加 `CNAME` 记录指向 `<用户名>.github.io`。
3. 勾选 `Enforce HTTPS`（证书签发通常几分钟到 24 小时）。

使用自定义域名时，`base` 推导依然成立（`location.pathname` 仍是 `/`），无需改代码。

域名解析到境外节点不需要备案；若改用境内 CDN 或对象存储承载，才需要 ICP 备案。这一点在决定换托管之前先算清楚。

## 三、部署后验收

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
- [ ] 手机 4G 实测能打开

## 四、不要做的事

- ❌ 不要加 `package.json` 和构建流程——现在的「零构建」是特性，不是欠债。
- ❌ 不要把 API Key 写进任何配置文件或 Actions Secret 供前端读取——前端代码是公开的。
- ❌ 不要为「统计有多少人用」引入第三方脚本，那会直接摧毁隐私承诺。
- ❌ 不要用 `git push --force` 覆盖 `main`，Pages 会重新部署旧版本。
- ❌ 不要再搭镜像站。多一个入口就多一份访问日志落在别处，与「简历不上传」的承诺相冲突；要提升可达性就绑自定义域名。
