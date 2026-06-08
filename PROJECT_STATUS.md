# BioAge Compass — 项目状态文档

> 下次开发从此文件开始。最后更新：2026-06-08

---

## 2026-06-08 Clinical Conversion Report Email System（代码完成 + 评审通过；**待手动部署**）

> 分支 `feat/clinical-email-system`。重构 L1/CBA 通知邮件：旧版以 `text/plain` 发送 Markdown，客户端原样显示 `###`/`**`，不专业、不易读、无转化。新版改为 **模型输出结构化 JSON → 确定性 HTML 模板渲染**（非 MD→HTML），医生中转、正文面向客户、可分离内部条；5 区结构（身体年龄总览+评级徽章 / 三大风险 / 风险机制 / 7-30-90 行动路线 / 微信+CBA 转化卡）。设计 spec：`docs/superpowers/specs/2026-06-08-...md`，计划：`docs/superpowers/plans/2026-06-08-...md`。

| 单元 | 内容 | 提交 |
|---|---|---|
| A | `cloud-functions/shared/emailTemplate.js`（唯一源，纯函数，零依赖，Node18）+ `emailTemplate.test.js`（node:test，30 用例全过） | `39a9c23`→`523c73a` |
| B | `tools/email-preview.js` 本地多端预览（生成 L1/CBA HTML，gitignore） | `a7439da`/`7f0c76b` |
| C | `generateReport/index.js`：JSON 契约 prompt + parse/兜底 + assemble→render + SMTP `multipart/alternative` | `5bbecad`/`0d877c1` |
| D | `analyzeCBA/index.js`：CBA 变体同上；删除 140 行死代码（generateCBAReport/buildEmailSubject/Body/mapPlaTo5D） | `2ec9b7b`/`6a76c83` |

**评审：** 每单元两段式（spec 合规 → 代码质量）子代理评审。质量评审发现并修复：MIME 头注入加固（sanitizeHeader）、`Content-Transfer-Encoding: 8bit`（中文 UTF-8）、`parseModelJson` 拒绝数组/非对象、roadmap 数组守卫。全部 APPROVED。

**关键约束：** 模板是仓库唯一源，**部署时需内联粘贴进两个 index.js**（标记 `==EMAIL_TEMPLATE_START/END==`），变更需同步两处。无 npm 依赖，env 不变。

**待办（你方，最后一步）：**
1. 本地 `node tools/email-preview.js` → 浏览器看 `tools/preview/L1.html`/`CBA.html` 验收设计。
2. 按计划 Task 14：把模板内联进 `generateReport`/`analyzeCBA` 的 index.js，旧版腾讯控制台手动部署。
3. `curl` 测两函数 → `emailResult:sent` → **iPhone/163/QQ/Gmail 真机收验** HTML 渲染（无 `**`/`###`、QR+微信可见、内部条可分离）。
4. 合并分支：`feat/clinical-email-system` → `main`（前端无改动，云函数经控制台部署，非 Vercel）。
5. （可选）把 §8 文档备注加进 `CLAUDE.md`（你的 `CLAUDE.md` 有未提交 WIP，故我未代改）。

---

## 2026-06-07 生产事故修复（已部署 + 验证 ✅）

> 真实用户测试发现两处运行时故障（#1/#2），修复后真机 UI 验收又暴露更底层的第三处（#3）。经 CloudBase 实时诊断（`tcb fn invoke` + 生产 `curl`）逐层定位根因。commit `d82d711`（#1/#2）+ `4d3122b`（#3），均已 `git push origin main:clinical` 部署。**仅前端/代理改动，云函数与工作流未动。**

