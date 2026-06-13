import { NextResponse, type NextRequest } from 'next/server';
import { verifySession, ADMIN_COOKIE } from '@/lib/admin/session';

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (pathname === '/api/admin/login' || pathname === '/admin/login') return NextResponse.next();
  const ok = await verifySession(process.env.ADMIN_SESSION_SECRET || '', req.cookies.get(ADMIN_COOKIE)?.value);
  if (ok) return NextResponse.next();
  if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const url = req.nextUrl.clone(); url.pathname = '/admin/login';
  return NextResponse.redirect(url);
}
