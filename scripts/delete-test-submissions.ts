/**
 * Delete EVERY test record (isTest:true) from both production collections.
 * Only ever targets isTest:true docs — never customer data.
 *
 * Run (loads real Tencent creds from .env.local):
 *   npm run clean:test-cases
 *
 * Lists each removed record's _id and name.
 */
import { getDb, COLLECTION } from '../src/lib/admin/cloudbase';

async function main() {
  const db = getDb();
  let total = 0;
  for (const type of ['pla', 'cba'] as const) {
    const res = await db.collection(COLLECTION[type]).where({ isTest: true }).limit(500).get();
    const docs: any[] = res.data || [];
    for (const d of docs) {
      await db.collection(COLLECTION[type]).doc(d._id).remove();
      console.log('🗑  removed', type, d._id, '|', d.name ?? '');
      total++;
    }
  }
  console.log(`\nDone. Removed ${total} test record(s).`);
  if (total === 0) console.log('(No isTest:true records found — nothing to clean.)');
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌', e); process.exit(1); });
