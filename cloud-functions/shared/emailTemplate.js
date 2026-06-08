// cloud-functions/shared/emailTemplate.js
// Clinical Conversion Report Email System — canonical shared template (CommonJS, no deps).
// Node.js 18 compatible. Pure functions only (string in → string/obj out), no I/O, no network.
'use strict';

// ── Task 1: esc + mdToInlineHtml ──────────────────────────────────────────────

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Minimal inline Markdown for free-text fields + JSON-failure fallback.
// Escapes first (XSS-safe), then re-introduces only **bold** and line breaks; strips leading #.
function mdToInlineHtml(s) {
  let out = esc(s);
  out = out.replace(/^\s*#{1,6}\s*/gm, '');                      // drop heading marks
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');  // bold
  out = out.replace(/\r?\n/g, '<br>');                            // newlines
  return out;
}

// ── Task 2: PALETTE + computeRating ──────────────────────────────────────────

const PALETTE = {
  bg: '#F4F6F8', card: '#FFFFFF', navy: '#16263F', jade: '#2E9C82',
  ink: '#1F2937', muted: '#6B7280', border: '#E5E7EB',
  rGood: '#2E9C82', rWatch: '#C9831F', rRisk: '#C0453B',
};

function computeRating({ age, bioAge, score }) {
  const ageDiff = Number(age) - Number(bioAge);
  let label, color;
  if (ageDiff >= 3 && score >= 70) { label = '优秀'; color = PALETTE.rGood; }
  else if (ageDiff <= -3 || score < 50) { label = '高风险'; color = PALETTE.rRisk; }
  else { label = '需关注'; color = PALETTE.rWatch; }
  return { label, color, ageDiff };
}

// ── Task 3: headerBar + internalStrip + sectionWrap + footer ─────────────────

function headerBar({ title, date, code }) {
  return `<tr><td style="background:${PALETTE.navy};padding:24px 28px;">
    <div style="color:#fff;font-size:18px;font-weight:700;letter-spacing:.5px;">BioAge Compass</div>
    <div style="color:#cdd7e5;font-size:15px;margin-top:6px;">${esc(title)}</div>
    <div style="color:#8ea1bd;font-size:12px;margin-top:10px;">生成日期 ${esc(date)} · 编号 ${esc(code)}</div>
  </td></tr>`;
}

function internalStrip({ contact, submittedAt, code }) {
  return `<tr><td style="background:#fbfbe8;border-bottom:1px solid ${PALETTE.border};padding:8px 28px;font-size:12px;color:${PALETTE.muted};">
    【内部 · 转发客户前请删除本行】联系：${esc(contact || '—')} · 提交：${esc(submittedAt || '—')} · 编号：${esc(code)}
  </td></tr>`;
}

function sectionWrap(title, innerHtml) {
  return `<tr><td style="padding:22px 28px 0;">
    <div style="font-size:13px;font-weight:700;color:${PALETTE.navy};letter-spacing:1px;border-left:3px solid ${PALETTE.jade};padding-left:9px;margin-bottom:12px;">${esc(title)}</div>
    ${innerHtml}
  </td></tr>`;
}

function footer({ code, date }) {
  return `<tr><td style="padding:24px 28px 28px;border-top:1px solid ${PALETTE.border};">
    <div style="font-size:12px;color:${PALETTE.muted};line-height:1.7;">
      Assessment Code：${esc(code)} · ${esc(date)}<br>
      免责声明：本报告为基于生活方式与指标的健康风险评估，非医疗诊断，不替代执业医师面诊。<br>
      <span style="color:${PALETTE.navy};font-weight:600;">BioAge Compass</span>
    </div>
  </td></tr>`;
}

// ── Task 4: heroCard ──────────────────────────────────────────────────────────

function heroCard({ bioAge, age, agingPaceStr, peerRankStr, rating }) {
  const diff = Number(age) - Number(bioAge);
  const deltaStr = diff > 0 ? `年轻${diff}岁` : diff < 0 ? `偏大${Math.abs(diff)}岁` : '与实际年龄相当';
  const stat = (label, val) =>
    `<td align="center" style="padding:6px;"><div style="font-size:15px;font-weight:700;color:${PALETTE.navy};">${esc(val)}</div><div style="font-size:11px;color:${PALETTE.muted};margin-top:3px;">${esc(label)}</div></td>`;
  return `<tr><td style="padding:22px 28px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:${PALETTE.card};border:1px solid ${PALETTE.border};border-radius:14px;">
      <tr><td align="center" style="padding:20px 16px 8px;">
        <div style="font-size:12px;color:${PALETTE.muted};">身体年龄</div>
        <div style="font-size:46px;font-weight:800;color:${PALETTE.navy};line-height:1;margin:4px 0;">${esc(bioAge)}<span style="font-size:16px;font-weight:500;color:${PALETTE.muted};"> 岁</span></div>
        <div style="display:inline-block;font-size:13px;font-weight:700;color:#fff;background:${rating.color};border-radius:999px;padding:4px 14px;margin-top:4px;">${esc(rating.label)} · 实际 ${esc(age)} 岁（${deltaStr}）</div>
      </td></tr>
      <tr><td style="padding:10px 8px 18px;"><table width="100%" cellpadding="0" cellspacing="0"><tr>
        ${stat('老化速度', agingPaceStr)}${stat('同龄人百分位', peerRankStr)}
      </tr></table></td></tr>
    </table>
  </td></tr>`;
}

// ── Task 5: riskList + mechanismChain ─────────────────────────────────────────

function riskList(risks) {
  const items = (Array.isArray(risks) ? risks : []).slice(0, 3);
  const rows = items.map((r, i) =>
    `<tr><td style="padding:10px 0;border-bottom:1px solid ${PALETTE.border};">
      <table cellpadding="0" cellspacing="0"><tr>
        <td valign="top" style="width:26px;"><div style="width:22px;height:22px;border-radius:999px;background:${PALETTE.navy};color:#fff;font-size:12px;text-align:center;line-height:22px;">${i + 1}</div></td>
        <td style="padding-left:8px;">
          <div style="font-size:14px;font-weight:700;color:${PALETTE.ink};">${esc(r.name)}</div>
          <div style="font-size:13px;color:${PALETTE.muted};margin-top:2px;line-height:1.6;">${esc(r.oneLine)}</div>
        </td>
      </tr></table>
    </td></tr>`).join('');
  return `<table width="100%" cellpadding="0" cellspacing="0">${rows}</table>`;
}

function mechanismChain(items) {
  const arrow = `<div style="text-align:center;color:${PALETTE.jade};font-size:13px;line-height:1.2;">↓</div>`;
  const cell = (label, val) =>
    `<div style="background:${PALETTE.bg};border:1px solid ${PALETTE.border};border-radius:8px;padding:8px 12px;font-size:13px;color:${PALETTE.ink};"><span style="color:${PALETTE.muted};font-size:11px;">${label}</span><br>${esc(val)}</div>`;
  const blocks = (Array.isArray(items) ? items : []).slice(0, 2).map(m =>
    `<div style="margin-bottom:12px;">${cell('原因', m.cause)}${arrow}${cell('生理机制', m.physiology)}${arrow}${cell('结果', m.result)}</div>`).join('');
  return blocks;
}

// ── Task 6: roadmap + conversionCard ─────────────────────────────────────────

function roadmap({ d7, d30, d90 }) {
  const phase = (title, arr) => {
    const lis = (Array.isArray(arr) ? arr : []).slice(0, 4).map(a =>
      `<div style="font-size:13px;color:${PALETTE.ink};line-height:1.7;">✓ ${esc(a)}</div>`).join('');
    return `<div style="background:${PALETTE.card};border:1px solid ${PALETTE.border};border-radius:10px;padding:12px 14px;margin-bottom:10px;">
      <div style="font-size:13px;font-weight:700;color:${PALETTE.jade};margin-bottom:6px;">${title}</div>${lis}</div>`;
  };
  return phase('未来 7 天', d7) + phase('未来 30 天', d30) + phase('未来 90 天', d90);
}

function conversionCard({ kind, code, wechatId, qrUrl }) {
  const bullets = kind === 'CBA'
    ? ['复查关键生化指标的改善趋势', '动态追踪各器官衰老速度', '迭代你的个体化逆龄方案']
    : ['哪些指标真正推动身体年龄升高', '哪个器官衰老最快', '如何制定个体化逆龄方案'];
  const cta = kind === 'CBA'
    ? '建议按方案随访，并与陆医生持续沟通调整。'
    : '建议完成 CBA 深度评估，并与陆医生进一步交流。';
  const ticks = bullets.map(b =>
    `<div style="font-size:13px;color:${PALETTE.ink};line-height:1.8;">✓ ${esc(b)}</div>`).join('');
  return `<tr><td style="padding:22px 28px 0;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:#f0faf6;border:1px solid ${PALETTE.jade};border-radius:14px;">
      <tr><td style="padding:18px 20px;">
        <div style="font-size:15px;font-weight:700;color:${PALETTE.navy};margin-bottom:10px;">下一步如何进一步降低身体年龄？</div>
        ${ticks}
        <div style="font-size:13px;color:${PALETTE.muted};margin:10px 0 14px;line-height:1.7;">${cta}</div>
        <table cellpadding="0" cellspacing="0"><tr>
          <td valign="middle"><img src="${esc(qrUrl)}" width="96" height="96" alt="陆医生微信" style="display:block;border:1px solid ${PALETTE.border};border-radius:8px;"></td>
          <td valign="middle" style="padding-left:14px;">
            <div style="font-size:13px;color:${PALETTE.muted};">添加陆医生微信</div>
            <div style="font-size:18px;font-weight:800;color:${PALETTE.navy};letter-spacing:.5px;">${esc(wechatId)}</div>
            <div style="font-size:12px;color:${PALETTE.jade};margin-top:4px;">添加请备注编号 ${esc(code)}</div>
          </td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>`;
}

// ── Task 7: parseModelJson ────────────────────────────────────────────────────

function parseModelJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a !== -1 && b !== -1 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (_) { return null; }
}

