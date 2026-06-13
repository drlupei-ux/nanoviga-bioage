import { NextResponse } from 'next/server';
import { getOne, backfillCaseId, ensureUnderReview } from '@/lib/admin/cloudbase';
import type { SubmissionType } from '@/lib/admin/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const asType = (t: string): SubmissionType | null => (t === 'pla' || t === 'cba' ? t : null);

export async function GET(_req: Request, { params }: { params: { type: string; id: string } }) {
  const type = asType(params.type);
  if (!type) return NextResponse.json({ error: 'bad_type' }, { status: 400 });
  try {
    const item = await getOne(type, params.id);
    if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    let caseId = item.caseId;
    if (!caseId) caseId = await backfillCaseId(type, params.id);
    await ensureUnderReview(type, params.id, item.status);
    const status = item.status === 'submitted' ? 'under_review' : item.status;
    return NextResponse.json({ item: { ...item, caseId, status } });
  } catch (e: any) {
    console.error('admin detail error', e);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
}
