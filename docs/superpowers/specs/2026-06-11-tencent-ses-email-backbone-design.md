# Email Backbone Migration: 163 SMTP → Tencent SES — 设计 Spec

- **日期**：2026-06-11
- **状态**：设计已通过（含 2026-06-11 region 修正），待 spec 复核 → 实施计划
- **核实更正（2026-06-11）**：**无需 SES 国际版账号**。中国站 SES API 支持 `ap-guangzhou`/`ap-hongkong` 等地域，复用现有**中国站账号 + `TENCENT_SECRET_ID/KEY`**（与 CloudBase/OCR 同账号）。**发信专用域名无需 ICP 备案**（仅当域名 A 记录指向大陆服务器才需备案；nanoviga.com A 记录指向 Vercel/海外）。来源：[SES 请求结构/地域](https://cloud.tencent.com/document/product/1288/51055)、[SES 域名相关问题](https://cloud.tencent.com/document/product/1288/52776)。最终采用 **region `ap-guangzhou`（国内，对 163 投递更顺）**。
- **前序**：构建于 `feat/clinical-email-system`（Clinical Conversion Report Email System，HTML 模板系统已就绪）
- **关联 spec**：`docs/superpowers/specs/2026-06-08-clinical-conversion-email-system-design.md`

---

## 1. 背景与目标

当前两个云函数（`generateReport` L1 / `analyzeCBA` CBA）经**手写 163 SMTP 直连**发信，收件人=发件人=同一 163（`13816746212@163.com`）。**2026-06-10 验证：163 已账号级封禁发信，持续 `550 User has no permission` 超过 2 天**（授权码仍有效，AUTH 成功；550 发生在发信阶段）。自发自收 + 突发测试触发反垃圾。免费 163 SMTP 不适合事务邮件。

**目标**：把发信后端从 163 SMTP 迁移到 **Tencent SES（邮件推送，中国站账号，region `ap-guangzhou`）**，提升送达可靠性与可观测性，消除自发自收限制。HTML 报告模板系统不变。

## 2. 已确认决策

| 决策 | 取值 |
|---|---|
| 服务 | Tencent Cloud **中国站** — Simple Email Service (SES，邮件推送)；**复用现有账号**（CloudBase/OCR 同一个） |
| Region | **`ap-guangzhou`**（国内，对 163 投递更顺）。发信专用域名**无需 ICP 备案**（A 记录非大陆即可） |
| 发件地址 (From) | **`bioage@nanoviga.com`**，显示名 **`BioAge Compass`** |
| **Reply-To** | **`support@nanoviga.com`**（回复去向；SES 仅出站，收信需另配，见 §6.1） |
| 收件地址 (生产) | env **`SES_TO`**（陆大夫通知箱；**不硬编码 PII**；发件≠收件，消除自发自收标记） |
| 测试收件地址 | env **`SES_TEST_RECIPIENT`**（首测/联调覆盖；设置即覆盖 `SES_TO`，**go-live 前必须清空**，见 §5.4） |
| 发信内容 | **内联 HTML（`SendEmail.Simple`）**，直接用 `renderEmail()` 输出；不注册 Tencent 模板（回退方案见 §9） |
| 凭证 | 复用 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` + 现有 TC3-HMAC-SHA256 签名原语 |
| 163 路径 | **完全删除**（`sendSmtpEmail163` + `buildMimeMessage`），不保留兜底 |

## 3. 范围 / 非目标

**范围**：两个云函数发信机制替换为 SES；删除 163 SMTP 与 MIME 构建；新增 `sendViaTencentSES`；环境变量调整；外部 SES 账号/域名/DNS/额度配置说明。

**非目标**：不改 HTML 模板渲染、JSON 契约 prompt、DB 持久化、`/results` 加微信触发、前端；不引入 npm 依赖；不实现 Daily Digest（后续复用 SES）。

---

## 3.5 Operational prerequisites before coding（编码前置门控）

> 详细步骤见 §4；本节是**门控清单**与硬性顺序。

下列前置项必须由运维方（你）在 Tencent 控制台 + DNS 完成，**编码方不可绕过**：

1. **SES account setup** — 中国站（现有账号）开通 SES，地域 `ap-guangzhou`。
2. **Domain verification** — `nanoviga.com` 在 SES 控制台状态 = **Verified**（DNS 记录已加并验证通过）。
3. **Production access / sending quota** — 已申请并获批生产发信权限/额度（非沙箱受限态）。
4. **CAM permissions validation** — 云函数所用 `TENCENT_SECRET_ID/KEY` 实测具备 `ses:SendEmail` 权限。
5. **DNS propagation verification** — SPF/DKIM/所有权记录已全网传播并被 SES 校验通过（控制台显示已验证）。

### 🚦 DEPLOYMENT GATE（硬性）
**实现（编码）可以先写并通过本地单测，但严禁部署/上线，直到：**
- ✅ **SES 域名验证完成（Domain Verified）**，**且**
- ✅ **SES 生产发信权限/额度已获批（Production access approved）**。

两者未同时满足前，不得执行 §8 的云函数部署与 §4.7 首测（届时只会拿到 `DomainNotVerified` / 额度受限错误）。

---

## 4. 外部配置（你方在 Tencent 控制台 + DNS 完成；含前置时间）

> 这些是发信的前置条件，无法自动化。**精确的记录值由 SES 控制台在添加域名时生成**——下文给出记录"类型/位置"，token 以控制台为准，勿照抄示例值。

### 4.1 Tencent SES 账号开通
1. 登录**中国站**控制台 `console.cloud.tencent.com`（与 CloudBase/OCR **同一账号**）→ 产品搜索 **邮件推送 (SES)** → 选择地域 **广州 (`ap-guangzhou`)** → 开通服务。**无需注册国际站账号、无需新密钥。**
2. 确认云函数所用 `TENCENT_SECRET_ID/KEY`（OCR 同一对）对应子账号/角色，在 **CAM** 中拥有 SES 权限（`QcloudSESFullAccess` 或自定义仅含 `ses:SendEmail`、`ses:GetSendEmailStatus`）。

### 4.2 域名验证（`nanoviga.com`）
1. SES 控制台 → **发信域名 (Sender Domains)** → 新建 → 填 `nanoviga.com`。
2. 控制台生成一组待添加的 DNS 记录（见 §4.3）。
3. 在 `nanoviga.com` 的 DNS 托管处（域名注册商 / Vercel DNS / Cloudflare 等）添加这些记录。
4. 回 SES 控制台点击「验证」，状态变为 **已验证 (Verified)** 后方可发信。

### 4.3 DNS 记录（类型与用途；精确值看控制台）
| 用途 | 类型 | 主机/名称 | 值（控制台提供） |
|---|---|---|---|
| 域名所有权验证 | **TXT** | `nanoviga.com`（或控制台指定子名） | 控制台生成的校验 token |
| **SPF**（授权 Tencent 代发） | **TXT** | `nanoviga.com` | 含 Tencent SES include 的 `v=spf1 ...` 串（值看控制台） |
| **DKIM**（签名验真，防伪造/进垃圾箱） | **CNAME**（通常 1–3 条）或 TXT | 控制台给的 selector 主机名 | 控制台给的目标值 |
| **return-path / 自定义 MAIL FROM**（可选，提升对齐） | **CNAME**/MX | 控制台指定子域 | 控制台给的值 |

注意：若 `nanoviga.com` 已有 SPF TXT，需**合并**进同一条（一个域只能有一条 SPF），不要新增第二条。
> **备案说明（已核实）**：发信专用域名**无需 ICP 备案**——仅当域名 A 记录指向大陆服务器才需备案；nanoviga.com A 记录指向 Vercel（海外），故无需备案。域名验证是纯 DNS（TXT/SPF/DKIM），与备案无关。来源：[SES 域名相关问题](https://cloud.tencent.com/document/product/1288/52776)。

### 4.4 发件地址创建
1. 域名验证通过后 → **发信地址 (Sender Addresses)** → 新建 → `bioage@nanoviga.com`，显示名 `BioAge Compass`。
2. 若控制台要求对地址做收件验证，按提示完成（部分情形域名验证即覆盖）。

### 4.5 生产发信权限 / 额度申请
- Tencent SES 新账号常处于**受限/低额度**状态。在控制台 **发信额度 / 配额** 处查看当前每日上限；如不足或处于试用受限，提交**额度申请 / 工单**，简述用途（"个人健康评估报告通知，发往自有 163 邮箱，低频，约个位数/天"）。
- 本场景发信量极低（仅真实线索触发），默认额度通常已足够；如默认即可发，则无需申请。

### 4.6 预期审批时间
| 步骤 | 预期 |
|---|---|
| DNS 记录生效（验证通过） | 数分钟 ~ 数小时（取决于 DNS TTL/传播） |
| 发件地址可用 | 域名验证后即时（或一次邮件点击验证） |
| 额度/生产权限（如需工单） | **1–2 个工作日** |
| 端到端可发首封 | 多数情况 DNS 生效当天；若卡额度审批则 +1~2 工作日 |

### 4.7 首封测试邮件流程
> 前置：先在两个云函数设 **`SES_TEST_RECIPIENT`**（如 `SES_TEST_RECIPIENT=test@example.com`，一个你能查收的测试箱），使首测不发往生产通知箱、且不在文档/命令里硬编码真实邮箱。

1. 代码部署后（§8），直连 SES 云函数端点发一封：
   ```bash
   curl -s -X POST '.../generateReport' -H 'Content-Type: application/json' \
     -d '{"mode":"full","name":"SES测试","age":45,"gender":"male","bioAge":40,"score":75,
          "dimensionScores":{"运动能力":8,"身心平衡":7,"营养代谢":6,"睡眠质量":7,"遗传因素":8,"环境因素":7},
          "contact":"见微信备注 BCA-SES1","assessmentCode":"BCA-SES1"}' --max-time 120
   ```
2. 期望返回 `"emailResult":"sent"`（含 SES `MessageId`）。
3. 到 **`SES_TEST_RECIPIENT`** 收信：发件人显示 **BioAge Compass `<bioage@nanoviga.com>`**、回复地址为 **`support@nanoviga.com`**，HTML 报告正常渲染（无 `**`/`###`、评级徽章、QR、内部条）。检查**垃圾箱**——首发可能先进垃圾箱，标记"非垃圾"以养信誉。
4. 失败时按 `emailResult` 中的 SES `Code` 排查（§6）。
5. 注意：仍处 163 限频无关——SES 是独立通道；但首发后观察 1–2 天送达稳定性。

