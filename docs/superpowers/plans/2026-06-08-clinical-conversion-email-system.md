# Clinical Conversion Report Email System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain-text Markdown emails from `generateReport` (L1) and `analyzeCBA` (CBA) with a professional, mobile-first, conversion-oriented HTML email rendered deterministically from structured model JSON.

**Architecture:** The DeepSeek model returns structured **JSON** (rating/risks/mechanism/roadmap) instead of Markdown. A canonical, unit-tested `cloud-functions/shared/emailTemplate.js` holds all pure logic — escaping, rating, section renderers, `renderEmail`, data assembly, and the MIME multipart builder. Each `index.js` becomes thin wiring (prompt → parse → assemble → render → SMTP) with the template **inlined** at deploy time (CloudBase Monaco is single-file). The hero stats card and the WeChat/CBA conversion card are fixed template output, never model-generated.

**Tech Stack:** Node.js 18 (CloudBase runtime, no npm deps), Node built-in `node:test` + `assert`, hand-rolled 163 SMTP over TLS, DeepSeek chat API. Deploy: Vercel for nothing here; cloud functions via Tencent legacy console (manual).

**Spec:** `docs/superpowers/specs/2026-06-08-clinical-conversion-email-system-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `cloud-functions/shared/emailTemplate.js` (create) | **Canonical** pure module: `PALETTE`, `esc`, `mdToInlineHtml`, `computeRating`, section renderers, `renderEmail`, `assembleL1Sections`, `assembleCbaSections`, `parseModelJson`, `buildMimeMessage`. CommonJS, zero deps. |
| `cloud-functions/shared/emailTemplate.test.js` (create) | `node:test` unit tests for every exported pure function. |
| `tools/email-preview.js` (create) | Requires the shared module; renders representative L1 + CBA samples to `tools/preview/L1.html` / `CBA.html` for browser + multi-client visual QA. |
| `cloud-functions/generateReport/index.js` (modify) | L1: JSON prompt, parse+fallback, `assembleL1Sections` → `renderEmail`, multipart HTML SMTP, inlined template. |
| `cloud-functions/analyzeCBA/index.js` (modify) | CBA variant of the same wiring. |
| `runtime/CLAUDE.md` §8 + `PROJECT_STATUS.md` (modify) | Document HTML/multipart email + JSON contract. |

**Canonical-vs-deploy rule:** `shared/emailTemplate.js` is the single source of truth and is the only copy that is unit-tested. At deploy (Task 14) its contents are pasted into each `index.js` between `// ==EMAIL_TEMPLATE_START==` / `// ==EMAIL_TEMPLATE_END==` markers. In-repo, each `index.js` `require`s `../shared/emailTemplate` so local runs work; the deploy step replaces that `require` with the inlined block.

**Exported signatures (must stay consistent across tasks):**
```
PALETTE: { bg, card, navy, jade, ink, muted, border, rGood, rWatch, rRisk }
esc(s) -> string
mdToInlineHtml(s) -> string
computeRating({ age, bioAge, score }) -> { label, color, ageDiff }   // label ∈ 优秀|需关注|高风险
headerBar({ title, date, code }) -> string
internalStrip({ contact, submittedAt, code }) -> string
footer({ code, date }) -> string
sectionWrap(title, innerHtml) -> string
heroCard({ bioAge, age, agingPaceStr, peerRankStr, rating }) -> string   // rating = computeRating(...)
riskList(risks) -> string            // risks: [{name, oneLine}], rendered max 3
mechanismChain(items) -> string      // items: [{cause, physiology, result}]
roadmap({ d7, d30, d90 }) -> string  // each: string[]
conversionCard({ kind, code, wechatId, qrUrl }) -> string   // kind ∈ 'L1'|'CBA'
parseModelJson(raw) -> object|null
renderEmail(args) -> string          // args shape defined in Task 9
assembleL1Sections(data, parsed, rawText) -> renderEmailArgs
assembleCbaSections(data, parsed, rawText) -> renderEmailArgs
buildMimeMessage({ fromEmail, toEmail, subject, textBody, htmlBody }) -> string
```

**Run tests:** `node --test cloud-functions/shared/` (Node 18, no deps).

---

### Task 1: Scaffold module + `esc` + `mdToInlineHtml`

**Files:**
- Create: `cloud-functions/shared/emailTemplate.js`
- Test: `cloud-functions/shared/emailTemplate.test.js`

- [ ] **Step 1: Write the failing test**

```js
// cloud-functions/shared/emailTemplate.test.js
const test = require('node:test');
const assert = require('node:assert');
const T = require('./emailTemplate');

test('esc escapes HTML-significant chars', () => {
  assert.strictEqual(T.esc('<a> & "x" \'y\''), '&lt;a&gt; &amp; &quot;x&quot; &#39;y&#39;');
});

test('mdToInlineHtml converts **bold** and strips heading marks, escapes html', () => {
  const out = T.mdToInlineHtml('### **风险** <b>x</b>\n下一行');
  assert.ok(out.includes('<strong>风险</strong>'), 'bold rendered');
  assert.ok(!out.includes('###') && !out.includes('**'), 'no raw markdown');
  assert.ok(out.includes('&lt;b&gt;'), 'inner html escaped');
  assert.ok(out.includes('<br>'), 'newline -> br');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test cloud-functions/shared/`
