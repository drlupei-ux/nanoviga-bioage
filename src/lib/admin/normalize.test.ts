import test from 'node:test';
import assert from 'node:assert';
import { normalize } from './cloudbase';

test('normalize PLA + legacy pending', () => {
  const o = normalize('pla', {
    _id: 'a1', name: '张三', age: 50, bioAge: 46, score: 72,
    dimensionScores: { 运动能力: 8 }, contact: '13800000000', assessmentCode: 'BCA-AB12',
    report: 'r', createdAt: '2026-06-10T00:00:00.000Z', status: 'pending',
  });
  assert.equal(o.type, 'pla'); assert.equal(o.id, 'a1');
  assert.equal(o.headlineAge, 46); assert.equal(o.actualAge, 50);
  assert.equal(o.status, 'submitted');            // legacy normalized
  assert.equal(o.contact.phone, '13800000000');
  assert.equal(o.caseId, null);
});

test('normalize CBA', () => {
  const o = normalize('cba', {
    _id: 'c1', assessmentCode: 'BCA-ZZ99', l1RefCode: 'BCA-AB12', name: '李四',
    phoneSuffix: '6212', actualAge: 60, phenoAge: 64, organAges: { 代谢活力: 62 },
    submittedAt: '2026-06-11T00:00:00.000Z', status: 'under_review',
    caseId: 'BAC-2026-0003', report: 'cba-r', doctorNote: '已沟通',
  });
  assert.equal(o.headlineAge, 64); assert.equal(o.status, 'under_review');
  assert.equal(o.contact.phoneSuffix, '6212'); assert.equal(o.caseId, 'BAC-2026-0003');
  assert.equal(o.doctorNote, '已沟通');
});
