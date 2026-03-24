# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## 0. 优先级声明（最高规则）

本文件为项目最高行为规范。所有开发行为必须遵守本文件。如与以下内容冲突：`Claude_init.md` / 默认工程习惯 / 历史生成代码逻辑，**一律以本文件为准**。

**一句话原则：稳定优先 > 正确性优先 > 功能扩展**

---

## 1. SYSTEM 层（系统级约束）

### 风控红线（禁止行为）

- 编造医学证据或使用模糊表述替代明确逻辑
- 修改已有数据结构而不说明影响
- 未经说明重构核心模块
- 输出"看起来合理但无法验证"的建议
- 直接给最终答案而无推理结构；忽略上下文约束

### 不确定性决策机制

当存在不确定性时，必须：① 明确列出假设 ② 给出多种可选路径 ③ 标注风险等级

### 每次输出前自检

- 是否违反医疗严谨性？
- 是否破坏已有系统？
- 是否引入不可控复杂度？

---

## 2. PRODUCT 层（产品定义）

**nanoviga 是**：基于医学逻辑的生物年龄评估与决策辅助系统。不是娱乐工具、随机问答系统或非结构化AI聊天产品。

**所有输出必须满足**：结构化（分层清晰，有逻辑主线）/ 可解释（每个结论可追溯原因）/ 可执行（用户可根据结果采取行动）

**UI & 内容规则**：

- **Tone:** 医疗专业感，临床、冷静、权威
- **禁止词：** "AI"、"model"、"algorithm"、"generated"、夸张营销语言
- **语言：** 用户界面全部中文
- **首选表达：** "评估" / "临床洞察" / "关键发现" / "建议行动"
- 移动端优先，结果前置，无长段落

---

## 3. ENGINEERING 层（工程约束）

### 修改原则

1. **最小侵入**（Minimal Change）— 只改与任务直接相关的行
2. **向后兼容**（Backward Compatible）— 不破坏已有稳定功能
3. **可回滚**（Reversible）— 重大修改前必须创建 commit/snapshot

### 禁止行为

- 无说明删除文件或大范围重构目录结构
- 随意新增字段、修改字段含义、改变接口格式
- 在未保存版本情况下进行大规模修改

### 修改注释格式（每次改动必须标注）

```typescript
// [CHANGE YYYY-MM-DD] 原因：<一句话说明> | 影响范围：<文件/功能>
```

### 受保护文件（实际只读）

| 文件 | 约束 |
|---|---|
| `src/lib/scoring.ts` | 算法、`clamp [18,110]`、`assessmentCode` 前缀 `"BCA-"` 不得改动 |
| `src/context/AssessmentContext.tsx` | Context 接口与 sessionStorage key `"nanoviga_results"` 不得改动 |
| `tailwind.config.ts` | `clinical-*` 颜色 token 值不得改动 |
| `globals.css` | `.clinical-card`、`.clinical-section-label`、`.pb-safe*` 不得改动 |

### 强制测试门控（Gate）

每次开发循环必须按序执行：

1. `PYTHONPATH=. python3 preflight_check.py` — 结构检查通过
2. `PYTHONPATH=. python3 tests/run_tests.py` — 全部 PASS
3. 输出逻辑须经 `risk_engine.evaluate_risk()` 评估 — R2+ 需说明，R3 禁止上线
4. 任何测试失败 → **停止开发** → 修复 → 重新验证 → 才能继续

### Commit 规范

格式：`<type>(<scope>): <说明>`，type 为 `fix/feat/docs/style`（`refactor` 需特殊审批）。每次 commit 前必须运行 `npm run build` 确认无 TS 错误。

---

## 4. 两个产品 / 同一仓库

| Product | Entry point | 部署地址 | Tech |
|---|---|---|---|
| **BioAge Compass** | `index.html` | CloudBase 静态托管 | 纯 HTML + Vanilla JS + Chart.js CDN |
| **nanoviga-clinical** | `src/` | nanoviga.com via Vercel | Next.js 14.2.5 · TypeScript · Tailwind |

---

## 5. 部署（关键）

### Next.js → nanoviga.com（Vercel）

> ⚠️ **Vercel 监听 `clinical` 分支，不是 `main`。**