Expected: FAIL — `Cannot find module './emailTemplate'`.

- [ ] **Step 3: Write minimal implementation**

```js
// cloud-functions/shared/emailTemplate.js
// Clinical Conversion Report Email System — canonical shared template (CommonJS, no deps).
'use strict';

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// Minimal inline Markdown for free-text fields + JSON-failure fallback.
// Escapes first (XSS-safe), then re-introduces only **bold** and line breaks; strips leading #.
function mdToInlineHtml(s) {
  let out = esc(s);
  out = out.replace(/^\s*#{1,6}\s*/gm, '');                 // drop heading marks
  out = out.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>'); // bold
  out = out.replace(/\r?\n/g, '<br>');                       // newlines
  return out;
}

module.exports = { esc, mdToInlineHtml };
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node --test cloud-functions/shared/`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add cloud-functions/shared/emailTemplate.js cloud-functions/shared/emailTemplate.test.js
git commit -m "feat(email): shared template scaffold + esc + mdToInlineHtml"
```

---

### Task 2: `computeRating`

**Files:**
- Modify: `cloud-functions/shared/emailTemplate.js`
- Test: `cloud-functions/shared/emailTemplate.test.js`

- [ ] **Step 1: Write the failing test**

```js
test('computeRating: 优秀 needs ageDiff>=3 AND score>=70', () => {
  assert.strictEqual(T.computeRating({ age: 45, bioAge: 40, score: 75 }).label, '优秀');
  assert.strictEqual(T.computeRating({ age: 45, bioAge: 42, score: 95 }).label, '需关注'); // diff=3 ok but...wait
});
test('computeRating: 高风险 when ageDiff<=-3 OR score<50', () => {
  assert.strictEqual(T.computeRating({ age: 45, bioAge: 49, score: 80 }).label, '高风险'); // diff=-4
  assert.strictEqual(T.computeRating({ age: 45, bioAge: 44, score: 40 }).label, '高风险'); // score<50
});
test('computeRating: 需关注 otherwise, returns color + ageDiff', () => {
  const r = T.computeRating({ age: 45, bioAge: 44, score: 60 });
  assert.strictEqual(r.label, '需关注');
  assert.strictEqual(r.ageDiff, 1);
  assert.ok(r.color.startsWith('#'));
});
```

> Note: in the 优秀 test the second case `bioAge:42,score:95` → ageDiff=3, score≥70 → 优秀. Fix the assertion to `'优秀'` before running.

- [ ] **Step 2: Run to verify fail**

Run: `node --test cloud-functions/shared/`
Expected: FAIL — `T.computeRating is not a function`.

- [ ] **Step 3: Implement**

```js
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

module.exports = { esc, mdToInlineHtml, PALETTE, computeRating };
```
Fix the noted assertion in the test to expect `'优秀'`.

- [ ] **Step 4: Run to verify pass**

Run: `node --test cloud-functions/shared/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add cloud-functions/shared/
git commit -m "feat(email): computeRating with confirmed thresholds"
```

---

### Task 3: `sectionWrap` + `headerBar` + `internalStrip` + `footer`

**Files:** Modify `cloud-functions/shared/emailTemplate.js`; Test `cloud-functions/shared/emailTemplate.test.js`

- [ ] **Step 1: Write failing test**

```js
test('headerBar shows title, date, code', () => {
  const h = T.headerBar({ title: '身体年龄风险评估报告', date: '2026-06-08', code: 'BCA-9X2A' });
  assert.ok(h.includes('BioAge Compass') && h.includes('身体年龄风险评估报告'));
  assert.ok(h.includes('2026-06-08') && h.includes('BCA-9X2A'));
});
test('internalStrip is labelled removable and shows ops data', () => {
  const s = T.internalStrip({ contact: '见微信备注', submittedAt: '2026-06-08 10:00', code: 'BCA-9X2A' });
  assert.ok(s.includes('转发') && s.includes('删除'));
  assert.ok(s.includes('见微信备注') && s.includes('BCA-9X2A'));
});
test('sectionWrap wraps a titled section', () => {
  assert.ok(T.sectionWrap('三大关键风险', '<p>x</p>').includes('三大关键风险'));
});
test('footer shows code + disclaimer', () => {
  const f = T.footer({ code: 'BCA-9X2A', date: '2026-06-08' });
  assert.ok(f.includes('BCA-9X2A') && f.includes('免责') && f.includes('BioAge Compass'));
});
```

- [ ] **Step 2: Run to verify fail** — `node --test cloud-functions/shared/` → FAIL (functions undefined).

- [ ] **Step 3: Implement**

```js
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

