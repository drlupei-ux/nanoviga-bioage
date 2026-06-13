import test from 'node:test';
import assert from 'node:assert';
import { signSession, verifySession, ADMIN_COOKIE } from './session';

const SECRET = 'test-secret-please-change-0123456789';

test('cookie name is stable', () => assert.equal(ADMIN_COOKIE, 'nv_admin'));
test('fresh token verifies', async () => {
  assert.equal(await verifySession(SECRET, await signSession(SECRET)), true);
});
test('wrong secret fails', async () => {
  assert.equal(await verifySession('another-secret-another-secret-00', await signSession(SECRET)), false);
});
test('tampered token fails', async () => {
  const t = await signSession(SECRET);
  assert.equal(await verifySession(SECRET, t.slice(0, -2) + 'xy'), false);
});
test('expired token fails', async () => {
  assert.equal(await verifySession(SECRET, await signSession(SECRET, -1000)), false);
});
test('malformed tokens fail safely', async () => {
  assert.equal(await verifySession(SECRET, ''), false);
  assert.equal(await verifySession(SECRET, null), false);
  assert.equal(await verifySession(SECRET, 'nodot'), false);
});
