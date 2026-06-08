// cloud-functions/shared/emailTemplate.test.js
const test = require('node:test');
const assert = require('node:assert');
const T = require('./emailTemplate');

// ── Task 1: esc + mdToInlineHtml ──────────────────────────────────────────────

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

// ── Task 2: computeRating ─────────────────────────────────────────────────────

test('computeRating: 优秀 needs ageDiff>=3 AND score>=70', () => {
  assert.strictEqual(T.computeRating({ age: 45, bioAge: 40, score: 75 }).label, '优秀');
  // ageDiff=3 (45-42=3) AND score=95>=70 → 优秀 (plan note: fix assertion to '优秀')
  assert.strictEqual(T.computeRating({ age: 45, bioAge: 42, score: 95 }).label, '优秀');
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

// ── Task 3: sectionWrap + headerBar + internalStrip + footer ─────────────────

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

// ── Task 4: heroCard ──────────────────────────────────────────────────────────

test('heroCard shows bioAge, delta, stats, rating badge', () => {
  const rating = T.computeRating({ age: 45, bioAge: 40, score: 75 });
  const h = T.heroCard({ bioAge: 40, age: 45, agingPaceStr: '0.89x', peerRankStr: '前28%', rating });
  assert.ok(h.includes('40'), 'bioAge');
  assert.ok(h.includes('年轻5岁'), 'delta phrase');
  assert.ok(h.includes('0.89x') && h.includes('前28%'));
  assert.ok(h.includes('优秀'), 'rating label');
  assert.ok(h.includes(rating.color), 'rating color applied');
});

// ── Task 5: riskList + mechanismChain ────────────────────────────────────────

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

// ── Task 6: roadmap + conversionCard ─────────────────────────────────────────

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

// ── Task 7: parseModelJson ────────────────────────────────────────────────────

test('parseModelJson parses plain JSON', () => {
  assert.deepStrictEqual(T.parseModelJson('{"rating":"优秀"}'), { rating: '优秀' });
});
test('parseModelJson strips ```json code fences', () => {
  assert.deepStrictEqual(T.parseModelJson('```json\n{"a":1}\n```'), { a: 1 });
});
test('parseModelJson returns null on garbage', () => {
  assert.strictEqual(T.parseModelJson('not json at all'), null);
});

// ── Task 8: assembleL1Sections + assembleCbaSections ─────────────────────────

const WECHAT = 'Charlie20850', QR = 'https://nanoviga.com/wechat-qr.png';
const l1data = { name: '张三', age: 45, gender: 'male', bioAge: 40, score: 75,
  agingPaceStr: '0.89x', peerRankStr: '前28%', contact: '见微信备注', assessmentCode: 'BCA-9X2A',
  submittedAt: '2026-06-08 10:00', date: '2026-06-08' };

test('assembleL1Sections maps parsed JSON into renderEmailArgs', () => {
  const parsed = { rating: '优秀', risks: [{ name: 'r1', oneLine: 'o1' }], mechanism: [{ cause: 'c', physiology: 'p', result: 'x' }], roadmap: { d7: ['a'], d30: ['b'], d90: ['c'] } };
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
  const args = T.assembleCbaSections({ ...l1data, assessmentCode: 'CBA-1' }, { risks: [], mechanism: [], roadmap: {} }, '');
  assert.strictEqual(args.conversion.kind, 'CBA');
});

// ── Task 9: renderEmail ───────────────────────────────────────────────────────

test('renderEmail composes a full HTML doc with all sections, no markdown leak', () => {
  const parsed = { rating: '优秀',
    risks: [{ name: '营养代谢失衡', oneLine: '代谢下降' }, { name: '睡眠不足', oneLine: '皮质醇升高' }, { name: '炎症偏高', oneLine: 'hsCRP升高' }],
    mechanism: [{ cause: '久坐', physiology: '胰岛素抵抗', result: '加速衰老' }],
    roadmap: { d7: ['走6000步'], d30: ['复查hsCRP'], d90: ['体脂-3%'] } };
  const html = T.renderEmail(T.assembleL1Sections(l1data, parsed, ''));
  assert.ok(html.startsWith('<!DOCTYPE html>'));
  assert.ok(/width="600"|max-width:600px/.test(html), '600px container');
  ['身体年龄', '三大关键风险', '风险形成机制', '行动路线图', '下一步', '营养代谢失衡', '久坐', '走6000步', 'Charlie20850']
    .forEach(s => assert.ok(html.includes(s), 'contains ' + s));
  assert.ok(!html.includes('**') && !/(^|\n)#{1,6}\s/.test(html), 'no raw markdown');
  assert.ok(html.includes('转发') && html.includes('删除'), 'internal strip present');
});
test('renderEmail uses fallbackHtml when present (skips S2-S4 renderers)', () => {
  const html = T.renderEmail(T.assembleL1Sections(l1data, null, '**风险**：文本'));
  assert.ok(html.includes('<strong>风险</strong>'));
  assert.ok(html.includes('Charlie20850'), 'conversion still rendered');
});

// ── Task 10: buildMimeMessage ─────────────────────────────────────────────────

test('buildMimeMessage produces multipart/alternative with both parts, dot-stuffed', () => {
  const msg = T.buildMimeMessage({ fromEmail: 'a@163.com', toEmail: 'a@163.com', subject: '主题', textBody: '纯文本', htmlBody: '<b>x</b>' });
  assert.ok(msg.includes('Content-Type: multipart/alternative'));
  assert.ok(msg.includes('text/plain') && msg.includes('text/html'));
  assert.ok(msg.includes('纯文本') && msg.includes('<b>x</b>'));
  assert.ok(/Subject: =\?utf-8\?B\?/.test(msg), 'subject b64 encoded');
});
test('buildMimeMessage dot-stuffs leading-dot lines', () => {
  const msg = T.buildMimeMessage({ fromEmail: 'a@163.com', toEmail: 'a@163.com', subject: 's', textBody: '.hi', htmlBody: '<p>.x</p>' });
  assert.ok(msg.includes('..hi'));
});
