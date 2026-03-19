# Development Rules — nanoviga-clinical

> 本文件规定所有对本项目的修改规则。所有 Claude 实例和开发者必须严格遵守。

---

## 核心原则

### 1. 禁止重构已有代码

- **绝对禁止**在未被要求的情况下重命名变量、函数、组件或文件
- **绝对禁止**将 `var` 改为 `const/let`、将函数式写法改为箭头函数，或进行任何纯风格重构
- **绝对禁止**拆分、合并或移动组件（例如不得将 `report/page.tsx` 拆分为子组件）
- **绝对禁止**更改已有路由路径（`/assessment`、`/results`、`/report`、`/api/*`）
- **绝对禁止**更改 `scoring.ts` 中的生物年龄算法，除非明确被要求

### 2. 只允许最小修改

每次修改必须满足：
- **只改动与任务直接相关的行**，不得顺手优化周边代码
- 每个 PR / commit 只解决一个问题
- 若修复 A 时发现 B 也有问题，**先完成 A，单独提 issue 记录 B**
- 新增功能优先用新文件，不得扩大已有文件的职责边界

### 3. 保持 UI 结构稳定

- **禁止**在未被要求的情况下调整组件的 HTML 层级结构
- **禁止**删除或替换 Tailwind class（只允许新增）
- **禁止**修改 `tailwind.config.ts` 中 `clinical-*` 颜色 token 的值
- **禁止**修改 `globals.css` 中已有的 `.clinical-card`、`.clinical-section-label`、`.pb-safe*` 等 class
- **禁止**修改 `public/wechat-qr.jpg` 的路径或文件名

### 4. 所有改动必须标注

每次代码修改时，在改动行或改动块的上方添加注释，格式：

```typescript
// [CHANGE YYYY-MM-DD] 原因：<一句话说明> | 影响范围：<文件/功能>
```

示例：
```typescript
// [CHANGE 2026-03-19] 原因：CORS 拦截，改为服务端代理 | 影响范围：results/page.tsx 数据保存
const SAVE_URL = "/api/save-assessment";
```

---

## 文件级规则

### `src/lib/scoring.ts` — 算法核心，只读

| 规则 | 说明 |
|---|---|
| 禁止修改算法 | `delta`、`bmiAdj`、`geneticPenalty`、`clamp` 逻辑不得更改 |
| 禁止修改 `assessmentCode` 前缀 | 当前为 `"BCA-"`，不得改为其他 |
| 禁止修改年龄 clamp 范围 | `[18, 110]`，支持老年用户 |
| 允许 | 仅修复明显 bug（需在注释中说明修复前后的值变化） |

### `src/context/AssessmentContext.tsx` — 状态核心，只读

| 规则 | 说明 |
|---|---|
| 禁止修改 Context 接口 | `profile`、`answers`、`results`、`setResults`、`reset` 不得增删 |
| 禁止修改 sessionStorage key | 当前为 `"nanoviga_results"`，更改会导致已有用户数据丢失 |

### `src/app/results/page.tsx` — 结果页

| 规则 | 说明 |
|---|---|
| 禁止修改 `savedRef` 逻辑 | 防止 React StrictMode 双重触发保存，不得删除 |
| 禁止删除 save-assessment 调用 | 这是数据库写入的主入口 |
| 禁止修改 sessionStorage 读取的 useEffect | 改动会导致刷新页面时白屏 |
| 允许 | 修改显示文案、卡片样式、新增 UI 元素（保持 HTML 层级） |

### `src/app/report/page.tsx` — 留资页

| 规则 | 说明 |
|---|---|
| 禁止将 `resolvedResults` 移回渲染时初始化 | 会引发 React hydration 错误 #418/#423 |
| 禁止修改手机号正则 | `/^1[3-9]\d{9}$/` 匹配中国大陆手机号 |
| 禁止在 `handleSubmit` 中 `await` save-assessment | 必须 fire-and-forget，不得阻塞用户流程 |
| 允许 | 修改表单字段文案、样式，新增可选输入字段 |

### `src/app/api/generate-report/route.ts` — 报告代理

| 规则 | 说明 |
|---|---|
| 禁止 `await` CloudBase 调用 | Vercel hobby 超时 10s，CloudBase 生成需 30-60s |
| 禁止修改必填字段验证 | `name/age/gender/bioAge/score/dimensionScores` 均为必填 |
| 禁止修改返回格式 | 前端依赖 `{ ok: true }` 判断跳转 |

### `src/app/api/save-assessment/route.ts` — 保存代理

| 规则 | 说明 |
|---|---|
| 禁止添加字段验证 | 此路由为透传代理，不做业务逻辑 |
| 禁止修改为 fire-and-forget | 此路由 **必须** await CloudBase，以便返回 id |

### `vercel.json` — 路由配置

| 规则 | 说明 |
|---|---|
| 禁止删除 `/wechat-qr.png` 和 `/layer2\.html` 的静态路由 | 这两个路由是遗留静态资源 |
| 禁止修改安全 headers | `X-Frame-Options: DENY` 等不得移除 |

---

## 新增代码规范

### 新增 API 路由

```typescript
// ✅ 正确：遵循现有代理模式
export async function POST(req: NextRequest) {
  const body = await req.json();
  // 代理到 CloudBase，返回响应
}

// ❌ 禁止：在 API 路由中引入数据库 SDK 或第三方包
import { db } from "some-db-lib";
```

### 新增 UI 组件

- 必须使用 `clinical-*` 颜色 token，禁止硬编码十六进制颜色值
- 所有 input 必须使用 `text-base`（16px）防止 iOS Safari 自动缩放
- 所有可点击元素高度 ≥ `h-12`（44px touch target）
- 使用 `cn()` 合并 class，不得字符串拼接

### 新增 useEffect

```typescript
// ✅ 正确：sessionStorage 访问放在 useEffect 内
useEffect(() => {
  const data = sessionStorage.getItem("key");
}, []);

// ❌ 禁止：渲染时访问 sessionStorage（引发 hydration 错误 #418/#423）
const data = typeof window !== "undefined" ? sessionStorage.getItem("key") : null;
```

---

## Commit 规范

每次 commit 必须：

1. **标题格式**：`<type>(<scope>): <简短说明>`
   - type: `fix` / `feat` / `docs` / `style` / `refactor`（refactor 需特殊审批）
   - scope: 受影响的文件或功能名（如 `report`, `scoring`, `api`）

2. **正文**：说明「改了什么」和「为什么改」

3. **禁止**在单次 commit 中混合多个不相关改动

4. **必须**在 commit 前运行 `npm run build` 确认无 TypeScript 错误

```bash
# 正确示例
git commit -m "fix(cors): proxy saveAssessment through Next.js API

Direct fetch blocked by CloudBase preflight missing Allow-Headers.
Server-side proxy bypasses browser CORS enforcement."
```

---

## 部署规则

```bash
# 唯一合法的部署命令
vercel --prod

# 禁止通过 git push 触发部署（CloudBase 和 Vercel 使用不同分支）
# 本地 main → 推送目标为 origin/clinical（不是 origin/main）
git push origin main:clinical
```

**部署前检查清单：**
- [ ] `npm run build` 通过，无 TS 错误
- [ ] 新增的 API 路由已用 curl 验证
- [ ] 涉及数据库写入的改动已在 CloudBase 控制台确认记录

---

## UI & 内容规则（继承自原 development_rules.md）

- 遵循 `/skills/nanoviga_ui_v1/` 中的 UI 规范
- 不得引入已有设计系统之外的新 UI 模式
- 保持临床语气，永远不在用户界面中提及「AI」、「模型」、「算法」或「生成」