```bash
npm run build                    # 必须先通过构建
git push origin main:clinical    # 唯一合法的生产部署命令
```

`git push origin main` 只推送到 `origin/main`，**不触发 Vercel**。

**部署前检查：**
- [ ] `npm run build` 通过，无 TS 错误
- [ ] 新 API 路由已用 curl 验证
- [ ] 数据库改动已在 CloudBase 控制台确认

### BioAge Compass → CloudBase 静态托管

```bash
git add index.html && git commit -m "..." && git push origin main
```

---

## 6. 开发命令

```bash
npm run dev      # 开发服务器 http://localhost:3000
npm run build    # 生产构建（部署前必须通过）
npm run lint     # ESLint
```

**测试与风控（每次开发前必须全部通过）：**

```bash
PYTHONPATH=. python3 preflight_check.py      # 结构完整性检查
PYTHONPATH=. python3 tests/run_tests.py      # 风控引擎测试（3用例，全 PASS 才能继续）
```

> `python` 命令不可用，必须用 `python3`，且需设置 `PYTHONPATH=.`。

> `next.config` 必须为 `.js`（CommonJS）— Next.js 14.2.5 不支持 `.ts` 配置文件。

---

## 7. Next.js 架构

两套独立 Context，各自管理状态：

| Context | 文件 | sessionStorage key |
|---|---|---|
| `AssessmentContext` | `src/context/AssessmentContext.tsx` | `"nanoviga_results"` |
| `CBAContext` | `src/context/CBAContext.tsx` | `"nanoviga_cba_results"` |

**PLA 流程：**
```
/ (landing)
  → /assessment  (ProfileForm → 29 QuestionCards)
      → setResults() + router.push("/results")
          → /results  (5维雷达图 + 各维度评估 + 干预建议 + CBA升级卡)
              ├─ 固定底部: router.push("/report")   — 免费深度报告
              └─ 升级卡: router.push("/cba?ref=BCA-XXXX")  — L2 付费
                  → /report  (留资表单 → 微信二维码成功页)
```

**CBA 流程（独立入口，也可从 PLA 结果页进入）：**
```
/cba  (landing, 接收 ?ref=BCA-XXXX 写入 CBAContext.l1RefCode)
  → /cba/upload  (体检报告图片上传 → AI提取 or 手动填写生化指标)
      → /cba/preview  (WeChat ¥199 付款码 → 用户自报支付)
          → /cba/success  (提交 + 成功页)
```

`/results` 加载时若 `results === null` 则重定向到 `/`。sessionStorage 只能在 `useEffect` 内访问，渲染时访问会触发 hydration 错误（#418/#423）。

### 评分算法（`src/lib/scoring.ts`）

```
dimensionScore  = 维度内答案平均值  (0–10)
totalScore      = (各维度得分之和 / 7) × 10  (0–100)
ageFactor       = age < 35 ? 0.8 : age < 45 ? 1.0 : age < 55 ? 1.2 : 1.5
delta           = ((totalScore - 50) / 5) × ageFactor
bioAge          = clamp(actualAge - delta + geneticPenalty + bmiAdj × 0.3,
                        actualAge - 15, actualAge + 18)
peerPercentile  = clamp(round(50 - (actualAge - bioAge) × 3.5), 1, 99)
assessmentCode  = "BCA-" + 4位随机字母数字
```

`geneticPenalty` = `(5 - genScore) × 0.3`（当遗传因素得分 < 5 时）。

### API 路由

| 路由 | await? | 说明 |
|---|---|---|
| `POST /api/save-assessment` | **必须 await** | 返回 `_id`，PLA 评估持久化 |
| `POST /api/generate-report` | **禁止 await** | fire-and-forget，Vercel 10s 超时 |
| `POST /api/cba/analyze` | **必须 await** | 转发图片（base64）到 `analyzeCBA` 云函数做 OCR 提取，`maxDuration=30s` |
| `POST /api/cba/submit` | **禁止 await** | fire-and-forget，转发到 `analyzeCBA` 云函数做 `cba_submit` 模式 |

`generate-report` 向 CloudBase 转发：`name, age, gender, bioAge, score, dimensionScores, contact, assessmentCode, agingPace, peerPercentile`