Object.assign(module.exports, { headerBar, internalStrip, sectionWrap, footer });
```

- [ ] **Step 4: Run to verify pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add cloud-functions/shared/
git commit -m "feat(email): header/internal-strip/section-wrap/footer renderers"
```

---

### Task 4: `heroCard`

**Files:** Modify shared module + test.

- [ ] **Step 1: Failing test**

```js
test('heroCard shows bioAge, delta, stats, rating badge', () => {
  const rating = T.computeRating({ age: 45, bioAge: 40, score: 75 });
  const h = T.heroCard({ bioAge: 40, age: 45, agingPaceStr: '0.89x', peerRankStr: '前28%', rating });
  assert.ok(h.includes('40'), 'bioAge');
  assert.ok(h.includes('年轻5岁'), 'delta phrase');
  assert.ok(h.includes('0.89x') && h.includes('前28%'));
  assert.ok(h.includes('优秀'), 'rating label');
  assert.ok(h.includes(rating.color), 'rating color applied');
});
```

- [ ] **Step 2: Run fail** — FAIL.

- [ ] **Step 3: Implement**

```js
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
Object.assign(module.exports, { heroCard });
```

- [ ] **Step 4: Run pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add cloud-functions/shared/
git commit -m "feat(email): heroCard bioAge overview"
```

---

### Task 5: `riskList` + `mechanismChain`

**Files:** Modify shared module + test.

- [ ] **Step 1: Failing test**

```js
test('riskList renders numbered items and caps at 3', () => {
  const out = T.riskList([
    { name: '营养代谢失衡', oneLine: '代谢效率下降' },
    { name: '睡眠不足', oneLine: '皮质醇升高' },
    { name: '炎症偏高', oneLine: 'hsCRP 升高' },
    { name: '第四条', oneLine: '应被丢弃' },
  ]);
  assert.ok(out.includes('营养代谢失衡') && out.includes('皮质醇升高'));
  assert.ok(!out.includes('第四条'), 'capped at 3');
});
test('mechanismChain shows 原因/机制/结果', () => {
  const out = T.mechanismChain([{ cause: '久坐', physiology: '胰岛素抵抗', result: '加速衰老' }]);
  assert.ok(out.includes('久坐') && out.includes('胰岛素抵抗') && out.includes('加速衰老'));
});
```

- [ ] **Step 2: Run fail** — FAIL.

- [ ] **Step 3: Implement**

```js
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
Object.assign(module.exports, { riskList, mechanismChain });
```

- [ ] **Step 4: Run pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add cloud-functions/shared/
git commit -m "feat(email): riskList (cap 3) + mechanismChain"
```

---

### Task 6: `roadmap` + `conversionCard`

**Files:** Modify shared module + test.

- [ ] **Step 1: Failing test**

```js
test('roadmap renders 7/30/90 phases with actions', () => {
  const out = T.roadmap({ d7: ['每天走6000步'], d30: ['复查hsCRP'], d90: ['体脂下降3%'] });
  assert.ok(out.includes('7') && out.includes('30') && out.includes('90'));
  assert.ok(out.includes('每天走6000步') && out.includes('复查hsCRP') && out.includes('体脂下降3%'));
});
test('conversionCard L1 pushes CBA + shows wechat + qr; CBA variant pushes follow-up', () => {
  const l1 = T.conversionCard({ kind: 'L1', code: 'BCA-9X2A', wechatId: 'Charlie20850', qrUrl: 'https://nanoviga.com/wechat-qr.png' });
  assert.ok(l1.includes('CBA') && l1.includes('Charlie20850') && l1.includes('BCA-9X2A'));
  assert.ok(l1.includes('nanoviga.com/wechat-qr.png'));
  const cba = T.conversionCard({ kind: 'CBA', code: 'CBA-1', wechatId: 'Charlie20850', qrUrl: 'https://nanoviga.com/wechat-qr.png' });
  assert.ok(cba.includes('逆龄') || cba.includes('随访'), 'CBA variant copy');
});
```

- [ ] **Step 2: Run fail** — FAIL.

- [ ] **Step 3: Implement**

```js
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
Object.assign(module.exports, { roadmap, conversionCard });
```

- [ ] **Step 4: Run pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add cloud-functions/shared/
git commit -m "feat(email): roadmap + conversionCard (L1/CBA variants)"
```

---

### Task 7: `parseModelJson`

**Files:** Modify shared module + test.

- [ ] **Step 1: Failing test**

```js
test('parseModelJson parses plain JSON', () => {
  assert.deepStrictEqual(T.parseModelJson('{"rating":"优秀"}'), { rating: '优秀' });
});
test('parseModelJson strips ```json code fences', () => {
  assert.deepStrictEqual(T.parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
});
test('parseModelJson returns null on garbage', () => {
  assert.strictEqual(T.parseModelJson('not json at all'), null);
});
```

- [ ] **Step 2: Run fail** — FAIL.

- [ ] **Step 3: Implement**

```js
function parseModelJson(raw) {
  if (!raw) return null;
  let s = String(raw).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a !== -1 && b !== -1 && b > a) s = s.slice(a, b + 1);
  try { return JSON.parse(s); } catch (_) { return null; }
}
Object.assign(module.exports, { parseModelJson });
```

- [ ] **Step 4: Run pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add cloud-functions/shared/
git commit -m "feat(email): parseModelJson with fence-strip + fallback"
```

