import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { verifySession, ADMIN_COOKIE } from './session';

/** True if the request carries a valid admin session cookie. */
export async function isAuthed(): Promise<boolean> {
  const token = cookies().get(ADMIN_COOKIE)?.value;
  return verifySession(process.env.ADMIN_SESSION_SECRET || '', token);
}

/**
 * Route-handler guard. Returns a 401 NextResponse if unauthenticated, else null.
 * Defense-in-depth: admin API routes call this directly so protection does not
 * depend solely on middleware (which does not run reliably on this Vercel setup).
 */
export async function adminGuard(): Promise<NextResponse | null> {
  if (await isAuthed()) return null;
  return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
}
