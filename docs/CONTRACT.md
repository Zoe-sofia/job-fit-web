# 分析契约 `job-fit@1.3.0`

本文是 OfferFit 的**唯一口径来源**。`engine.js`（本地引擎）与 `app.js`（AI 模式结果归一化）都必须遵守它；改口径必须同时改本文与 UI 文案。

> 为什么要有这份文档：同一份简历，不同工具给出 68、72、85 三个分，用户无法判断该信谁。把规则写死并公开，分数才可复核、可争论、可改进。

> 1.3.0 相对 1.2.0 是**兼容性扩展**：评分、硬性条件、封顶语义完全不变，仅新增 `perspective`（分析视角）字段与视角化建议段落；旧字段一个未删。只按 1.2.0 读取结果的调用方可以忽略新字段。

---

## 一、输入

| 字段 | 必填 | 说明 |
|---|---|---|
| `job.title` | ✓ | 岗位名称，用于职业方向维度与头衔相似度 |
| `job.company` | ✓ | 公司名称，仅用于展示与风险提示 |
| `job.location` | ✓ | 工作地点，与期望城市比对 |
| `job.salary` | ✓ | 薪资范围，与期望月薪比对 |
| `job.description` | ✓ | JD 原文，要求项拆解的主要来源 |
| `job.companySize` `expRequirement` `eduRequirement` `skillsRequired` `benefits` `industry` `sourceUrl` `legalEntity` | — | 选填，显著提升判定精度 |
| `resume.text` | ✓ | 简历纯文本（PDF/DOCX 已在浏览器端提取） |
| `prefs.city` `prefs.salary` | — | 求职偏好，缺失时对应硬性条件为 `unknown` |
| `options.dims[]` | — | 维度权重与启用状态，默认见下 |
| `options.thresholds` | — | 结论阈值，默认 75 / 60 / 45，必须严格递减 |
| `options.hard{}` | — | 五项硬性条件的开关，默认全开 |
| `options.masked` | — | 简历是否已脱敏（仅影响 `meta`，不影响分数） |
| `perspective` | — | 分析视角：`candidate`（默认，求职者）/ `interviewer`（面试官）。**只影响建议的组织方式，绝不参与打分** |

## 二、四个维度与默认权重

| key | 名称 | 权重 | 衡量什么 |
|---|---|---|---|
| `technical` | 技术技能 | 30 | JD 要求项在简历中是否有**实践证据**（区分「实做 / 只有名词 / 缺失」） |
| `experience` | 经验匹配 | 25 | 年限、职责深度、行业与业务场景相似度 |
| `behavior` | 协作特质 | 15 | JD 中的软性要求（跨部门协作、主动性、抗压等）是否有对应证据 |
| `career` | 职业方向 | 30 | 岗位头衔与简历轨迹的相似度 + 行业一致性 |

权重可在界面上修改，但**总和应为 100**；不修改则使用上表默认值。

## 三、加权与归一化

```
已知权重 = Σ 权重(该维度分数 ≠ null)
加权分  = Σ(维度分 × 权重) / 已知权重
```

**按已知权重归一化**，而不是固定除以 100：当某维度因证据不足而无法评分时，它不进入分母，避免「没写软技能 → 总分被无端拉低」。代价是置信度会下降，见第六节。

若所有维度都无法评分（`已知权重 = 0`），`overallScore = 0`，`unconstrainedScore = null`。

## 四、硬性条件（闸门，不参与加权）

| key | 判定依据 | 可能状态 |
|---|---|---|
| `location` | 岗位地点 vs 期望城市 | pass / flag / fail / unknown |
| `experience` | 简历年限 vs JD 年限要求 | pass / flag / fail / unknown |
| `education` | 简历学历 vs JD 学历门槛 | pass / flag / fail / unknown |
| `skills` | 核心技能覆盖率 | pass / flag / fail / unknown |
| `salary` | 岗位薪资 vs 期望月薪 | pass / flag / fail / unknown |

- `pass` 满足；`flag` 存疑（需人工确认，如年限临界、地点跨城）；`fail` 明确不满足；`unknown` 信息不足。
- **只有 `fail` 触发封顶**，`flag` 与 `unknown` 不封顶（但会进入风险提示）。

## 五、封顶规则（核心）

```
匹配度 overallScore = min(round(加权分), 44)    当任一硬性条件 fail
匹配度 overallScore = round(加权分)             否则
```

三条必须同时成立：

1. 上限为 **44**，不是 0——简历可能在其他维度很强，不该被判「毫无希望」。
2. **只降不升**：加权分 27 时保持 27，不会被抬到 44。这一点极易写错（早期版本曾用固定值替换，导致低分被抬高）。
3. **不采信模型自报的分数**：AI 模式下模型可能返回 `overallScore`，一律丢弃，用本地维度分重算封顶。