---

### Task 8: `assembleL1Sections` + `assembleCbaSections`

**Files:** Modify shared module + test.

`renderEmailArgs` shape (consumed by Task 9 `renderEmail`):
```
{ internal:{contact,submittedAt,code}, header:{title,date,code},
  hero:{bioAge,age,agingPaceStr,peerRankStr,rating},
  risks:[{name,oneLine}], mechanism:[{cause,physiology,result}],
  roadmap:{d7,d30,d90}, conversion:{kind,code,wechatId,qrUrl},
  footer:{code,date}, fallbackHtml:string|null }
```

- [ ] **Step 1: Failing test**

```js
const WECHAT = 'Charlie20850', QR = 'https://nanoviga.com/wechat-qr.png';
const l1data = { name:'张三', age:45, gender:'male', bioAge:40, score:75,
  agingPaceStr:'0.89x', peerRankStr:'前28%', contact:'见微信备注', assessmentCode:'BCA-9X2A',
  submittedAt:'2026-06-08 10:00', date:'2026-06-08' };

test('assembleL1Sections maps parsed JSON into renderEmailArgs', () => {
  const parsed = { rating:'优秀', risks:[{name:'r1',oneLine:'o1'}], mechanism:[{cause:'c',physiology:'p',result:'x'}], roadmap:{d7:['a'],d30:['b'],d90:['c']} };
  const args = T.assembleL1Sections(l1data, parsed, '');
  assert.strictEqual(args.hero.rating.label, '优秀');
  assert.strictEqual(args.risks.length, 1);
  assert.strictEqual(args.conversion.kind, 'L1');
  assert.strictEqual(args.conversion.wechatId, WECHAT);
  assert.strictEqual(args.fallbackHtml, null);
  assert.strictEqual(args.header.code, 'BCA-9X2A');
});
test('assembleL1Sections sets fallbackHtml when parsed is null', () => {
  const args = T.assembleL1Sections(l1data, null, '**风险**：原始文本');
  assert.ok(args.fallbackHtml && args.fallbackHtml.includes('<strong>风险</strong>'));
});
test('assembleCbaSections produces CBA conversion kind', () => {
  const args = T.assembleCbaSections({ ...l1data, assessmentCode:'CBA-1' }, { risks:[], mechanism:[], roadmap:{} }, '');
  assert.strictEqual(args.conversion.kind, 'CBA');
});
```

- [ ] **Step 2: Run fail** — FAIL.

- [ ] **Step 3: Implement**

```js
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
Object.assign(module.exports, { assembleL1Sections, assembleCbaSections });
```

