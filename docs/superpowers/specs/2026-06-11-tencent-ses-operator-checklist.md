# Tencent SES Go-Live — Operator Checklist（运维操作手册）

> 配套设计 spec：`2026-06-11-tencent-ses-email-backbone-design.md`。
> 发件 `BioAge Compass <bioage@nanoviga.com>` · Reply-To `support@nanoviga.com` · Region `ap-hongkong` · DNS 托管在**阿里云**。
> 🚦 **门控：代码不部署，直到第 3 步域名 Verified 且第 6 步生产权限获批。** 精确的 DNS 值由 Tencent SES 控制台生成——**照抄控制台，勿用本文档示例值**。

---

## 1. Tencent SES 账号开通
- [ ] 登录国际站 `console.intl.cloud.tencent.com`（用承载云函数的同一个腾讯云账号；OCR 已在用其密钥）。
- [ ] 产品搜索 **Simple Email Service / 邮件推送** → 开通服务。
- [ ] 准备好云函数所用的 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY`（与 OCR 同一对）。

## 2. SES Region 选择
- [ ] 在 SES 控制台右上角地域切到 **Hong Kong（`ap-hongkong`）**。
- [ ] 原因：nanoviga.com 未 ICP 备案；`ap-hongkong` 国际区**无需备案**，仍可投递 163。后续所有操作都在此地域。

## 3. 域名验证（`nanoviga.com`）
- [ ] SES 控制台 → **发信域名 / Sender Domains** → 新建 → 输入 `nanoviga.com`。
- [ ] 控制台生成一组 DNS 记录（所有权 TXT、SPF、DKIM，可能含 return-path）。**截图/复制这组值**。
- [ ] 按第 4 步把记录加进阿里云 DNS。
- [ ] DNS 生效后回控制台点 **验证 / Verify** → 状态变 **Verified（已验证）**。
- [ ] 发信域名验证通过后 → **发信地址 / Sender Addresses** → 新建 `bioage@nanoviga.com`，显示名 `BioAge Compass`；如要求点击邮件验证则完成。

## 4. 阿里云 DNS 需添加的记录
路径：阿里云控制台 → **云解析 DNS** → 域名列表 → `nanoviga.com` → **解析设置** → **添加记录**。

阿里云「**主机记录**」= 完整名去掉 `.nanoviga.com`（根域用 `@`）。例：腾讯给 `abc._domainkey.nanoviga.com` → 主机记录填 `abc._domainkey`。

| # | 用途 | 阿里云「记录类型」 | 「主机记录」 | 「记录值」 | 「TTL」 |
|---|---|---|---|---|---|
| 4.1 | 域名所有权 | **TXT** | `@`（或腾讯指定子名对应的主机记录） | 腾讯控制台给的校验串 | 10 分钟 |
| 4.2 | **SPF**（出站授权） | **TXT** | `@` | 腾讯给的 `v=spf1 include:... ~all` | 10 分钟 |
| 4.3 | **DKIM**（防伪/进收件箱，常 1–3 条） | **CNAME**（或 TXT，按控制台） | 腾讯给的 selector 主机名（去 `.nanoviga.com`） | 腾讯给的目标值 | 10 分钟 |
| 4.4 | return-path（可选） | **CNAME**/MX（按控制台） | 腾讯给的子域 | 腾讯给的值 | 10 分钟 |
| 4.5 | **收信 MX**（为 Reply-To 收信，见第 10 步） | **MX** | `@`（或 `support`） | 你选的邮件服务 MX（**非 SES**） | 10 分钟 |

⚠️ **SPF 单条**：`nanoviga.com` 若已有 SPF TXT（如 Vercel/其他），**合并**进同一条，不要建第二条 TXT-SPF。
⚠️ DKIM 用 **CNAME** 时，确保该主机记录下没有冲突的同名记录。

## 5. CAM 权限要求
- [ ] 控制台 → **访问管理 CAM** → 找到 `TENCENT_SECRET_ID` 对应的子用户/角色。
- [ ] 绑定策略：**`QcloudSESFullAccess`**（或最小权限自定义：`ses:SendEmail`、`ses:GetSendEmailStatus`）。
- [ ] 验证：用该密钥能在控制台/CLI 成功调用一次 `SendEmail`（或留待第 8 步实测）。

## 6. 生产发信权限 / 额度申请
- [ ] SES 控制台查看 **发信额度 / 配额** 当前每日上限与是否处于受限/试用态。
- [ ] 若受限或额度不足 → 提交**额度申请 / 工单**，用途填："个人健康评估报告通知邮件，发往自有邮箱，低频约个位数/天"。
- [ ] 本场景量极低；若默认额度即可发，可跳过工单。
- [ ] **门控**：本步「生产权限获批 / 额度可用」+ 第 3 步「域名 Verified」，二者齐 → 才允许部署代码。

## 7. 预期审批时间
| 事项 | 预期 |
|---|---|
| 阿里云 DNS 记录生效 → SES 验证通过 | 数分钟 ~ 数小时（看 TTL/传播） |
| 发件地址可用 | 域名验证后即时（或一次点击验证） |
| 额度/生产权限（如需工单） | **1–2 个工作日** |
| 可发首封 | DNS 当天；卡工单则 +1~2 工作日 |

## 8. SES 就绪验证（部署前自检）
- [ ] SES 控制台：发信域名 **Verified**、发件地址 **可用**。
- [ ] DNS 自检（命令行任选）：
  ```bash
  dig +short TXT nanoviga.com        # 应见 SPF + 所有权 TXT
  dig +short CNAME <selector>._domainkey.nanoviga.com   # DKIM 目标值
  ```
- [ ] 额度：非受限/沙箱，每日上限 ≥ 预期。
- [ ] CAM：密钥具备 `ses:SendEmail`。
- [ ] 两个云函数环境变量待配：`SES_FROM=bioage@nanoviga.com`、`SES_REGION=ap-hongkong`、`SES_REPLY_TO=support@nanoviga.com`、`SES_TEST_RECIPIENT=<你的测试箱>`、`TENCENT_SECRET_ID/KEY`（**L1 此前没配，需补**）。生产箱 `SES_TO` 先留空，go-live 再填。

## 9. 首封测试邮件流程
- [ ] 代码部署后（云函数控制台手动部署，见 spec §8），设好 `SES_TEST_RECIPIENT=<你的测试箱>`。
- [ ] 发一封：
  ```bash
  curl -s -X POST 'https://bioage-compass-prod-9chaf35e573d-1405252881.ap-shanghai.app.tcloudbase.com/generateReport' \
    -H 'Content-Type: application/json' \
    -d '{"mode":"full","name":"SES测试","age":45,"gender":"male","bioAge":40,"score":75,"dimensionScores":{"运动能力":8,"身心平衡":7,"营养代谢":6,"睡眠质量":7,"遗传因素":8,"环境因素":7},"contact":"见微信备注 BCA-SES1","assessmentCode":"BCA-SES1"}' --max-time 120
  ```
- [ ] 期望 `"emailResult":"sent"`（含 `MessageId`）。
- [ ] 测试箱收信：发件人 **BioAge Compass `<bioage@nanoviga.com>`**、回复 **`support@nanoviga.com`**、HTML 正常渲染。查**垃圾箱**并标"非垃圾"。
- [ ] 失败按 `emailResult` 的 SES `Code` 排查（`DomainNotVerified` / `FromAddressStatusError` / `UnauthorizedOperation` / 额度类）。
- [ ] CBA 同法测 `analyzeCBA`。

## 10. Go-Live 清单
- [ ] 两个函数已部署 SES 版（无 `sendSmtpEmail163` 残留），syntax/load 通过。
- [ ] 两函数环境变量齐：`TENCENT_SECRET_ID/KEY`、`SES_FROM`、`SES_REGION`、`SES_REPLY_TO`、`SES_TO=<生产通知箱>`。
- [ ] **`SES_TEST_RECIPIENT` 已清空**（否则线上邮件会发到测试箱）。
- [ ] `EMAIL_163_AUTH_CODE` 已退役（不再被读取，可删）。
- [ ] **Reply-To 收信落地**：`support@nanoviga.com` 已有真实邮箱/转发（第 4.5 MX + 邮件服务），实测能收到一封回复测试。
- [ ] 用生产 `SES_TO` 走一遍真实 L1 流程（结果页点"加微信"触发）→ 通知箱收到 HTML 报告。
- [ ] 观察 1–2 天送达稳定（不进垃圾箱）。
- [ ] 留存部署前 `index.js` 备份以备回滚。
