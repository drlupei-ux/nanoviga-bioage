# Clinical Conversion Report Email System — 设计 Spec

- **日期**：2026-06-08
- **状态**：已通过设计评审，待 spec 复核 → 实施计划
- **范围**：重构 BioAge Compass 邮件系统（`generateReport` L1 + `analyzeCBA` CBA），为后续 Daily Digest 提供共享邮件模板
- **关联**：Lead Ops 拆解中的子项目 #1（见对话）；Daily Digest（#4）复用本模板

---

## 1. 背景与问题

当前邮件能发送，但存在三个问题：
1. 报告以 Markdown 文本经 `text/plain` 发送，客户端原样显示 `###`、`**`，不专业。
2. 报告结构学术化，读者无法 30 秒抓住重点。
3. 邮件未承担微信咨询与 CBA 转化功能。

确认根因：两个云函数 SMTP 均为 `Content-Type: text/plain`，而 DeepSeek 报告输出 Markdown（提示词要求 `**风险信号**` 等加粗标题）→ 符号原样泄漏。

## 2. 目标（非"发送报告"，而是转化漏斗）

测试结果 → 理解风险 → 建立信任 → 添加微信 → 进入 CBA 评估。
邮件须兼顾：医学专业性 · 高可读性 · 转化能力 · 品牌感。
风格：高端体检中心 / 功能医学机构 / Mayo Clinic。避免：AI 味、长篇大论、大段风险描述、Markdown 原样输出、营销页风格。

## 3. 送达模型（已确认：医生中转）

- 收件人**不变**：`To = ADMIN_EMAIL`（陆大夫 163 邮箱，From=To）。**不改 L1/CBA 流程，不收集客户邮箱。**
- 邮件**正文面向客户**：陆大夫收到后可转发 / 截图 / 微信发给客户。
- 顶部加一条**可分离的「内部条」**（客户联系/提交时间/编号，灰字，「转发前请删除」），与品牌 Header 间有分隔线——从 Header 往下截图即为干净的客户版。

## 4. 核心架构决策

**不采用"模型出 Markdown → 转 HTML"的脆弱路径。** 改为：

> **模型输出结构化 JSON → 云函数用确定性模板渲染 HTML。**

收益：Markdown 原文永不泄漏；排版 100% 一致；转化文案（微信/CBA）与数据卡（身体年龄）做成**固定模板**不交模型；模型只产出 risks/mechanism/roadmap/rating，缩小幻觉面。`mdToInlineHtml()` 仅用于字段内轻量强调与 JSON 解析失败时兜底（仍不发原始 Markdown）。

## 5. 邮件结构（8 区）

| 区块 | 内容 | 数据来源 |
|---|---|---|
| [0] 内部条 | 「内部·转发前删除」客户联系 / 提交时间 / 编号 | 现有 contact/time/code |
| [Header] | BioAge Compass 字标 · "身体年龄风险评估报告" · 生成日期 · Assessment Code | 静态 + code/date |
| [S1] 身体年龄总览 | 大号 BioAge vs 实际年龄 + 差值 · 老化速度 · 同龄人百分位 · **综合评级徽章** | 确定性计算 |
| [S2] 三大关键风险 | ①②③ 风险名 + 一句话，**严格 3 条** | 模型 JSON `risks[3]` |
| [S3] 风险形成机制 | "为什么会这样？" 原因 ↓ 生理机制 ↓ 结果（1–2 条核心链，短） | 模型 JSON `mechanism` |
| [S4] 行动路线图 | 7天 / 30天 / 90天，每段 2–4 条具体可执行 | 模型 JSON `roadmap` |
| [S5] 下一步（转化） | "下一步如何进一步降低身体年龄？" + 3×✓ 价值点 + CBA 邀请 + 微信号+备注编号 + **陆大夫个人微信 QR** | 静态模板 + code |
| [Footer] | Assessment Code · 免责声明 · BioAge Compass · 日期 | 静态 |

### 5.1 综合评级（确定性，已确认阈值）
- `优秀` = ageDiff ≥ 3 **且** score ≥ 70 → 色 #2E9C82
- `高风险` = ageDiff ≤ −3 **或** score < 50 → 色 #C0453B
- 其余 `需关注` → 色 #C9831F
（ageDiff = 实际年龄 − 身体年龄）

### 5.2 S5 转化卡
- 3×✓：哪些指标真正推动身体年龄升高 / 哪个器官衰老最快 / 如何制定个体化逆龄方案。
- 邀请语气（临床、非促销）：建议完成 CBA 深度评估并与陆医生进一步交流。
- 微信信息：微信号 `Charlie20850` + "添加请备注编号 {code}" + **陆大夫个人微信 QR**（`https://nanoviga.com/wechat-qr.png`）。图片被拦时文字兜底。
- **CBA 邮件变体**：客户已做 CBA，转化区改为"随访 + 个体化逆龄方案"，不再推 CBA。

## 6. 视觉规范（邮件兼容）

- 单列 ≤ **600px**，移动优先。
- **全内联 CSS + 表格布局**（163/QQ/Outlook 兼容，禁用 flex/grid）。
- 字体栈：`-apple-system,"PingFang SC","Microsoft YaHei",sans-serif`。
- 纯色无背景图（图片默认被拦，均有文字兜底）。
- 调色板（上线前与 `tailwind.config.ts` 的 `clinical.*` 对齐）：bg `#F4F6F8` / 卡片 `#FFFFFF` / navy `#16263F` / jade `#2E9C82` / ink `#1F2937` / muted `#6B7280` / border `#E5E7EB`。
- 总 HTML < 100KB（避免 Gmail 102KB 截断）。

