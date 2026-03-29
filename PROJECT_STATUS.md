# BioAge Compass — 项目状态文档

> 下次开发从此文件开始。最后更新：2026-03-29

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

*BioAge Compass v0.1.0-beta · 陆大夫独立开发 · 2026-03-29*
