import test from 'node:test';
import assert from 'node:assert';
import { parseReport, buildWeChatText } from './reportFormat';

const SAMPLE = JSON.stringify({
  rating: '优秀', ratingReason: '整体抗衰老状态良好。',
  risks: [{ name: '营养代谢偏弱', oneLine: '关注饮食结构与代谢调节。' }],
  mechanism: [{ cause: '膳食结构不均衡', physiology: '胰岛素敏感性下降', result: '内脏脂肪增加' }],
  roadmap: { d7: ['每日30分钟快走'], d30: ['复查血脂'], d90: ['优化体成分'] },
});

test('parseReport parses plain JSON', () => {
  const p = parseReport(SAMPLE)!;
  assert.equal(p.rating, '优秀');
  assert.equal(p.risks.length, 1);
  assert.equal(p.risks[0].name, '营养代谢偏弱');
  assert.equal(p.mechanism[0].result, '内脏脂肪增加');
  assert.deepEqual(p.roadmap.d7, ['每日30分钟快走']);
});

test('parseReport strips ```json code fences', () => {
  const p = parseReport('```json\n' + SAMPLE + '\n```');
  assert.ok(p && p.risks.length === 1);
});

test('parseReport returns null for non-JSON / empty', () => {
  assert.equal(parseReport('这是一段纯文本报告'), null);
  assert.equal(parseReport(''), null);
  assert.equal(parseReport(null), null);
});

test('parseReport tolerates missing sections', () => {
  const p = parseReport('{"rating":"良好"}')!;
  assert.equal(p.rating, '良好');
  assert.deepEqual(p.risks, []);
  assert.deepEqual(p.roadmap.d7, []);
});

test('buildWeChatText includes code, report sections, and doctor note', () => {
  const item: any = { caseId: 'BAC-2026-0001', name: '张三', headlineAge: 41, actualAge: 45, score: 74, assessmentCode: 'BCA-X' };
  const txt = buildWeChatText(item, parseReport(SAMPLE), '建议复查血脂，2周后随访。');
  assert.ok(txt.includes('BAC-2026-0001'), 'has case id');
  assert.ok(txt.includes('三大关键风险'));
  assert.ok(txt.includes('营养代谢偏弱'));
  assert.ok(txt.includes('行动路线图'));
  assert.ok(txt.includes('医生复核意见'));
  assert.ok(txt.includes('建议复查血脂，2周后随访。'));
});

test('buildWeChatText falls back to raw report when not JSON', () => {
  const item: any = { assessmentCode: 'BCA-Y', headlineAge: 0, actualAge: 0, report: '纯文本报告内容' };
  const txt = buildWeChatText(item, null, '');
  assert.ok(txt.includes('纯文本报告内容'));
});
