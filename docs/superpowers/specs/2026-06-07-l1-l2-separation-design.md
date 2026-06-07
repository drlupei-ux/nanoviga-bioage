# L1 / L2 分离 + L1 结果页精简 + 微信引导 — 设计

> 日期：2026-06-07 ｜ 状态：已与用户确认，待写实现计划
> 范围：仅前端（`/results` + 新组件 + 复用 `generateReport`）。不改云函数、不改工作流、不改 L1 算法。

---

## 1. 目标

把 L1（生活方式评估）与 L2（CBA 临床生化评估）**彻底分离**：

- L1 结果页**自包含**，不再有任何 L2/CBA 自助入口。L2 由陆大夫在用户加微信、人工审阅 L1 结果后，通过既有 `/cba?ref=BCA-XXXX` 链接**手动**发放。
- L1 结果页**精简**为：生物年龄 vs 实际年龄差距 · 同龄人百分位 · 五维雷达图 · 微信引导卡片。"详细报告"不再在页面展示，改由陆大夫加微信后发送。
- L1 完成时**自动**把"L1 结果 + 评估编号"邮件发给陆大夫（复用 `generateReport`，无需用户填姓名/手机）。

## 2. 非目标（Out of scope）

- 不改 `/cba`（L2）任何逻辑——它仍通过陆大夫发的 `?ref=` 链接工作。
- 不改云函数 `generateReport` / `analyzeCBA`。
- 不删除 `/report` 页面文件（仅从流程中解除链接，留待后续清理）。
- 不改 `scoring.ts`、`AssessmentContext`、雷达/HeroScore 算法与组件内部。

---

## 3. 页面结构（改后，自上而下）

```
固定底部 CTA      →  「添加陆大夫微信 · 获取完整报告」（触发微信卡片同款动作）
HeroScore        →  生物年龄 vs 实际年龄（差距）           [保留]
状态标签 pill     →  agingStatus（年轻/衰老状态）           [保留，强化差距解读]
核心指标 3 列      →  健康总评分 · 衰老速率 · 同龄人百分位     [保留]
五维健康档案       →  RadarHealth（5D）                    [保留]
────────────────
WeChatAddCard    →  新组件（见 §4）
页脚              →  评估编号 / 日期 / 免责声明              [保留]
```

**移除的区块（现 `src/app/results/page.tsx`）：**
- 顶部"关键窗口期"标题块
- "各维度评估结果"（FindingCard 列表）
- "优先干预建议"（recommendations）
- "趋势预测"
- "待解锁"（L2 引导）
- "升级 CTA"（L2 引导）
- 顶部固定 CTA 由 `→ /report` 改为触发微信添加

移除后清理不再使用的 import / 变量（如 `buildRecommendations`、`weakestPillar`、`FindingCard` 等），保证构建无未用告警。

---

## 4. 新组件 `WeChatAddCard`

**文件：** `src/components/WeChatAddCard.tsx` ｜ **Props：** `{ assessmentCode: string }`

**常量：** `const WECHAT_ID = "Charlie20850";`

**UI（clinical-card 风格，移动优先，触控目标 ≥ h-12）：**
- 标题：**添加陆大夫微信，获取完整评估**
- 微信号行：显示 `微信号：Charlie20850` + 主按钮 **「点击复制并打开微信」**
- 备注提示：`添加后请备注您的评估编号：{assessmentCode}`
- "为什么添加"三条文案：
  1. 获取本次 L1 评估的**详细报告**
  2. 与**陆大夫团队**一对一沟通
  3. 根据**体检报告**深度评估衰老风险（L2）

**交互（点击主按钮）：**
1. `navigator.clipboard.writeText(WECHAT_ID)` → 成功后按钮文案切换为「已复制 ✓」（2s 后复原），并显示提示「已复制微信号，请在微信『添加朋友』中粘贴搜索」。
2. 复制后尝试 `window.location.href = "weixin://"` 拉起微信。
   - 外部浏览器（Safari 等）可拉起微信 App。
   - 微信内置浏览器无法深链到"加好友"，靠上面的复制 + 文案兜底。
3. `clipboard` 失败（极少数非安全上下文）时，微信号本就明文可见，提示用户手动长按复制。

> nanoviga.com 为 https，`navigator.clipboard` 可用。

---

## 5. 自动邮件给陆大夫（复用 generateReport）

在 `/results` 增加一个**一次性** fire-and-forget effect（仿照已有 save-assessment effect 的 `savedRef` 模式）：

- 守卫：`reportSentRef` + `sessionStorage["nanoviga_report_sent_<assessmentCode>"]`，避免刷新重复发送。
- 触发：`results` 就绪后立即 `POST /api/generate-report`（fire-and-forget，不 await，`.catch(()=>{})`）。
- 载荷映射（`generate-report` 路由要求 name/age/gender/bioAge/score/dimensionScores 非空，否则 400）：
  ```
  name:            results.profile?.name ?? "自助L1用户"
  age:             results.actualAge
  gender:          results.profile?.gender ?? ""
  bioAge:          results.bioAge
  score:           Math.round(results.totalScore)
  dimensionScores: results.dimensionScores
  assessmentCode:  results.assessmentCode
  agingPace:       results.agingRate          // 路由字段名为 agingPace
  peerPercentile:  results.peerPercentile
  contact:         "见微信备注编号 " + results.assessmentCode
  ```
- 结果：陆大夫收到含 L1 完整结果 + 编号的邮件；用户加微信时备注同一编号，陆大夫据此回发 L2 入口。

> `gender` 为空时 `generate-report` 会返回 400 → 邮件不发。`profile.gender` 在 ProfileForm 阶段采集，正常存在；实现时确认其一定有值，否则给安全默认。

---

## 6. 改动文件清单

| 文件 | 改动 |
|---|---|
| `src/components/WeChatAddCard.tsx` | **新建**（§4） |
| `src/app/results/page.tsx` | 移除 §3 区块；新增自动邮件 effect（§5）；底部固定 CTA 改为触发微信添加；渲染 `WeChatAddCard`；清理未用 import/变量 |
| `src/app/report/page.tsx` | 不改（仅不再被链接） |
| `cloud-functions/*` | 不改 |

每处改动加 `// [CHANGE 2026-06-07] 原因：… | 影响范围：…` 注释。

---

## 7. 边界与风险

- **刷新重复发邮件**：用 sessionStorage 编号级守卫兜底。
- **agingPace/agingRate 命名**：路由用 `agingPace`，结果对象用 `agingRate`，映射时对齐。
- **微信内置浏览器**：`weixin://` 不可深链加好友——已用复制 + 文案兜底，符合用户已确认的行为。
- **未用变量导致构建告警**：移除区块后同步清理 import/变量。
- **`/report` 失联**：保留文件不删，避免误删；后续可单独清理。

## 8. 验证

1. `npm run build` ✓ · `preflight_check.py` ✓ · `tests/run_tests.py` 3/3 ✓
2. 手机走查：完成 L1 → `/results` 仅含 HeroScore/状态/3 列指标/雷达/微信卡片；无 L2、无各维度/干预/趋势。
3. 点击微信卡片 → 复制 `Charlie20850` + 文案出现；外部浏览器尝试拉起微信。
4. 完成 L1 后陆大夫 163 邮箱收到含 L1 结果 + 编号的邮件（生产 `curl`/收件箱确认）。
5. 确认 `/results` 不再出现任何 `/cba` 或 ¥-相关入口。
