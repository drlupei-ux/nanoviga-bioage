import tcb from '@cloudbase/node-sdk';
import {
  formatCaseId,
  type AdminSubmission, type ReviewStatus, type SubmissionType,
} from './types';

export const COLLECTION: Record<SubmissionType, string> = {
  pla: 'report_submissions', cba: 'cba_submissions',
};
const COUNTERS = 'case_counters';

let _app: any = null;
export function getApp(): any {
  if (!_app) _app = tcb.init({
    env: process.env.TCB_ENV_ID,
    secretId: process.env.TENCENT_SECRET_ID,
    secretKey: process.env.TENCENT_SECRET_KEY,
  });
  return _app;
}
export function getDb(): any { return getApp().database(); }

function normStatus(s: unknown): ReviewStatus {
  const v = String(s ?? 'submitted');
  if (v === 'pending') return 'submitted';
  return (['submitted', 'under_review', 'delivered'].includes(v) ? v : 'submitted') as ReviewStatus;
}

/** Pure: raw CloudBase doc → normalized admin shape. */
export function normalize(type: SubmissionType, d: any): AdminSubmission {
  const base = {
    id: String(d._id ?? ''), type,
    caseId: d.caseId ?? null,
    name: d.name ?? '',
    assessmentCode: d.assessmentCode ?? '',
    status: normStatus(d.status),
    report: d.report ?? null,
    doctorNote: d.doctorNote ?? null,
  };
  if (type === 'pla') return {
    ...base, l1RefCode: null,
    submittedAt: d.createdAt ?? d.submittedAt ?? '',
    headlineAge: Number(d.bioAge ?? 0), actualAge: Number(d.age ?? 0),
    score: Number(d.score ?? 0), dimensionScores: d.dimensionScores ?? {},
    contact: { phone: d.contact ?? null, phoneSuffix: null },
  };
  return {
    ...base, l1RefCode: d.l1RefCode ?? null,
    submittedAt: d.submittedAt ?? d.createdAt ?? '',
    headlineAge: Number(d.phenoAge ?? 0), actualAge: Number(d.actualAge ?? 0),
    organAges: d.organAges ?? {},
    contact: { phone: null, phoneSuffix: d.phoneSuffix ?? null },
  };
}

/** Atomically allocate the next BAC id via a CloudBase transaction. */
export async function allocateCaseId(): Promise<string> {
  const db = getDb();
  const year = new Date().getFullYear();
  let seq = 0;
  await db.runTransaction(async (tx: any) => {
    const ref = tx.collection(COUNTERS).doc(String(year));
    const snap = await ref.get();
    const cur = snap && snap.data ? (Array.isArray(snap.data) ? snap.data[0] : snap.data) : null;
    if (!cur) { seq = 1; await ref.set({ year, seq }); }
    else { seq = (cur.seq || 0) + 1; await ref.update({ seq }); }
  });
  return formatCaseId(year, seq);
}

/** Heal a record missing caseId (legacy/fallback). Idempotent. */
export async function backfillCaseId(type: SubmissionType, id: string): Promise<string | null> {
  const db = getDb();
  const doc = (await db.collection(COLLECTION[type]).doc(id).get())?.data?.[0];
  if (!doc) return null;
  if (doc.caseId) return doc.caseId;
  const caseId = await allocateCaseId();
  await db.collection(COLLECTION[type]).doc(id).update({ caseId });
  return caseId;
}

async function listOne(type: SubmissionType, status?: ReviewStatus): Promise<AdminSubmission[]> {
  const db = getDb();
  const where: Record<string, unknown> = {};
  if (status) where.status = status === 'submitted' ? db.command.in(['submitted', 'pending']) : status;
  const order = type === 'pla' ? 'createdAt' : 'submittedAt';
  const res = await db.collection(COLLECTION[type]).where(where).orderBy(order, 'desc').limit(200).get();
  return (res.data || []).map((d: any) => normalize(type, d));
}

export async function listSubmissions(
  type: SubmissionType | 'all', status?: ReviewStatus,
): Promise<AdminSubmission[]> {
  const types: SubmissionType[] = type === 'all' ? ['pla', 'cba'] : [type];
  const all = (await Promise.all(types.map(t => listOne(t, status)))).flat();
  return all.sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

export async function getOne(type: SubmissionType, id: string): Promise<AdminSubmission | null> {
  const doc = (await getDb().collection(COLLECTION[type]).doc(id).get())?.data?.[0];
  return doc ? normalize(type, doc) : null;
}

/** Auto-advance submitted → under_review (idempotent; only when currently submitted). */
export async function ensureUnderReview(type: SubmissionType, id: string, current: ReviewStatus): Promise<void> {
  if (current !== 'submitted') return;
  await getDb().collection(COLLECTION[type]).doc(id).update({ status: 'under_review' });
}

/** Deliver: write doctorNote + status=delivered. */
export async function deliver(type: SubmissionType, id: string, doctorNote: string): Promise<void> {
  await getDb().collection(COLLECTION[type]).doc(id).update({ doctorNote, status: 'delivered' });
}