---

## 5. 代码架构

### 5.1 新增 `sendViaTencentSES`（置于 shared 模块，部署随模板一并内联）
```
sendViaTencentSES({ secretId, secretKey, region, fromAddr, fromName, toAddr, replyTo, subject, html, text })
  → Promise<{ ok: boolean, messageId?: string, error?: string }>
```
- TC3-HMAC-SHA256 签名（复用 `tcSha256Hex`/`tcHmac`；与 OCR 同算法，service 改 `ses`）。
- 请求：`POST https://ses.tencentcloudapi.com`（就近接入，自动路由；亦可用区域域名 `ses.ap-guangzhou.tencentcloudapi.com`），头 `X-TC-Action: SendEmail`、`X-TC-Version: 2020-10-02`、`X-TC-Region: ap-guangzhou`、`Content-Type: application/json; charset=utf-8`。
- Body：
  ```json
  {
    "FromEmailAddress": "BioAge Compass <bioage@nanoviga.com>",
    "Destination": ["<SES_TEST_RECIPIENT || SES_TO>"],
    "ReplyToAddresses": "support@nanoviga.com",
    "Subject": "<subject>",
    "Simple": { "Html": "<base64(html)>", "Text": "<base64(text)>" }
  }
  ```
- 解析：成功 `Response.MessageId` → `{ok:true, messageId}`；错误 `Response.Error.{Code,Message}` → `{ok:false, error: 'Code Message'}`。