| # | 问题 | 根因 | 修复 | 涉及文件 |
|---|---|---|---|---|
| **#1** | 截图 OCR「不工作」——上传后指标不回填 | **响应契约不一致**：`analyzeCBA` 成功返回 `{code:0,biomarkers}`（无 `ok` 字段），而 `upload` 页以 `if(json.ok && json.biomarkers)` 判定 → OCR 结果被前端**静默丢弃**。云函数 OCR 链路本身完全正常。 | `analyze` 代理路由整形为 `{ok: code===0, biomarkers}` 契约（云函数/前端逻辑均未改） | `src/app/api/cba/analyze/route.ts` |
| **#2** | ¥199 仍可见 | 06-03 仅清理了 `preview` 弹窗收款码；首页/CBA落地页/results 共 **6 处 ¥199 文案标签**从未移除 | 6 处 ¥199 → `内测免费`；CBA 落地页"支付后"→"提交后" | `src/app/page.tsx`、`src/app/cba/page.tsx`、`src/app/results/page.tsx` |
| **#3** | OCR 对**真实手机截图/多图**仍失效——上传后跳转手填（#1 修复后才暴露的更底层根因） | **CloudBase HTTP 访问请求体上限约 100KB**（实测 88KB 通过 / 130KB 起 `413 EXCEED_MAX_PAYLOAD_SIZE`）。代理原"整包多图 base64"转发，真实照片 1–3MB/张必超限 → 云函数从未执行。 | **Option A**：前端 `canvas` 压缩每张至 <~60KB；代理改"**逐张并发转发 + 按指标名合并（首个非空优先）**"，单请求稳定在限额内。 | `src/app/cba/upload/page.tsx`、`src/app/api/cba/analyze/route.ts` |

**诊断证据：** 直接 `tcb fn invoke` 与生产 HTTP `curl`（前端代理所用 URL）均返回 `{"code":0,"biomarkers":{"albumin":42,"creatinine":85,"glucose":5.2,"alt":22,"hdl":1.4}}`、HTTP 200；环境变量 `TENCENT_SECRET_ID/KEY`、`DEEPSEEK_API_KEY` 均在位；云函数部署时间 06-03 22:15（确为 OCR 版本）。证明故障在前端契约层，**非云函数**。

**#1/#2 验证：** `npm run build` ✓ · `preflight_check.py` ✓ · `tests/run_tests.py` 3/3 ✓ · 生产 `nanoviga.com/` 与 `/cba` 已确认无 ¥199、显示"内测免费"、"提交后"。

**#3 诊断证据（生产 `curl` 直击 CloudBase 端点）：** 单图 88KB 转发体 → 200；130KB → **413 `EXCEED_MAX_PAYLOAD_SIZE`**；5 图整包 688KB → 413。证明限额约 100KB（base64 ×1.33 → 原图预算仅 ~70KB/请求），故真实照片必超限。

**#3 验证：** `npm run build` ✓ · 双 gate ✓ · 生产 `nanoviga.com/api/cba/analyze` 上传 **5 张压缩实验报告**（10 项指标分散于 5 图）→ HTTP 200、`{"ok":true,"biomarkers":{…10 项全部合并…}}`，跨图合并正确、单请求未超限。

**教训：** 06-03 #2 的"端到端验证"实为**端点级**（curl `extract` 端点，且仅单张小图），既漏检 `upload` 页 `json.ok` 门控缺陷（#1），也漏检多图/大图的 CloudBase 体积上限（#3）。**今后 OCR/提取类改动必须用"真实手机、多张真实截图"走一遍 `/cba/upload` UI 验收。**

**待办（你方，最后一步）：** 用**真实手机**在 `/cba/upload` 上传同一组截图，确认指标自动回填。服务端全链路已生产验证通过；仅浏览器 `canvas` 压缩需真机最后确认。

---

## 2026-06-03 上线变更（已部署 + 验证通过 ✅）

| # | 变更 | 涉及文件 | 状态 |
|---|---|---|---|
| **#1** | 内测期**取消 ¥199 收款码**：CBA 弹窗直接进入留资表单；CTA/文案改"内测免费 + 48h"；清理残留"支付"措辞 | `src/app/cba/preview/page.tsx` | ✅ 已上线（Vercel `clinical`，commit `8a696de`） |
| **#2** | **截图真正可解读**：弃用非视觉的 `deepseek-chat`，改 **腾讯云 OCR（图→文）+ DeepSeek（文→21 项 JSON）**；TC3 签名手写、**无 npm 依赖**。前端移除 PDF、上限 5 张、文案改"截图/照片" | `cloud-functions/analyzeCBA/index.js`、`src/app/cba/upload/page.tsx` | ✅ 云函数已上线（**端点级**验证）；⚠️ 前端 UI 契约缺陷致结果被丢弃 → 已于 **2026-06-07 #1** 修复 |
| **#3** | **医生复核（微信对照，零存储）**：管理员邮件指标段标注"⚠️ AI 提取，待陆医生对照微信原图复核"；前端提交后提示用户把化验原图发微信 | `cloud-functions/analyzeCBA/index.js`、`src/app/cba/preview/page.tsx` | ✅ 已上线 |

