import { NextResponse } from 'next/server';
import { signSession, ADMIN_COOKIE } from '@/lib/admin/session';
export const runtime = 'nodejs';

export async function POST(req: Request) {
  const { password } = await req.json().catch(() => ({ password: '' }));
  const expected = process.env.ADMIN_DASHBOARD_PASSWORD || '';
  if (!expected || password !== expected) {
    return NextResponse.json({ error: '密码错误' }, { status: 401 });
  }
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, await signSession(process.env.ADMIN_SESSION_SECRET || ''), {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 12 * 3600,
  });
  return res;
}