### 5.2 删除 163 路径
- `shared/emailTemplate.js`：**移除 `buildMimeMessage`** 及其单测（SMTP MIME 专用，SES 不需要）。保留 `renderEmail`/`assemble*`/`parseModelJson` 等。
- `generateReport/index.js` 与 `analyzeCBA/index.js`：**删除 `sendSmtpEmail163`** 函数与其 TLS 状态机；删除 `EMAIL_163_AUTH_CODE` 读取。

### 5.3 两个云函数的发信块（替换）
原 `if (EMAIL_AUTH_CODE) { await sendSmtpEmail163(...) }` →
```js
const sesCfg = { secretId: process.env.TENCENT_SECRET_ID, secretKey: process.env.TENCENT_SECRET_KEY,
  region: process.env.SES_REGION || 'ap-guangzhou',
  fromAddr: process.env.SES_FROM || 'bioage@nanoviga.com', fromName: 'BioAge Compass',
  replyTo: process.env.SES_REPLY_TO || 'support@nanoviga.com',
  toAddr: process.env.SES_TEST_RECIPIENT || process.env.SES_TO };  // 测试覆盖优先；go-live 前清空 SES_TEST_RECIPIENT
let emailResult = 'skipped';
if (sesCfg.secretId && sesCfg.secretKey && sesCfg.toAddr) {
  const r = await ET.sendViaTencentSES({ ...sesCfg, subject, html: htmlBody, text: textBody });
  emailResult = r.ok ? 'sent' : ('failed: ' + r.error);
}
```
保持：DB 保存在发信**之前**；`await` 发信；`emailResult` 进响应。