**关键配置（已完成）：** `analyzeCBA` 已配 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` 环境变量；腾讯云**通用印刷体识别 OCR 服务已开通**（此前 `FailedOperation.UnOpenError` 即未开通所致）。

**验证记录：** `extract` 端点实测 → OCR 识别置信度 100 → DeepSeek 正确结构化为 `{albumin:42, creatinine:85, glucose:5.2, alt:22, hdl:1.4}`，与测试图一致。邮件管道 `mode:"full"` 实测送达管理员 163 **收件箱**（非垃圾箱），授权码有效。

**OCR 用量：** 通用印刷体识别免费额度约 1,000 次/月，内测期注意「套餐用量」页监控。

**待办（你方，非阻塞）：** ① 用一张**真实化验截图**走一遍 `/cba/upload` 验收（合成图已验证，真图更稳）；② `generateReport` 2026-05-31 CLINICAL_REASONING 块仍未进 git，建议单独提交对齐线上。

---

## 当前阶段（运营）

| 字段 | 值 |
|---|---|
| **阶段** | Clinical Beta —— 用户获取与案例采集 |
| **入口** | WeChat QR code（陆医生微信） |
| **引导工作流** | ✅ 已完成 —— `workflows/WF_Clinical_Beta_Onboarding.md`（配套文案 `content/CNT_Beta_Onboarding_Messages.md`） |
| **运营模式** | 全人工、无 CRM、无自动化；案例库 = 单表格 + 每例一份 `outputs/OUT_BCA-XXXX_*.md` |
| **下一里程碑** | **首批 10 例真实案例** |

---

## 已发布版本

| 字段 | 值 |
|---|---|
| **Git Tag** | `v0.1.0-beta` |
| **发布日期** | 2026-03-29 |
| **前端地址** | https://nanoviga.com（Vercel，`clinical` 分支） |
| **云函数环境** | `bioage-compass-prod-9chaf35e573d`（腾讯 CloudBase，ap-shanghai） |
| **GitHub 仓库** | `drlupei-ux/nanoviga-bioage` |

---

## 核心功能（本版本）

### L1 PLA — 生活方式评估（免费，线上稳定）
- 29 题七维生活方式问卷 → 生物年龄计算（`src/lib/scoring.ts`，受保护）
- **5维品牌雷达图**展示（代谢活力 / 炎症免疫 / 心血管韧性 / 神经睡眠 / 器官储备）
  - 内部计算仍用 7D，`dimensionMapping.ts` 做展示层映射
- AI 深度摘要报告（DeepSeek，`generateReport` 云函数）
- 管理员邮件通知（163 SMTP，await 模式确保不丢失）
- 评估编号 `BCA-XXXX`，支持跨层联动

### L2 CBA — 临床生化年龄评估（¥199，首次开放测试）
- 体检报告上传 → DeepSeek Vision OCR 自动提取生化指标
- **PhenoAge 算法**（Levine 2018）→ 精确生物年龄，精度 ±1.5 岁
- 6维临床器官年龄（`phenoage.ts`）→ **5维品牌维度**映射（仅用于报告/邮件）
- 微信二维码支付 ¥199（手动核验流程）
- **PLA×CBA 双维度交叉报告**：联动用户（`l1PlaData` 随 payload 传递）获得两层融合分析
- 管理员邮件含完整 AI 报告 + 五维对比

### 风控 & 质量门控
- `risk_engine.py` R0–R3 医学内容分级审核
- `preflight_check.py` 结构完整性检查
- `tests/run_tests.py` 3 用例（全 PASS 方可上线）

---

## 已知问题（Important — 下次开发须知）

| # | 问题 | 优先级 | 解决方向 |
|---|---|---|---|
| **LIMIT-01** | 支付核验为人工流程——用户扫码自报，管理员收邮件后手动核验 | P1 | 接入微信支付 API（JSAPI/Native） |
| **LIMIT-02** | `@cloudbase/node-sdk` 未通过 `npm install` 部署，DB 保存走 HTTP fallback（`saveAssessment` 端点），CloudBase 内网故障时 `dbSaved: false` | P1 | 用 `tcb cli` 部署，或在控制台直接 zip 上传含 `package.json` 的完整包 |
| **LIMIT-03** | PLA 联动依赖 `sessionStorage`（同浏览器/同标签页），跨设备或新标签页时回退 DB 查询；若 DB 权限受限，`plaLinked: false` | P2 | 在 `/cba` 落地页落入 DB 查询时读取 assessments 集合 |
| **LIMIT-04** | CBA 预览页（器官年龄模糊卡）展示的是 6 维临床标签（`代谢健康 / 炎症状态 / 肾脏功能…`），与品牌 5 维体系视觉不一致 | P2 | 在 `preview/page.tsx` 加入 `mapCba6DTo5D()` 展示层转换 |
| **LIMIT-05** | Vercel 10 s 超时：PLA `full` 报告生成约 15 s，采用 fire-and-forget，用户侧无感知，但邮件发送依赖云函数运行完成 | P3 | 升级 Vercel Pro 或将报告生成移至 CloudBase 函数直接调用 |
| ~~CloudBase 超时~~ | ~~SMTP 25s + DeepSeek ~10s 可能超出函数限制~~ | ~~已验证无问题~~ | `generateReport` 300s / `analyzeCBA` 60s，均已足够，**误报已关闭** |
| **LIMIT-06** | OCR 提取准确率依赖图片质量，模糊/截图/多页 PDF 可能需用户手动补填 | P3 | 提示用户上传规范，增加字段级置信度校验 |
| **LIMIT-07** | L3 FMA / L4 ECA 未开发，升级路径暂无下游承接 | Backlog | 参见产品路线图 `BioAge_Compass_Project_Blueprint.md` |

---

## 下一步开发计划

### Sprint 1（紧急，影响用户体验）
1. **修复 LIMIT-02**：解决 `@cloudbase/node-sdk` 安装问题，`dbSaved` 必须稳定为 `true`
   - 方案：在腾讯云控制台直接 zip 上传 `analyzeCBA/` 目录（含 `package.json` + `node_modules`）
   - 或：等 `tcb` CLI 网络问题解决后 `tcb fn deploy --force`
2. **修复 LIMIT-04**：CBA 预览页6维标签 → 5维品牌标签
   - 在 `preview/page.tsx` 加入 `mapCba6DTo5D()` 映射（参考 `analyzeCBA/index.js` 中已有实现）

### Sprint 2（业务闭环）
3. **LIMIT-01 支付自动化**：接入微信支付 Native API
   - 支付成功 → webhook → 自动触发报告生成 + 发送
   - 参考：`/api/cba/submit` 路由改为支付回调触发

### Sprint 3（产品扩展）
4. **管理员数据看板**：查询 `cba_submissions` 集合，展示待核验订单列表
5. **L3 FMA 规划**：多组学功能衰老评估（参见 `BioAge_Compass_四级评估体系.md`）

---

## 关键文件速查

```
src/lib/scoring.ts              ← PLA 算法（受保护，禁止改动）
src/lib/phenoage.ts             ← CBA PhenoAge 算法
src/lib/dimensionMapping.ts     ← 7D → 5D 展示层映射
src/context/AssessmentContext   ← PLA 全局状态（受保护）
src/context/CBAContext.tsx      ← CBA 全局状态
src/app/cba/preview/page.tsx    ← 支付弹窗 + 联动提交（effectiveRef 在组件级）
cloud-functions/analyzeCBA/     ← CBA 云函数（含 mapCba6DTo5D）
cloud-functions/generateReport/ ← PLA 报告云函数
```

## 部署命令速查

```bash
# 前端 → Vercel（nanoviga.com）
npm run build && git push origin main:clinical

# 云函数（需腾讯云控制台或 tcb CLI）
# 旧版控制台 Monaco applyEdits 注入
# https://console.cloud.tencent.com/tcb/scf/detail?envId=bioage-compass-prod-9chaf35e573d&rid=4&id=analyzeCBA&tab=scfCode

# 本地测试
PYTHONPATH=. python3 preflight_check.py
PYTHONPATH=. python3 tests/run_tests.py
```

---

*BioAge Compass v0.1.0-beta · 陆医生独立开发 · 2026-06-03*