// ── Task 8: assembleL1Sections + assembleCbaSections ─────────────────────────

const WECHAT_ID = 'Charlie20850';
const QR_URL = 'https://nanoviga.com/wechat-qr.png';

function _assemble(kind, data, parsed, rawText, heroTitle) {
  const rating = computeRating({ age: data.age, bioAge: data.bioAge, score: data.score });
  const base = {
    internal: { contact: data.contact, submittedAt: data.submittedAt, code: data.assessmentCode },
    header: { title: heroTitle, date: data.date, code: data.assessmentCode },
    hero: { bioAge: data.bioAge, age: data.age, agingPaceStr: data.agingPaceStr, peerRankStr: data.peerRankStr, rating },
    conversion: { kind, code: data.assessmentCode, wechatId: WECHAT_ID, qrUrl: QR_URL },
    footer: { code: data.assessmentCode, date: data.date },
    risks: [], mechanism: [], roadmap: { d7: [], d30: [], d90: [] }, fallbackHtml: null,
  };
  if (!parsed) { base.fallbackHtml = mdToInlineHtml(rawText || '（报告生成异常，请稍后重试）'); return base; }
  base.risks = Array.isArray(parsed.risks) ? parsed.risks : [];
  base.mechanism = Array.isArray(parsed.mechanism) ? parsed.mechanism : [];
  base.roadmap = parsed.roadmap && typeof parsed.roadmap === 'object' ? parsed.roadmap : base.roadmap;
  return base;
}

