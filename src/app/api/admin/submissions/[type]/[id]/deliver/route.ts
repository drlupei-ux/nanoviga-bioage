import { NextResponse } from 'next/server';
import { getOne, deliver } from '@/lib/admin/cloudbase';
import { adminGuard } from '@/lib/admin/auth';
import type { SubmissionType } from '@/lib/admin/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const asType = (t: string): SubmissionType | null => (t === 'pla' || t === 'cba' ? t : null);

export async function POST(req: Request, { params }: { params: { type: string; id: string } }) {
  const unauth = await adminGuard();
  if (unauth) return unauth;
  const type = asType(params.type);
  if (!type) return NextResponse.json({ error: 'bad_type' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const doctorNote = String(body.doctorNote || '').trim();
  if (!doctorNote) return NextResponse.json({ error: 'doctorNote_required' }, { status: 400 });

  const current = await getOne(type, params.id);
  if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  // Delivery is NOT a lock in the pilot: deliver() sets doctorNote + status='delivered'
  // idempotently, so re-POSTing after delivery simply updates the note.
  try {
    await deliver(type, params.id, doctorNote);
    return NextResponse.json({ item: await getOne(type, params.id) });
  } catch (e: any) {
    console.error('admin deliver error', e);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
}
