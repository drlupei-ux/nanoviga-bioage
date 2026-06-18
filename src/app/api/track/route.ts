// [CHANGE 2026-06-18] 原因：转化漏斗事件落库（public, 匿名）| 影响范围：funnel_events 集合
import { NextResponse } from 'next/server';
import { getDb } from '@/lib/admin/cloudbase';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const b = await req.json().catch(() => null);
    if (!b || typeof b.event !== 'string') return NextResponse.json({ ok: false }, { status: 400 });
    await getDb().collection('funnel_events').add({
      event: String(b.event).slice(0, 64),
      props: b.props && typeof b.props === 'object' && !Array.isArray(b.props) ? b.props : {},
      path: String(b.path || '').slice(0, 200),
      ts: typeof b.ts === 'string' ? b.ts : new Date().toISOString(),
      ua: (req.headers.get('user-agent') || '').slice(0, 300),
    });
  } catch {
    /* never fail the beacon */
  }
  return NextResponse.json({ ok: true });
}
