/**
 * Create ONE clearly-labeled throwaway TEST PLA submission in production CloudBase,
 * for validating the Admin Review Dashboard WITHOUT touching real customer data.
 *
 * Safety design (see memory: admin-dashboard-test-data-safety):
 *  - name is prefixed 【测试】 and the doc carries `isTest: true`
 *  - assessmentCode is `BCA-TEST-xxxx` (never a real BCA-xxxx)
 *  - caseId is PRE-STAMPED `BAC-TEST-xxxx` so opening it in the dashboard does NOT
 *    trigger backfill and does NOT consume a real BAC-YYYY-NNNN sequence number
 *  - cleanup: `npm run clean:test-cases` removes every isTest:true doc
 *
 * Run (loads real Tencent creds from .env.local):
 *   npm run seed:test-case
 *
 * Prints the inserted _id so it can be opened at /admin/pla/<_id>.
 */
import { getDb, COLLECTION } from '../src/lib/admin/cloudbase';

async function main() {
  const db = getDb();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  const doc = {
    isTest: true,
    name: `【测试】TEST-${rand}`,
    age: 45,
    gender: 'male',
    bioAge: 41,
    score: 74,
    dimensionScores: {
      运动能力: 8, 身心平衡: 7, 营养代谢: 6, 睡眠质量: 9,
      遗传因素: 8, 环境因素: 7, 感官衰老: 7,
    },
    contact: '13800000000',
    assessmentCode: `BCA-TEST-${rand}`,
    caseId: `BAC-TEST-${rand}`, // synthetic — keeps the real BAC sequence pristine
    report: '【测试数据 / DO NOT TREAT AS REAL】用于验证审核台（列表→详情→交付）流程的测试报告。可随时删除。',
    createdAt: new Date().toISOString(),
    status: 'submitted',
  };

  const res = await db.collection(COLLECTION.pla).add(doc);
  const id = res?.id ?? res?._id ?? (res?.ids && res.ids[0]) ?? '(unknown)';

  console.log('✅ Inserted TEST PLA submission');
  console.log('   collection :', COLLECTION.pla);
  console.log('   _id        :', id);
  console.log('   name       :', doc.name);
  console.log('   assessment :', doc.assessmentCode);
  console.log('   caseId     :', doc.caseId, '(synthetic — no real BAC consumed)');
  console.log('   status     :', doc.status);
  console.log('   open at    : /admin/pla/' + id);
  console.log('\n   cleanup later with: npm run clean:test-cases');
}

main().then(() => process.exit(0)).catch((e) => { console.error('❌', e); process.exit(1); });
