import test from 'node:test';
import assert from 'node:assert';
import { formatCaseId, parseCaseId, isPending } from './types';

test('formatCaseId / parseCaseId round-trip', () => {
  assert.equal(formatCaseId(2026, 7), 'BAC-2026-0007');
  assert.deepEqual(parseCaseId('BAC-2026-0007'), { year: 2026, seq: 7 });
  assert.equal(parseCaseId('BCA-XXXX'), null);
});

test('isPending covers queue states', () => {
  assert.equal(isPending('submitted'), true);
  assert.equal(isPending('under_review'), true);
  assert.equal(isPending('delivered'), false);
});
