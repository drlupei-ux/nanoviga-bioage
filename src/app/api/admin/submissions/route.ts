import { NextResponse } from 'next/server';
import { listSubmissions } from '@/lib/admin/cloudbase';
import type { ReviewStatus, SubmissionType } from '@/lib/admin/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const type = (q.get('type') || 'all') as SubmissionType | 'all';
  const status = (q.get('status') || undefined) as ReviewStatus | undefined;
  try {
    const items = await listSubmissions(type, status);
    const lean = items.map(({ report, dimensionScores, organAges, ...rest }) => rest);
    return NextResponse.json({ items: lean });
  } catch (e: any) {
    console.error('admin list error', e);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
}