function assembleL1Sections(data, parsed, rawText) {
  return _assemble('L1', data, parsed, rawText, '身体年龄风险评估报告');
}

function assembleCbaSections(data, parsed, rawText) {
  return _assemble('CBA', data, parsed, rawText, 'CBA 临床生化年龄报告');
}

// ── Task 9: renderEmail ───────────────────────────────────────────────────────

function renderEmail(a) {
  const body = a.fallbackHtml
    ? sectionWrap('评估报告', `<div style="font-size:13px;color:${PALETTE.ink};line-height:1.8;">${a.fallbackHtml}</div>`)
    : sectionWrap('三大关键风险', riskList(a.risks))
      + sectionWrap('风险形成机制', mechanismChain(a.mechanism))
      + sectionWrap('行动路线图', roadmap(a.roadmap));
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:${PALETTE.bg};">
<table width="100%" cellpadding="0" cellspacing="0" style="background:${PALETTE.bg};"><tr><td align="center" style="padding:16px 10px;">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:${PALETTE.card};border-radius:16px;overflow:hidden;font-family:-apple-system,'PingFang SC','Microsoft YaHei',sans-serif;">
  ${internalStrip(a.internal)}
  ${headerBar(a.header)}
  ${heroCard(a.hero)}
  ${body}
  ${conversionCard(a.conversion)}
  ${footer(a.footer)}
</table>
</td></tr></table>
</body></html>`;
}

// ── Task 10: buildMimeMessage ─────────────────────────────────────────────────

function buildMimeMessage({ fromEmail, toEmail, subject, textBody, htmlBody }) {
  const b64 = s => Buffer.from(String(s), 'utf8').toString('base64');
  const boundary = 'nvbnd_' + Date.now().toString(36);
  const dotStuff = s => String(s).replace(/\r?\n/g, '\r\n').replace(/^\./gm, '..');
  return (
    `From: BioAge Compass <${fromEmail}>\r\n` +
    `To: ${toEmail}\r\n` +
    `Subject: =?utf-8?B?${b64(subject)}?=\r\n` +
    `MIME-Version: 1.0\r\n` +
    `Content-Type: multipart/alternative; boundary="${boundary}"\r\n\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n\r\n` +
    `${dotStuff(textBody)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: text/html; charset=utf-8\r\n\r\n` +
    `${dotStuff(htmlBody)}\r\n` +
    `--${boundary}--`
  );
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
  esc,
  mdToInlineHtml,
  PALETTE,
  computeRating,
  headerBar,
  internalStrip,
  sectionWrap,
  footer,
  heroCard,
  riskList,
  mechanismChain,
  roadmap,
  conversionCard,
  parseModelJson,
  renderEmail,
  assembleL1Sections,
  assembleCbaSections,
  buildMimeMessage,
};