`cba/submit` 向 CloudBase 转发：`mode="cba_submit", assessmentCode, l1RefCode, name, phoneSuffix, actualAge, gender, phenoAge, organAges, biomarkers`

### 设计系统

颜色全部使用 `clinical.*` token（`tailwind.config.ts`）。复用 class：`.clinical-card`、`.clinical-section-label`。条件合并用 `cn()`。所有 input 使用 `text-base`（16px）防止 iOS Safari 自动缩放。可点击元素高度 ≥ `h-12`（44px touch target）。

### 微信二维码（`src/app/report/page.tsx`、`src/app/cba/preview/page.tsx`）

必须用原生 `<img>`（不用 Next.js `<Image>`），`/_next/image` 优化 URL 会导致微信 in-app 浏览器无法长按识别。父容器不得有 `overflow-hidden`。

### 5维展示层（`src/lib/dimensionMapping.ts`）

算法层（`scoring.ts`）永远使用 7D 内部维度。**展示层**通过 `mapL1ToFivePillars()` 将 7D 映射到 5 个品牌维度，仅用于雷达图、FindingCard、干预建议：

```
代谢活力   = 营养代谢
炎症免疫   = 身心平衡×0.6 + 环境因素×0.4
心血管韧性 = 运动能力
神经睡眠   = 睡眠质量×0.7 + 感官衰老×0.3
器官储备   = 遗传因素
```

`RadarHealth` 接受任意 `Record<string, number>`，始终传入 5 维映射结果。`FindingCard` 的 `ICON_MAP` 和 `FINDING_COPY` 保留 7D 键（向后兼容），同时包含 5D 键。

---

## 8. 云函数

**CloudBase 环境：** `bioage-compass-prod-9chaf35e573d`（ap-shanghai）

**HTTP 端点（无需鉴权）：**
```
POST .../saveAssessment   — 保存 PLA 评估到 assessments 集合
POST .../generateReport   — PLA 报告：DeepSeek AI 生成，保存 report_submissions，发邮件
POST .../analyzeCBA       — CBA：OCR 提取 + PhenoAge 计算 + 报告 + 邮件
```

**generateReport 模式（`event.body.mode`）：**
- `summary` — 4句摘要 + CBA推荐，`max_tokens=350`
- `full` — 风险信号 + 缓龄策略（约600字），`max_tokens=1500`，保存 DB + SMTP 邮件

**analyzeCBA 模式（`event.body.mode`）：**
- `extract` — 接收 base64 图片，调用 DeepSeek Vision OCR 提取生化指标，返回 `{ ok, biomarkers }`
- `cba_submit` — 接收 PhenoAge 计算结果 + 用户信息，保存 `cba_submissions` 集合 + 发邮件通知管理员；若有 `l1RefCode` 则在报告中融合 PLA 数据

**源码：**
- `cloud-functions/generateReport/index.js`（Node.js 18）
- `cloud-functions/analyzeCBA/index.js`（Node.js 18）

**环境变量：** `DEEPSEEK_API_KEY`，`EMAIL_163_AUTH_CODE`

### 部署云函数

使用**旧版**腾讯云控制台（`console.cloud.tencent.com`）。Monaco 编辑器直接暴露在页面 JS 作用域。**`setValue` 被安全规则拦截，必须用 `applyEdits`：**

```js
// 1. 分块注入（每块约3500字符，避免安全过滤器）
window._p1 = "...JSON转义后的代码第1段...";
window._p2 = "...第2段...";
window._p3 = "...第3段...";

// 2. 合并写入 Monaco
const model = monaco.editor.getModels()[0];
const lineCount = model.getLineCount();
const lastLine  = model.getLineContent(lineCount);
const range = new monaco.Range(1, 1, lineCount, lastLine.length + 1);
model.applyEdits([{ range, text: window._p1 + window._p2 + window._p3 }]);

// 3. 点击编辑器下方的"保存"按钮（在 Cloud Studio 外）
```

新版控制台（`tcb.cloud.tencent.com`）使用跨域 Cloud Studio iframe，避免使用。

