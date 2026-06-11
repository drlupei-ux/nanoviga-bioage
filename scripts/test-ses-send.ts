/**
 * BioAge Compass — Tencent SES API 连通性测试（独立脚本，非生产代码，不被 Next 构建打包）。
 *
 * 用 SES SendEmail API（非 SMTP）发一封测试邮件，验证 region/凭证/发信域名/发件地址/额度是否就绪。
 * 也可在配置过程中当"就绪探针"：未就绪时会返回带提示的错误码（如 DomainNotVerified）。
 *
 * 不硬编码收件人 PII：收件人来自环境变量 SES_TEST_RECIPIENT。
 *
 * 运行：
 *   export TENCENT_SECRET_ID=AKID...           # 中国站账号密钥（与 OCR 同一对）
 *   export TENCENT_SECRET_KEY=...
 *   export SES_REGION=ap-guangzhou             # 可选，默认 ap-guangzhou
 *   export SES_TEST_RECIPIENT=you@163.com      # 你的 163 测试箱（必填）
 *   export SES_FROM=bioage@nanoviga.com        # 可选，默认 bioage@nanoviga.com
 *   export SES_REPLY_TO=support@nanoviga.com   # 可选，默认 support@nanoviga.com
 *   npx tsx scripts/test-ses-send.ts           # 首次会自动安装 tsx
 *
 * 退出码：0=发送成功，1=API 返回错误/运行异常，2=缺少环境变量。
 */
import { createHash, createHmac } from "crypto";
import { request } from "https";

const HOST = "ses.tencentcloudapi.com";
const SERVICE = "ses";
const ACTION = "SendEmail";
const VERSION = "2020-10-02";

const sha256hex = (s: string): string => createHash("sha256").update(s, "utf8").digest("hex");
const hmac = (key: string | Buffer, s: string): Buffer => createHmac("sha256", key).update(s, "utf8").digest();