## 7. HTML 模板结构

```
<html><body bg=#F4F6F8>
 └ <table 100%> 居中外层
    └ <table width=600 #fff>           ← 600px 卡片
       ├ [0] InternalStrip  ──分隔线──   （仅医生）
       ├ Header   字标/标题/日期/code    (navy)
       ├ S1 HeroCard   大号BioAge·指标行·评级徽章
       ├ S2 RiskList   ①②③ 名称+一句话
       ├ S3 Mechanism  原因↓机制↓结果
       ├ S4 Roadmap    [7天][30天][90天] 阶段卡+✓
       ├ S5 ConvCard   3×✓·CBA邀请·微信号+备注+QR  (jade)
       └ Footer        code·免责声明·品牌
```

### 7.1 共享模块 `cloud-functions/shared/emailTemplate.js`（唯一源）
```
renderEmail({ kind:'L1'|'CBA'|'digest', internal, header, hero, risks, mechanism, roadmap, conversion, footer }) → HTML
  子渲染：internalStrip / headerBar / heroCard / riskList / mechanismChain / roadmap / conversionCard / footer
  工具：mdToInlineHtml()（字段内强调 + JSON 失败兜底）
  常量：PALETTE
```
**部署现实**：CloudBase 函数独立部署、无打包 → 模板源文件为仓库 single-source-of-truth，物理上**内联粘贴**进每个 `index.js` 末尾；模板变更需重粘到两个函数（仅 2 个，可接受）。

## 8. Prompt 重构（输出契约）

模型从"写 600 字 Markdown"改为"**只输出符合 schema 的 JSON**"。

**L1（generateReport）：**
```json
{
  "rating": "优秀|需关注|高风险",
  "ratingReason": "一句话",
  "risks":     [ {"name":"…","oneLine":"≤30字"}, {…}, {…} ],
  "mechanism": [ {"cause":"…","physiology":"…","result":"…"} ],
  "roadmap":   { "d7":["…","…"], "d30":["…"], "d90":["…"] }
}
```
- **System message 保留** `CLINICAL_REASONING_SYSTEM`（证据分级约束）；输出指令改为"仅返回合法 JSON，无 Markdown、无 JSON 外文字，字段简洁"。
- **S1 / S5 不交模型**：S1 确定性计算，S5 固定品牌文案。模型仅产 rating/risks/mechanism/roadmap。
- temperature 0.4，max_tokens ~800。
- 健壮性：`try/catch` 解析；剥离 ```json 围栏；失败 → 原文经 `mdToInlineHtml` 渲染为段落兜底。
- **CBA（analyzeCBA）**：同款 JSON，risks/mechanism 由器官年龄 + 生化指标驱动；转化区为随访/逆龄方案。

## 9. Cloud Function 改造清单

| 文件 | 改动 | 部署 |
|---|---|---|
| `cloud-functions/shared/emailTemplate.js` (新) | 渲染函数 + 调色板 + `mdToInlineHtml`，唯一源 | 内联进各函数 |
| `generateReport/index.js` | ①prompt 换 JSON 契约 + 解析/兜底 ②组装 section 数据（hero=现有计算字段；rating=§5.1）③`buildEmailBody`(plain)→`renderEmail`(HTML) ④SMTP `text/plain`→**`multipart/alternative`**（HTML + 纯文本兜底）⑤底部内联模板 | 控制台手动 |
| `analyzeCBA/index.js` | 同上（CBA 变体）；`buildEmailSubject/Body` 重构；内联模板 | 控制台手动 |
| `tools/email-preview.js` (新, 本地) | 引入模板 + 样例数据 → 输出 `L1.html`/`CBA.html`，部署前多客户端验收 | 本地 |

- 无新增 npm 依赖；env 不变（`DEEPSEEK_API_KEY` / `EMAIL_163_AUTH_CODE`）。
- SMTP DATA 段改 MIME 多部分（boundary + `text/plain` 段 + `text/html` 段），握手不动。
- 主题可精简：`【缓龄报告】{name} | {rating} | {code}`。

## 10. 测试与验收

1. **本地先行**：`email-preview.js` 生成 `L1.html`/`CBA.html`，在浏览器 + iPhone Mail / 163 / QQ / Gmail 实测渲染——改云函数前先验收设计。
2. `node` 本地跑通 JSON 解析 + 渲染（含解析失败兜底路径）。
3. 部署后 `curl` 测两个函数 → `emailResult:sent` → 多端收验真实邮件。
4. 多端渲染核对（重点 163/QQ 表格 + 内联 CSS）。

## 11. 部署步骤（手动控制台）

1. 本地验收通过。
2. 改 `generateReport/index.js`（内联模板）→ 旧版腾讯控制台 Monaco `applyEdits` 分块注入 → 保存。
3. `curl` 测 generateReport(mode=full) → 收验。
4. 改 + 部署 `analyzeCBA` → `curl` 测 cba_submit → 收验。
5. 多端核对微调。
6. **回滚**：保留旧 `index.js` 副本，回滚=重粘旧版。
7. 注意 163 限频，测试间隔开。

## 12. 非目标 / 边界

- 不收集客户邮箱、不改 L1/CBA 前端流程。
- 不实现 Daily Digest（仅预留模板复用）。
- 不引入 npm 依赖或邮件服务商（沿用 163 SMTP 直连）。

## 13. 风险

- 模型偶发非法 JSON → 兜底渲染（已设计）。
- 163/QQ 对部分 CSS 不支持 → 表格 + 内联 CSS + 多端验收降低风险。
- 模板内联到两个函数 → 变更需双份同步（已标注）。
- 163 限频与本次无关，但测试需控频。