**测试：**
```bash
curl -s -X POST 'https://bioage-compass-prod-9chaf35e573d-1405252881.ap-shanghai.app.tcloudbase.com/generateReport' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"summary","name":"测试","age":40,"gender":"male","bioAge":36,"score":78,"dimensionScores":{"运动能力":8,"身心平衡":7,"营养代谢":6,"睡眠质量":9,"遗传因素":8,"环境因素":7}}' \
  --max-time 60
```

---

## 9. 关键源文件索引

**L1 PLA 核心：**

| 文件 | 用途 |
|---|---|
| `src/types/assessment.ts` | PLA 共享类型、`DOMAIN_LABELS`（7D）、`getScoreRange()`、`getAgingStatus()` |
| `src/lib/questions.ts` | 29道题（中文）与选项分值 |
| `src/lib/scoring.ts` | `calculateResults()` — 完整生物年龄计算（受保护） |
| `src/lib/dimensionMapping.ts` | `mapL1ToFivePillars()` — 7D→5D 展示层映射 |
| `src/context/AssessmentContext.tsx` | PLA 全局状态（in-memory + sessionStorage，受保护） |
| `src/components/FindingCard.tsx` | 维度结果卡，`FINDING_COPY` 含 7D + 5D 文案 |
| `src/components/HeroScore.tsx` | 生物年龄动画展示 + 光谱条 |
| `src/components/RadarHealth.tsx` | Recharts 雷达图，接受任意 `Record<string, number>` |
| `src/app/report/page.tsx` | 留资表单（姓名+手机必填）→ 微信二维码成功页 |
| `src/app/api/generate-report/route.ts` | Vercel → CloudBase 报告代理（fire-and-forget） |
| `src/app/api/save-assessment/route.ts` | Vercel → CloudBase 数据保存代理（await） |

**L2 CBA 模块：**

| 文件 | 用途 |
|---|---|
| `src/types/cba.ts` | CBA 类型：`CBABiomarkers`、`CBAResults`、`OrganAges` |
| `src/context/CBAContext.tsx` | CBA 状态（biomarkers / results / l1RefCode），sessionStorage `"nanoviga_cba_results"` |
| `src/app/cba/page.tsx` | CBA 落地页（接收 `?ref=BCA-XXXX` → 写入 `l1RefCode`） |
| `src/app/cba/upload/page.tsx` | 体检报告上传 + AI OCR 提取 + 手动填写回退 |
| `src/app/cba/preview/page.tsx` | WeChat ¥199 付款码 + 用户自报支付 |
| `src/app/cba/success/page.tsx` | 支付确认 → 提交 → 成功等待页 |
| `src/app/api/cba/analyze/route.ts` | 转发图片（base64）到 `analyzeCBA` 云函数 OCR（await，30s） |
| `src/app/api/cba/submit/route.ts` | 转发提交数据到 `analyzeCBA` 云函数（fire-and-forget） |
| `cloud-functions/analyzeCBA/index.js` | CBA 云函数（需手动通过控制台部署） |

**基础设施：**

| 文件 | 用途 |
|---|---|
| `cloud-functions/generateReport/index.js` | PLA 报告云函数 |
| `risk/risk_engine.py` | 风控引擎：`evaluate_risk(text)` → R0–R3 |
| `tests/run_tests.py` | 风控测试套件（3用例） |
| `preflight_check.py` | 上线前结构检查 |

---

## 10. 评估维度体系

**L1 PLA — 7D 内部算法维度（`scoring.ts`，不可改）：**

运动能力 · 身心平衡 · 营养代谢 · 睡眠质量 · 遗传因素 · 环境因素 · 感官衰老（共 29 题）

**L1 PLA — 5D 展示层品牌维度（`dimensionMapping.ts`，仅用于展示）：**

代谢活力 · 炎症免疫 · 心血管韧性 · 神经睡眠 · 器官储备

**L2 CBA — 5维器官年龄（PhenoAge 算法，`analyzeCBA` 云函数计算）：**

同上 5 维，通过血液生化指标计算。与 L1 共享相同品牌维度名，实现"双维度交叉验证"叙事。

---

## 11. 未来扩展（预留接口）

本系统未来支持：多模块技能（`skills/`）/ 医学模型升级 / 用户数据闭环。**当前设计必须保持扩展性，避免锁死结构。**