### 副评分 `unconstrainedScore`

同一套全维度加权，**不施加封顶**：

```
unconstrainedScore = round(加权分)
```

用途：回答「如果不卡硬门槛，实际水平如何」。两个分数并列展示，让用户看到「能力够但门槛不符」与「能力本身就不够」的区别。

`scoreMeta` 记录本次计算的全部中间量：

```json
{
  "contract": "job-fit@1.3.0",
  "capMode": "min",
  "hardCapApplied": true,
  "hardCap": 44,
  "hardFail": ["工作地点"],
  "unconstrained": {
    "basis": "all-dims",
    "score": 58,
    "includedKeys": ["technical", "experience", "behavior", "career"],
    "includedLabels": ["技术技能", "经验匹配", "协作特质", "职业方向"],
    "excludedKeys": [],
    "effectiveWeight": 100
  }
}
```

## 六、结论与置信度

| 分数区间 | `verdict` | 中文 |
|---|---|---|
| ≥ 75 | `strong` | 强匹配 |
| ≥ 60 | `good` | 良好 |
| ≥ 45 | `moderate` | 一般 |
| ≥ `max(30, 一般阈值 − 15)` | `weak` | 偏弱 |
| < 上述值 | `poor` | 不匹配 |

默认阈值下即 30。该下限随「一般」阈值联动，且不会低于 30。

```
confidence = round(Σ 已知权重)    // 0–100
```

**置信度不是「AI 有多自信」，而是「有多少权重是有证据支撑的」**。四个维度全部可评分 → 100；只有技术维度有证据 → 30。看到低置信度时，正确反应是「简历信息不足」，而不是「工具不准」。

## 七、输出结构

```json
{
  "overallScore": 44,
  "unconstrainedScore": 58,
  "scoreMeta": { "...": "见上" },
  "confidence": 100,
  "verdict": "moderate",
  "recommendation": "一句话结论",
  "summary": "结构化摘要，含封顶说明",
  "dimensions": [{ "key": "technical", "label": "技术技能", "score": 62, "weight": 30, "note": "…", "evidence": ["…"] }],
  "hardConstraints": [{ "key": "location", "label": "工作地点", "status": "fail", "detail": "…" }],
  "strengths": ["…"],
  "gaps": ["…"],
  "risks": ["…"],
  "fitPoints": [{ "req": "JD 要求", "ev": "简历证据" }],
  "skills": [{ "name": "Vue", "status": "matched|partial|missing", "evidence": "…" }],
  "advice": ["…"],
  "perspective": {
    "role": "candidate",
    "roleLabel": "求职者视角",
    "badge": { "tone": "good", "label": "补强后投递" },
    "headline": "一句话定位（含核心矛盾）",
    "summary": "2–3 句依据说明",
    "sections": [
      { "key": "advantages", "title": "匹配优势", "hint": "…", "items": [{ "text": "…", "tag": "强证据", "note": "…" }] }
    ]
  },
  "meta": { "skillCoverage": 62, "years": 3, "edu": "本科", "engine": "local", "masked": true, "perspective": "candidate", "thresholds": {} },
  "evidence": ["…"],
  "generatedAt": "2026-11-21T09:00:00.000Z",
  "skillVersion": "job-fit@1.3.0"
}
```

AI 模式额外要求：模型只负责 `summary` / `strengths` / `gaps` / `risks` / `advice` / `perspective` 里的**措辞**，维度分、封顶与 `perspective.badge` 由本地重算或本地规则给定（见第八节）。模型返回的 JSON 会经过括号配平切片、弯引号修正、尾随逗号清理、截断补全等修复流程，失败则追加严格提示重试一次。

## 八、分析视角 `perspective`

同一份简历、同一套分数，按使用者身份组织结论。**视角是输出层的重排，不是第二套评分**：

| 视角 | `role` | 决策问题 | 固定小节（`sections[].key`，顺序不可变） |
|---|---|---|---|
| 求职者 | `candidate` | 投不投、怎么改简历、面试怎么准备 | `advantages` 匹配优势 → `gaps` 能力差距 → `resume` 简历优化方向 → `apply` 投递建议 → `prep` 面试准备建议 |
| 面试官 | `interviewer` | 要不要面、证据够不够、风险在哪、问什么 | `evidence` 岗位匹配证据 → `risks` 风险点 → `questions` 面试提问建议 |

结构与字段：

