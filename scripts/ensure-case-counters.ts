/**
 * Idempotently ensure the `case_counters` collection exists in production CloudBase.
 * The caseId allocator (BAC-YYYY-NNNN) runs a transaction that writes to this collection;
 * it must exist first. Safe to run repeatedly.
 *
 * Run: npm run ensure:counters   (loads creds from .env.local)
 */
import tcb from '@cloudbase/node-sdk';

const app = tcb.init({
  env: process.env.TCB_ENV_ID,
  secretId: process.env.TENCENT_SECRET_ID,
  secretKey: process.env.TENCENT_SECRET_KEY,
});
const db = app.database();

async function main() {
  try {
    await db.createCollection('case_counters');
    console.log('createCollection: created ✅');
  } catch (e: any) {
    // already-exists is fine; surface anything else
    console.log('createCollection note:', e?.code || e?.message || e);
  }
  // Verify by querying it (throws if the collection truly does not exist).
  const res = await db.collection('case_counters').count();
  console.log('verify: case_counters exists ✅  (documents:', res.total, ')');
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌ FAILED:', e); process.exit(1); });