### 5.4 环境变量
- 新增（两个函数）：
  - `SES_FROM` = `bioage@nanoviga.com`（代码内有默认值）
  - `SES_REGION` = `ap-guangzhou`（代码内有默认值）
  - `SES_REPLY_TO` = `support@nanoviga.com`（代码内有默认值；回复去向）
  - `SES_TO` = 生产收件箱（**无代码默认、不硬编码 PII**；未配且无测试覆盖则 `emailResult: skipped`）
  - `SES_TEST_RECIPIENT` = 测试收件覆盖（例 `SES_TEST_RECIPIENT=test@example.com`；**设置即覆盖 `SES_TO`，go-live 前必须清空**）
- 复用：`TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`。
  - ⚠️ **`generateReport`（L1）此前未用这两个密钥**（仅 `analyzeCBA` 的 OCR 用）。必须确认**两个函数的环境变量都配置了** `TENCENT_SECRET_ID/KEY`，否则 L1 因缺凭证 → `emailResult: skipped`，邮件不发。部署时逐函数核对环境变量。
- **退役**：`EMAIL_163_AUTH_CODE`（不再读取）。

## 6. 邮件归属与可观测性

### 6.1 邮件归属与回复处理（SES 仅出站）
**Tencent SES 只负责出站发信，不接收任何入站邮件。** 因此发信身份与回复去向需明确：
- **From**：`BioAge Compass <bioage@nanoviga.com>`（SES 验证过的发件身份）。
- **Reply-To**：`support@nanoviga.com`（客户/收件人点"回复"时去向）。
- **入站收信不经 SES**：发往 `bioage@nanoviga.com` 或 `support@nanoviga.com` 的回复邮件，SES **不会**收。必须**另行配置一个真实可收信的邮箱/转发**：
  - 在 `nanoviga.com` 的邮件服务（如企业邮箱 / Google Workspace / 阿里邮箱 / 转发规则）上，为 `support@nanoviga.com`（以及建议为 `bioage@nanoviga.com`）建立可收信的邮箱或**转发到陆大夫常用箱**。
  - 这需要 `nanoviga.com` 配置 **MX 记录**指向所选邮件服务（与 SES 的发信 DNS 记录并存、互不冲突）。
  - **运维门控项**：go-live 前确认 `support@nanoviga.com` 能实际收到测试回复（否则客户回复石沉大海）。