- [ ] **Step 4: Run pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add cloud-functions/shared/
git commit -m "feat(email): assembleL1/CBA section mappers with fallback"
```

---

### Task 9: `renderEmail` orchestration

**Files:** Modify shared module + test.

- [ ] **Step 1: Failing test**

```js
test('renderEmail composes a full HTML doc with all sections, no markdown leak', () => {
  const parsed = { rating:'优秀',
    risks:[{name:'营养代谢失衡',oneLine:'代谢下降'},{name:'睡眠不足',oneLine:'皮质醇升高'},{name:'炎症偏高',oneLine:'hsCRP升高'}],
    mechanism:[{cause:'久坐',physiology:'胰岛素抵抗',result:'加速衰老'}],
    roadmap:{d7:['走6000步'],d30:['复查hsCRP'],d90:['体脂-3%']} };
  const html = T.renderEmail(T.assembleL1Sections(l1data, parsed, ''));
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(/width="600"|max-width:600px/.test(html), '600px container');
  ['身体年龄','三大关键风险','风险形成机制','行动路线图','下一步','营养代谢失衡','久坐','走6000步','Charlie20850']
    .forEach(s => assert.ok(html.includes(s), 'contains ' + s));
  assert.ok(!html.includes('**') && !/(^|\n)#{1,6}\s/.test(html), 'no raw markdown');
  assert.ok(html.includes('转发') && html.includes('删除'), 'internal strip present');
});
test('renderEmail uses fallbackHtml when present (skips S2-S4 renderers)', () => {
  const html = T.renderEmail(T.assembleL1Sections(l1data, null, '**风险**：文本'));
  assert.ok(html.includes('<strong>风险</strong>'));
  assert.ok(html.includes('Charlie20850'), 'conversion still rendered');
});
```

- [ ] **Step 2: Run fail** — FAIL.

- [ ] **Step 3: Implement**

```js
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
Object.assign(module.exports, { renderEmail });
```

- [ ] **Step 4: Run pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add cloud-functions/shared/
git commit -m "feat(email): renderEmail orchestration + fallback path"
```

---

### Task 10: `buildMimeMessage` (multipart/alternative)

**Files:** Modify shared module + test.

- [ ] **Step 1: Failing test**

```js
test('buildMimeMessage produces multipart/alternative with both parts, dot-stuffed', () => {
  const msg = T.buildMimeMessage({ fromEmail:'a@163.com', toEmail:'a@163.com', subject:'主题', textBody:'纯文本', htmlBody:'<b>x</b>' });
  assert.ok(msg.includes('Content-Type: multipart/alternative'));
  assert.ok(msg.includes('text/plain') && msg.includes('text/html'));
  assert.ok(msg.includes('纯文本') && msg.includes('<b>x</b>'));
  assert.ok(/Subject: =\?utf-8\?B\?/.test(msg), 'subject b64 encoded');
});
test('buildMimeMessage dot-stuffs leading-dot lines', () => {
  const msg = T.buildMimeMessage({ fromEmail:'a@163.com', toEmail:'a@163.com', subject:'s', textBody:'.hi', htmlBody:'<p>.x</p>' });
  assert.ok(msg.includes('..hi'));
});
```

- [ ] **Step 2: Run fail** — FAIL.

- [ ] **Step 3: Implement**

```js
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
Object.assign(module.exports, { buildMimeMessage });
```

- [ ] **Step 4: Run pass** — PASS.

- [ ] **Step 5: Commit**

```bash
git add cloud-functions/shared/
git commit -m "feat(email): buildMimeMessage multipart/alternative + dot-stuffing"
```

---

### Task 11: Local preview tool + visual QA gate (manual)

**Files:**
- Create: `tools/email-preview.js`
- Create (generated): `tools/preview/L1.html`, `tools/preview/CBA.html`

- [ ] **Step 1: Write the preview tool**

```js
// tools/email-preview.js — render sample L1 + CBA emails to HTML files for visual QA.
const fs = require('fs');
const path = require('path');
const T = require('../cloud-functions/shared/emailTemplate');

const common = { agingPaceStr:'0.89x', peerRankStr:'前28%', contact:'见微信备注编号 BCA-9X2A',
  submittedAt:'2026-06-08 10:00', date:'2026-06-08' };

const l1 = T.assembleL1Sections(
  { ...common, name:'张三', age:45, gender:'male', bioAge:40, score:75, assessmentCode:'BCA-9X2A' },
  { rating:'优秀',
    risks:[
      {name:'营养代谢失衡（核心风险）',oneLine:'营养代谢维度偏弱，糖化与胰岛素抵抗风险上升。'},
      {name:'睡眠与压力恢复不足',oneLine:'皮质醇偏高，抑制修复、加剧内脏脂肪堆积。'},
      {name:'有氧—力量结构失衡',oneLine:'缺乏抗阻训练，肌肉量与代谢储备下降。'}],
    mechanism:[{cause:'久坐 + 精制碳水',physiology:'胰岛素抵抗 → 慢性低度炎症',result:'加速细胞与血管衰老'}],
    roadmap:{ d7:['每天快走6000步','晚餐减少精制主食','23:00 前入睡'],
      d30:['每周2次抗阻训练','复查 hsCRP 与空腹胰岛素'],
      d90:['体脂率下降3%','腰围下降3cm'] } }, '');

const cba = T.assembleCbaSections(
  { ...common, name:'李四', age:50, gender:'female', bioAge:47, score:68, assessmentCode:'CBA-7K2',
    agingPaceStr:'0.94x', peerRankStr:'前41%' },
  { rating:'需关注',
    risks:[{name:'炎症免疫器官年龄偏高',oneLine:'hsCRP 与淋巴细胞比例提示低度炎症。'},
      {name:'代谢活力下降',oneLine:'空腹血糖与白蛋白提示代谢储备减弱。'},
      {name:'肾代谢负荷上升',oneLine:'肌酐偏高，需关注水化与蛋白摄入结构。'}],
    mechanism:[{cause:'慢性炎症',physiology:'IL-6/CRP 通路持续激活',result:'多器官加速老化'}],
    roadmap:{ d7:['增加深色蔬菜与 Omega-3'], d30:['复查炎症四项'], d90:['炎症标志物回落至参考区间'] } }, '');

const dir = path.join(__dirname, 'preview');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'L1.html'), T.renderEmail(l1));
fs.writeFileSync(path.join(dir, 'CBA.html'), T.renderEmail(cba));
console.log('Wrote', path.join(dir, 'L1.html'), 'and CBA.html');
```

- [ ] **Step 2: Generate previews**

Run: `node tools/email-preview.js`
Expected: prints paths; `tools/preview/L1.html` + `CBA.html` exist.

- [ ] **Step 3: Visual QA across clients (manual gate)**

Open `tools/preview/L1.html` and `CBA.html` in:
- Desktop browser (Chrome/Safari) at 600px and at phone width.
- Email yourself the file content / forward to **iPhone Mail, 163, QQ邮箱, Gmail** and confirm: 600px container holds, hero/rating/QR render, no `**`/`###` anywhere, tables don't break on 163/QQ.

Expected: clean, professional rendering on all targets. If a client breaks, fix the renderer in `emailTemplate.js`, re-run Step 2, re-check. **Do not proceed to Task 12 until visual QA passes.**

- [ ] **Step 4: Commit**

```bash
git add tools/email-preview.js
git commit -m "feat(email): local multi-client preview tool"
```

(Do not commit `tools/preview/*.html` — add `tools/preview/` to `.gitignore`.)

```bash
printf '\ntools/preview/\n' >> .gitignore
git add .gitignore && git commit -m "chore: ignore email preview output"
```

---

### Task 12: Wire `generateReport/index.js` (L1)

**Files:**
- Modify: `cloud-functions/generateReport/index.js`

- [ ] **Step 1: Replace the report prompt with a JSON contract**

In `generateReport/index.js`, the L1 report `prompt` (the `const prompt = ...` block before `callDeepSeekWithReasoning`) must instruct JSON-only output. Replace its body with:

```js
const prompt =
  `根据以下PLA评估数据，生成一份"身体年龄风险评估"结构化结论。\n\n` +
  `用户：${name||'用户'}，${age}岁，${gender==='male'?'男':'女'}\n` +
  `身体年龄：${bioAge}岁，衰老速度：${agingPaceStr}，同龄排名：${peerRankStr}，PLA评分：${score}分\n` +
  `各维度：${dimText}\n\n` +
  `仅返回合法JSON（无Markdown、无JSON外文字），schema：\n` +
  `{"rating":"优秀|需关注|高风险","ratingReason":"一句话",` +
  `"risks":[{"name":"风险名","oneLine":"≤30字"}],` +  // 恰好3条
  `"mechanism":[{"cause":"原因","physiology":"生理机制","result":"结果"}],` + // 1-2条
  `"roadmap":{"d7":[".."],"d30":[".."],"d90":[".."]}}\n` + // 每段2-4条，具体可执行
  `要求：risks恰好3条；语言简体中文，临床、克制、可执行。`;
```

- [ ] **Step 2: Require the shared module + replace email build/send**

Near the top of `generateReport/index.js`, after the existing `require`s, add:

```js
const ET = require('../shared/emailTemplate'); // 部署时内联，见 plan Task 14
```

Replace the report generation + email block. The current flow calls `callDeepSeekWithReasoning(...)` into `report`, then builds a plain-text `subject`/`body` and calls `sendSmtpEmail163(...)`. Change it to:

```js
const rawReport = await callDeepSeekWithReasoning(DEEPSEEK_KEY, CLINICAL_REASONING_SYSTEM, prompt, 800);
const parsed = ET.parseModelJson(rawReport);

const nowStr = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
const dateStr = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
const sections = ET.assembleL1Sections({
  name, age, gender, bioAge, score,
  agingPaceStr, peerRankStr,
  contact: contact || '', assessmentCode: assessmentCode || '',
  submittedAt: nowStr, date: dateStr,
}, parsed, rawReport);
const htmlBody = ET.renderEmail(sections);
const rating = sections.hero.rating.label;
const subject = `【缓龄报告】${name||'新客户'} | ${rating} | ${assessmentCode||''}`.slice(0, 60);
const textBody = `BioAge Compass 身体年龄评估报告\n客户：${name||'未知'} | 编号：${assessmentCode||''}\n身体年龄：${bioAge}岁（实际${age}岁）| 评级：${rating}\n（请在支持HTML的邮件客户端查看完整报告）`;
```

Keep the existing `report: rawReport` (or `report: htmlBody`) in the DB-save payload and the final `okResp`. Keep the existing `if (EMAIL_AUTH_CODE) { ... }` guard, but change the send call (next step).

- [ ] **Step 3: Send HTML via multipart**

Modify `sendSmtpEmail163` to accept `htmlBody` and use `ET.buildMimeMessage`. Change its signature and the DATA payload. Replace the function's signature line and the message construction inside the `DATA_CMD` case:

```js
function sendSmtpEmail163(fromEmail, authCode, toEmail, subject, textBody, htmlBody) {
  // ...unchanged TLS/handshake/state machine...
  // In case 'DATA_CMD', when code === 354, replace the inline message build with:
  if (code === 354) {
    const msg = ET.buildMimeMessage({ fromEmail, toEmail, subject, textBody, htmlBody });
    socket.write(msg + '\r\n.\r\n');
    state = 'DATA_SENT';
  }
}
```

And update the call site inside the email block:

```js
await sendSmtpEmail163(ADMIN_EMAIL, EMAIL_AUTH_CODE, ADMIN_EMAIL, subject, textBody, htmlBody);
```

- [ ] **Step 4: Local smoke test (no network) of the wiring**

Create a throwaway check that the assemble→render path used by index.js produces valid HTML for a sample parsed object (the DeepSeek call itself is network and is exercised in Task 14 via curl). Run:

```bash
node -e "const ET=require('./cloud-functions/shared/emailTemplate');const s=ET.assembleL1Sections({name:'测试',age:45,gender:'male',bioAge:40,score:75,agingPaceStr:'0.89x',peerRankStr:'前28%',contact:'x',assessmentCode:'BCA-T',submittedAt:'t',date:'2026-06-08'},{rating:'优秀',risks:[{name:'a',oneLine:'b'}],mechanism:[],roadmap:{d7:['x']}},'');const h=ET.renderEmail(s);if(!h.startsWith('<!DOCTYPE html>')||h.includes('**'))throw new Error('bad');console.log('OK',h.length,'bytes');"
```
Expected: `OK <n> bytes`.

- [ ] **Step 5: Syntax-check index.js**

Run: `node --check cloud-functions/generateReport/index.js`
Expected: no output (valid). Then commit:

```bash
git add cloud-functions/generateReport/index.js
git commit -m "feat(generateReport): JSON contract + HTML multipart email via shared template"
```

---

### Task 13: Wire `analyzeCBA/index.js` (CBA)

**Files:**
- Modify: `cloud-functions/analyzeCBA/index.js`

- [ ] **Step 1: Add JSON prompt for CBA**

`analyzeCBA` builds its report from organ ages + biomarkers. Add a CBA report prompt that returns the same JSON schema as Task 12 Step 1, but framed on CBA inputs (organ ages, phenoAge, biomarkers, plus optional PLA fusion). Place it where the CBA report text is currently generated:

```js
const cbaPrompt =
  `根据以下CBA临床生化评估数据，生成结构化"生物年龄风险结论"。\n\n` +
  `实际年龄：${actualAge}岁，性别：${gender==='male'?'男':'女'}，PhenoAge：${phenoAge}岁\n` +
  `器官年龄：${JSON.stringify(organAges5D)}\n生化指标：${JSON.stringify(biomarkers)}\n` +
  (plaData ? `关联L1：生物年龄${plaData.bioAge}岁/评分${plaData.score}\n` : '') +
  `仅返回合法JSON（无Markdown），schema：\n` +
  `{"rating":"优秀|需关注|高风险","ratingReason":"一句话",` +
  `"risks":[{"name":"风险名","oneLine":"≤30字"}],"mechanism":[{"cause":"原因","physiology":"生理机制","result":"结果"}],` +
  `"roadmap":{"d7":[".."],"d30":[".."],"d90":[".."]}}\n要求：risks恰好3条；临床、克制、可执行。`;
```

- [ ] **Step 2: Require shared module + build HTML email**

After existing requires add `const ET = require('../shared/emailTemplate');`. Replace `buildEmailSubject`/`buildEmailBody` usage and the send with:

```js
const rawCba = await callDeepSeek(DEEPSEEK_KEY, cbaPrompt, 800); // or callDeepSeekWithReasoning if available here
const parsed = ET.parseModelJson(rawCba);
const nowStr  = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
const dateStr = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
const sections = ET.assembleCbaSections({
  name: name || '', age: actualAge, gender, bioAge: phenoAge, score: 100,
  agingPaceStr: 'N/A', peerRankStr: 'N/A',
  contact: `尾号${phoneSuffix}`, assessmentCode,
  submittedAt: nowStr, date: dateStr,
}, parsed, rawCba);
// CBA hero uses PhenoAge as the headline age; rating from PhenoAge vs actualAge + score handled by computeRating.
const htmlBody = ET.renderEmail(sections);
const rating = sections.hero.rating.label;
const subject = `【CBA报告】${name||'客户'} 尾号${phoneSuffix} | ${rating} | ${assessmentCode}`.slice(0, 60);
const textBody = `BioAge Compass CBA 临床生化报告\n编号：${assessmentCode} | PhenoAge：${phenoAge}岁\n（请在支持HTML的邮件客户端查看完整报告）`;
```

> Note: `score:100` is a neutral placeholder so `computeRating` keys off the PhenoAge-vs-actualAge gap for CBA (CBA has no PLA score). Confirm during Task 14 that CBA rating reads sensibly; if not, pass the CBA-derived score instead.

- [ ] **Step 3: Reuse the same multipart sender**

Apply the identical `sendSmtpEmail163(..., textBody, htmlBody)` + `ET.buildMimeMessage` change as Task 12 Step 3 to `analyzeCBA`'s copy of `sendSmtpEmail163`, and update its call site.

- [ ] **Step 4: Syntax check**

Run: `node --check cloud-functions/analyzeCBA/index.js`
Expected: valid.

- [ ] **Step 5: Commit**

```bash
git add cloud-functions/analyzeCBA/index.js
git commit -m "feat(analyzeCBA): JSON contract + HTML multipart email via shared template"
```

---

### Task 14: Deploy (manual console) + curl + multi-client verification

**Files:** none (deploy + verification only). Both cloud functions deploy via the **legacy** Tencent console per `runtime/CLAUDE.md` §8 (Monaco `applyEdits`, chunked).

- [ ] **Step 1: Produce inlined deploy artifacts**

For each of `generateReport/index.js` and `analyzeCBA/index.js`: replace the line `const ET = require('../shared/emailTemplate');` with the **full contents** of `cloud-functions/shared/emailTemplate.js` (its `module.exports` lines removed) wrapped between markers, and reference functions as `ET.fn` → either define `const ET = { ...inlined exports }` or drop the `ET.` prefix consistently. Recommended: keep `const ET = (function(){ <inlined module body>; return { esc, mdToInlineHtml, PALETTE, computeRating, headerBar, internalStrip, sectionWrap, footer, heroCard, riskList, mechanismChain, roadmap, conversionCard, parseModelJson, renderEmail, assembleL1Sections, assembleCbaSections, buildMimeMessage }; })();` so all `ET.` call sites stay valid. Mark with `// ==EMAIL_TEMPLATE_START==` / `// ==EMAIL_TEMPLATE_END==`.

Verify the inlined file still parses: `node --check cloud-functions/generateReport/index.js` (and analyzeCBA). Keep the `require`-based repo version on a branch; the inlined version is the deploy paste.

- [ ] **Step 2: Deploy generateReport**

Legacy console → `generateReport` → Monaco `applyEdits` with the inlined `index.js` (chunked, per §8) → 保存.

- [ ] **Step 3: curl-test L1 (mind 163 throttle — single shot)**

```bash
curl -s -X POST 'https://bioage-compass-prod-9chaf35e573d-1405252881.ap-shanghai.app.tcloudbase.com/generateReport' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"full","name":"HTML测试","age":45,"gender":"male","bioAge":40,"score":75,"dimensionScores":{"运动能力":8,"身心平衡":7,"营养代谢":6,"睡眠质量":7,"遗传因素":8,"环境因素":7},"contact":"13816746212@163.com","assessmentCode":"BCA-HTML1"}' --max-time 120
```
Expected: `"emailResult":"sent"`. Then open the mail on **iPhone Mail / 163 / QQ / Gmail** → confirm professional HTML render, no `**`/`###`, QR + WeChat visible, internal strip detachable.

- [ ] **Step 4: Deploy + test analyzeCBA**

Deploy `analyzeCBA` the same way. Then run the pre-approved CBA `cba_submit` curl (see `.claude/settings.local.json`) and verify the received CBA email renders correctly and the rating reads sensibly.

- [ ] **Step 5: Verdict + rollback safety**

If any client breaks: fix `shared/emailTemplate.js` → re-run Task 11 preview → re-inline → redeploy. Rollback = re-paste the previous `index.js` (keep a copy before Step 2). No commit (deploy-only task); record outcome in PROJECT_STATUS in Task 15.

---

### Task 15: Documentation

**Files:**
- Modify: `runtime/CLAUDE.md` (§8 cloud functions)
- Modify: `runtime/PROJECT_STATUS.md`

- [ ] **Step 1: Update §8 in `runtime/CLAUDE.md`**

Add under the generateReport/analyzeCBA notes:

```md
- 邮件为 HTML（multipart/alternative，text/plain 兜底），由 `cloud-functions/shared/emailTemplate.js` 渲染；
  模型输出结构化 JSON（rating/risks/mechanism/roadmap），非 Markdown。模板部署时内联进各 index.js
  （标记 ==EMAIL_TEMPLATE_START/END==），变更需同步两处。规范见 docs/superpowers/specs/2026-06-08-...md。
```

- [ ] **Step 2: Append a dated entry to `PROJECT_STATUS.md`**

Record: Clinical Conversion Report Email System shipped (date), what changed, deploy outcome from Task 14, and the template-sync caveat.

- [ ] **Step 3: Commit**

```bash
git add runtime/CLAUDE.md runtime/PROJECT_STATUS.md
git commit -m "docs: Clinical Conversion Report Email System — usage + status"
```

---

## Self-Review

**Spec coverage:**
- Header/S1–S5/Footer → Tasks 3,4,5,6,9 ✓
- Internal strip (doctor-relay) → Task 3 + 9 ✓
- Rating thresholds (confirmed) → Task 2 ✓
- Personal WeChat QR in S5 → Task 6 (`conversionCard`) ✓
- Structured JSON (not MD→HTML) + fallback → Tasks 7,8,9,12,13 ✓
- Shared template reused by both functions (+ future digest) → shared module + Tasks 12,13 ✓
- Multipart HTML SMTP → Task 10 + 12/13 Step 3 ✓
- ≤600px, inline CSS, tables, mobile, multi-client → renderers + Task 11 QA gate ✓
- Manual console deploy + rollback → Task 14 ✓
- No npm deps, env unchanged → throughout ✓

**Placeholder scan:** No "TBD/TODO/handle edge cases" — every code step has real code. The two `> Note:` items (computeRating test assertion fix; CBA score placeholder) are explicit instructions, not deferrals.

**Type consistency:** `computeRating`, `assembleL1/CbaSections`, `renderEmail` args, `buildMimeMessage` signature, and `conversionCard({kind,code,wechatId,qrUrl})` are used identically across Tasks 2–13. `ET.*` namespace consistent in index.js wiring and the Task 14 inline shim.

---

## Execution Handoff

Plan complete. Two execution options:
1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute here with checkpoints.