| 字段 | 说明 |
|---|---|
| `role` / `roleLabel` | 视角标识与中文名；缺省按 `candidate` 处理 |
| `badge.tone` / `badge.label` | 一句话档位。求职者：优先投递 / 补强后投递 / 谨慎投递 / 暂缓投递 / 先解决门槛；面试官：推荐进入面试 / 可以进入面试 / 需重点验证 / 不建议推进 / 门槛不符，慎推进 |
| `headline` | 一句话点明核心矛盾或结论 |
| `summary` | 2–3 句依据，必须与分数、硬性条件一致 |
| `sections[].items[]` | `text` 结论或问题，`tag` 短标签，`note` 观察点 / 可执行动作 |

硬约束：

1. **分数不变**：`overallScore`、`unconstrainedScore`、`dimensions`、`hardConstraints`、`verdict`、`confidence` 与视角完全无关。同一输入切换视角，上述字段必须逐一相等。
2. **证据不新增**：视角不能引入简历或 JD 之外的事实。
3. **不越权**：求职者视角不承诺录用概率、不评判性格；面试官视角不做录用决定、不给薪资谈判建议。
4. **小节 key 固定**，标题用中文；`items` 建议 ≤ 6 条，`tag` ≤ 6 字。
5. `perspective` 缺失时视为 1.2.0 旧结果：校验不报错，前端隐藏视角面板，其余字段照常使用。

`recommendation` 也随视角换措辞（面试官读「建议进入面试 / 谨慎推进」，求职者读「建议优先投递 / 暂不建议投递」），但档位由同一个 `verdict` 与硬性条件推出，不额外打分。

## 九、分析记录 `offerfit.records/1`

记录是 `result` 的**容器**，不属于评分口径，但属于输出契约的一部分：写进记录的字段必须和当次结果一致，不能事后重算。实现在 `assets/js/store.js`（纯函数，无 DOM / 无存储）。

单条记录结构：

| 字段 | 说明 |
|---|---|
| `id` | 记录唯一标识，格式 `r<时间36进制>-<随机>`；去重只看它 |
| `schema` | 固定 `offerfit.records/1` |
| `at` / `atMs` | 生成时间（ISO 与毫秒），列表排序依据 |
| `role` / `roleLabel` / `badge` | 分析视角及当次档位文案，来自 `result.perspective` |
| `jobKey` | 岗位归组键：`公司 + \u0001 + 岗位名`，忽略空白、大小写与全半角括号 |
| `jobTitle` / `company` | 便于列表直接渲染，与 `job` 冗余但只读 |
| `job` | 岗位快照，含 13 个字段与 **JD 原文** |
| `prefs` | 当次求职偏好（城市、薪资） |
| `result` | 完整分析结果，字段与第七节一致（含 `perspective`） |
| `meta` | `source`（`local` / `repo`）、`engine`、`model`、`contract` |

硬约束：

1. **追加式**：每次分析、每次切换视角都新增一条；只有 `id` 相同才视为同一条。**禁止按岗位覆盖、合并或只保留最新一条**。
2. **自包含**：每条记录必须能独立阅读，不得依赖「上一条」或「最新一次」补齐岗位、视角或结果。
3. **完整性**：`job.description`（JD 原文）、`result.dimensions`、`result.hardConstraints`、`result.perspective.sections` 必须与当次输出一致；不含简历原文，证据已脱敏。
4. **序号是算出来的**：列表里的「第 N 次分析」按同 `jobKey` 记录的 `atMs` 正序计算，不写入记录本身，避免删除后序号错乱。
5. **导出可回读**：`toStore()` 产出 `{schema, updatedAt, count, records, deleted}`，`parseStore()` 必须能原样读回；`deleted` 是删除墓碑，用于阻止仓库基线把已删记录带回来。
6. 存储：一个键 `offerfit.records.v1`，开启保存写 `localStorage`，关闭只写 `sessionStorage`；两处按 `id` 合并，不互相覆盖。上限 200 条，超出只丢最旧。

## 十、改动这份契约

任何影响分数的改动，PR 必须包含：

1. 本文件的同步修改
2. 至少一组「同一输入的前后分数对比」
3. UI 文案同步（配置区说明、页脚、报告导出）
4. 若改动 `perspective` 结构，需同步 `skills/job-fit` 与页面渲染
5. 若改动记录结构，需同步 `assets/js/store.js`、`tests/records.test.mjs` 与 `data/records.json` 的 `schema`

版本号递增规则：口径不兼容（分数含义变化）→ 升 minor；仅新增输出字段或措辞修复 → 升 patch；新增字段但不改分数语义时，需在文首写明「兼容性扩展」。当前版本 `1.3.0`。