- 本期范围仅做出站迁移；入站邮箱/转发由运维侧按上述配置，不在代码改动内。

### 6.2 错误处理
- `emailResult`：`sent`（含 messageId，可记日志）/ `failed: <Code> <Message>` / `skipped`（无凭证或无收件地址）。
- 常见 SES Code：`InvalidParameterValue.DomainNotVerified`（域名未验证）、`InvalidParameterValue.FromAddressStatusError`（发件地址未就绪）、`FailedOperation.FrequencyLimit`/`LimitExceeded`（额度/频率）、`UnauthorizedOperation`（CAM 无权限）。
- DB 保存先于发信 → 发信失败不丢线索。SES 服务端排队，消除 163 式静默丢失。

## 7. 测试
- **单测**：`sendViaTencentSES` 的 TC3 `stringToSign`/canonical-request 构造测试（纯字符串，无网络，可断言签名输入正确）；模板单测删去 `buildMimeMessage` 相关。
- **本地**：无凭证 + 未验证域名无法真发；仅验证签名构造与 body 形状。
- **部署后**：§4.7 curl → `emailResult: sent` + 163 真机收验。
- 风控/preflight 门控不受影响（仅 `cloud-functions/` 改动）。

## 8. 部署 / 迁移 / 回滚
- 云函数经**旧版腾讯控制台手动部署**（Monaco applyEdits，模板 + `sendViaTencentSES` 内联进各 index.js）；用 `tools/build-deploy.js` 重新生成 `*.deploy.js`。
- 顺序：先确保 §4 外部配置就绪（域名 Verified、地址可用、额度足够）→ 再部署代码 → §4.7 首测。
- **回滚**：保留部署前 `index.js` 副本，重贴即回滚。注意：回滚到 163 版本仍会撞 163 封禁——真正回退是修好 SES，而非回 163。
- 与 Vercel/前端无关；本分支无前端改动。

## 9. 风险与缓解
| 风险 | 缓解 |
|---|---|
| 内联 `Simple` 发信被账号策略拒绝（需注册模板） | 回退：在 SES 控制台注册一个"透传 HTML"模板并审核，改用 `Template`/`TemplateData`；接口层 `sendViaTencentSES` 预留 `template` 分支 |
| SES 新账号额度/沙箱限制 | §4.5 提前申请；本场景低频，默认额度多半够 |
| DNS 传播/SPF 合并错误 | §4.3 注明 SPF 单条合并；验证未过不发码 |
| 国内区(ap-guangzhou)对内容/模板审核较严，内联 Simple 可能被拒 | 见上行回退（注册透传模板）；首发标记非垃圾养信誉；DKIM+SPF 对齐；发件≠收件已消除自发自收标记 |
| CAM 密钥无 SES 权限 | §4.1 步骤2 预检 `QcloudSESFullAccess` |

## 10. 实施顺序（供 plan）
0. **（门控，运维方）** 完成 §3.5 前置 + 满足 🚦DEPLOYMENT GATE（域名 Verified **且** 生产权限获批）。代码 1–5 可在门控未过时先写并跑本地单测，但**部署（步骤 6）必须等门控通过**。
1. shared 模块：新增 `sendViaTencentSES` + TC3 签名（复用）+ 单测；移除 `buildMimeMessage` + 其单测。
2. `generateReport/index.js`：替换发信块为 SES，删 `sendSmtpEmail163`/`EMAIL_163_AUTH_CODE`。
3. `analyzeCBA/index.js`：同上。
4. `tools/build-deploy.js`：重生成 `*.deploy.js`，syntax + load 验证。
5. 文档：`PROJECT_STATUS.md` + §8 备注更新。
6. （你方）§4 外部配置 → 部署 → §4.7 首测。