/** TC3-HMAC-SHA256 签名（与云函数 OCR 同算法；仅签 content-type;host）。 */
function sign(secretId: string, secretKey: string, region: string, payload: string) {
  const ts = Math.floor(Date.now() / 1000);
  const date = new Date(ts * 1000).toISOString().slice(0, 10); // UTC YYYY-MM-DD
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${HOST}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = ["POST", "/", "", canonicalHeaders, signedHeaders, sha256hex(payload)].join("\n");
  const scope = `${date}/${SERVICE}/tc3_request`;
  const stringToSign = ["TC3-HMAC-SHA256", String(ts), scope, sha256hex(canonicalRequest)].join("\n");
  const kSigning = hmac(hmac(hmac("TC3" + secretKey, date), SERVICE), "tc3_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");
  const authorization =
    `TC3-HMAC-SHA256 Credential=${secretId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { authorization, ts };
}

function post(headers: Record<string, string>, body: string): Promise<{ status: number; json: any }> {
  return new Promise((resolve, reject) => {
    const req = request({ hostname: HOST, path: "/", method: "POST", headers }, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve({ status: res.statusCode || 0, json: JSON.parse(data) }); }
        catch { resolve({ status: res.statusCode || 0, json: { raw: data } }); }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

const HINTS: Record<string, string> = {
  "InvalidParameterValue.DomainNotVerified": "发信域名未验证：在 SES 控制台完成 nanoviga.com 的 DNS 验证（TXT/SPF/DKIM）。",
  "InvalidParameterValue.FromAddressStatusError": "发件地址未就绪：在 SES 控制台创建并验证 bioage@nanoviga.com。",
  "InvalidParameterValue.FromAddressNotVerified": "发件地址未验证：同上。",
  "UnauthorizedOperation": "CAM 无 SES 权限：给该密钥子账号绑定 QcloudSESFullAccess 或 ses:SendEmail。",
  "AuthFailure.SignatureFailure": "签名失败：核对 SecretId/Key 与系统时钟是否准确。",
  "FailedOperation.FrequencyLimit": "频率受限：稍后再试；或检查 SES 发信配额。",
  "LimitExceeded": "额度超限：检查/申请 SES 发信配额（工单）。",
};

async function main(): Promise<void> {
  const secretId = process.env.TENCENT_SECRET_ID;
  const secretKey = process.env.TENCENT_SECRET_KEY;
  const region = process.env.SES_REGION || "ap-guangzhou";
  const fromAddr = process.env.SES_FROM || "bioage@nanoviga.com";
  const fromName = "BioAge Compass";
  const replyTo = process.env.SES_REPLY_TO || "support@nanoviga.com";
  const to = process.env.SES_TEST_RECIPIENT;

  const missing: string[] = [];
  if (!secretId) missing.push("TENCENT_SECRET_ID");
  if (!secretKey) missing.push("TENCENT_SECRET_KEY");
  if (!to) missing.push("SES_TEST_RECIPIENT");
  if (missing.length) {
    console.error("❌ 缺少环境变量: " + missing.join(", "));
    console.error("   例: export SES_TEST_RECIPIENT=you@163.com");
    process.exit(2);
  }

  const stamp = new Date().toISOString();
  const html =
    `<!DOCTYPE html><html><body style="font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;color:#1F2937">` +
    `<h2 style="color:#16263F;margin:0 0 8px">BioAge Compass — SES 连通性测试</h2>` +
    `<p>看到这封 HTML 邮件即表示 Tencent SES API 发信链路已打通。</p>` +
    `<p style="font-size:12px;color:#6B7280">region: <b>${region}</b> · from: <b>${fromName} &lt;${fromAddr}&gt;</b> · ${stamp}</p>` +
    `</body></html>`;
  const text = `BioAge Compass SES 连通性测试\n收到即表示 SES API 发信已打通。region=${region} from=${fromAddr} ${stamp}`;

  const payload = JSON.stringify({
    FromEmailAddress: `${fromName} <${fromAddr}>`,
    Destination: [to],
    ReplyToAddresses: replyTo,
    Subject: "BioAge Compass SES Test",
    Simple: {
      Html: Buffer.from(html, "utf8").toString("base64"),
      Text: Buffer.from(text, "utf8").toString("base64"),
    },
  });

  const { authorization, ts } = sign(secretId as string, secretKey as string, region, payload);
  const headers: Record<string, string> = {
    Authorization: authorization,
    "Content-Type": "application/json; charset=utf-8",
    Host: HOST,
    "X-TC-Action": ACTION,
    "X-TC-Timestamp": String(ts),
    "X-TC-Version": VERSION,
    "X-TC-Region": region,
  };

  console.log(`→ SES SendEmail  region=${region}  from="${fromName} <${fromAddr}>"  to=${to}  replyTo=${replyTo}`);
  const { status, json } = await post(headers, payload);
  const r = json?.Response ?? json;

  if (r?.MessageId) {
    console.log("✅ 发送成功");
    console.log("   MessageId:", r.MessageId);
    console.log("   RequestId:", r.RequestId);
    console.log(`   去 ${to} 收件箱（含垃圾箱）确认收到主题「BioAge Compass SES Test」。`);
    process.exit(0);
  }

  const err = r?.Error;
  const code: string | undefined = err?.Code;
  console.error("❌ 发送失败  HTTP", status);
  console.error("   Code:", code ?? "(none)");
  console.error("   Message:", err?.Message ?? JSON.stringify(json));
  console.error("   RequestId:", r?.RequestId ?? "(none)");
  if (code && HINTS[code]) console.error("   提示:", HINTS[code]);
  else if (code) console.error("   提示: 见 https://cloud.tencent.com/document/product/1288/51034 错误码表。");
  process.exit(1);
}

main().catch((e) => {
  console.error("❌ 运行异常:", e);
  process.exit(1);
});
