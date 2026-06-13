# Admin Review Dashboard — V0 MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** A user submits PLA/CBA → the case appears in Dr. Lu's `/admin` queue with a permanent `BAC-YYYY-NNNN` caseId → Dr. Lu opens it (auto `under_review`), writes one `doctorNote`, and clicks **Deliver** (`status='delivered'`). Admin email is disabled. Delivery itself happens manually outside the system.

**Architecture:** Next.js `/admin` pages + `/api/admin/*` routes run on Vercel and read/write CloudBase via `@cloudbase/node-sdk`. A signed httpOnly cookie + `middleware.ts` gate admin paths. Two cloud functions are edited (manual Monaco deploy) to disable email, write `status:'submitted'`, persist the CBA narrative, and allocate the caseId via an atomic `case_counters` transaction at submission.

**Tech Stack:** Next.js 14.2.5, TypeScript (strict), `@cloudbase/node-sdk`, Web Crypto (portable HMAC), `node:test` + `tsx`.

**Spec:** `docs/superpowers/specs/2026-06-13-admin-review-dashboard-v0-design.md`.

**Scope guard:** 3 statuses (`submitted`/`under_review`/`delivered`), 3 new DB fields (`status`/`caseId`/`doctorNote`) + CBA `report`. No priority/tags/approve/archive/PDF/timestamps/history. 13 tasks.

---

## Conventions

- After any Next.js/TS change the **gate** is: `PYTHONPATH=. python3 preflight_check.py` → `PYTHONPATH=. python3 tests/run_tests.py` → `npm run build`. Cloud-fn/TS logic units run via `npm test`.
- Commit after each task. Format `<type>(<scope>): <desc>`; body ends with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do NOT modify protected files: `src/lib/scoring.ts`, `src/context/AssessmentContext.tsx`, `tailwind.config.ts`, protected `.clinical-*`/`.pb-safe*` rules in `globals.css`.

---

### Task 1: Dependencies + test runner + env

**Files:** Modify `package.json`; create `docs/superpowers/plans/admin-env.example`; edit `.env.local` (gitignored).

- [ ] **Step 1: Install**
```bash
npm install @cloudbase/node-sdk
npm install -D tsx
```

- [ ] **Step 2: Add `test` script** to `package.json` `scripts` (keep existing):
```json
"test": "node --import tsx --test src/lib/admin/*.test.ts"
```

- [ ] **Step 3: Verify runner** — `npm test` → exits 0 ("tests 0", no files yet).

- [ ] **Step 4: Local env** — add to `.env.local`:
```
TCB_ENV_ID=bioage-compass-prod-9chaf35e573d
TENCENT_SECRET_ID=<CAM SecretId>
TENCENT_SECRET_KEY=<CAM SecretKey>
ADMIN_DASHBOARD_PASSWORD=<strong password>
ADMIN_SESSION_SECRET=<random 32+ chars>
```

- [ ] **Step 5: Committed example** `docs/superpowers/plans/admin-env.example`:
```
TCB_ENV_ID=bioage-compass-prod-9chaf35e573d
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
ADMIN_DASHBOARD_PASSWORD=
ADMIN_SESSION_SECRET=
```

- [ ] **Step 6: Commit**
```bash
git add package.json package-lock.json docs/superpowers/plans/admin-env.example
git commit -m "chore(admin): add @cloudbase/node-sdk + tsx runner + env reference"
```

---

### Task 2: `types.ts` (TDD)

**Files:** Create `src/lib/admin/types.ts`; test `src/lib/admin/types.test.ts`.

- [ ] **Step 1: Failing test** `src/lib/admin/types.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert';
import { formatCaseId, parseCaseId, isPending } from './types';

test('formatCaseId / parseCaseId round-trip', () => {
  assert.equal(formatCaseId(2026, 7), 'BAC-2026-0007');
  assert.deepEqual(parseCaseId('BAC-2026-0007'), { year: 2026, seq: 7 });
  assert.equal(parseCaseId('BCA-XXXX'), null);
});

test('isPending covers queue states', () => {
  assert.equal(isPending('submitted'), true);
  assert.equal(isPending('under_review'), true);
  assert.equal(isPending('delivered'), false);
});
```

- [ ] **Step 2: Run** `npm test` → FAIL (`Cannot find module './types'`).

- [ ] **Step 3: Implement** `src/lib/admin/types.ts`:
```ts
export type SubmissionType = 'pla' | 'cba';
export type ReviewStatus = 'submitted' | 'under_review' | 'delivered';

export function isPending(s: ReviewStatus): boolean {
  return s === 'submitted' || s === 'under_review';
}

export const CASE_ID_RE = /^BAC-(\d{4})-(\d{4})$/;
export function formatCaseId(year: number, seq: number): string {
  return `BAC-${year}-${String(seq).padStart(4, '0')}`;
}
export function parseCaseId(id: string): { year: number; seq: number } | null {
  const m = CASE_ID_RE.exec(id);
  return m ? { year: Number(m[1]), seq: Number(m[2]) } : null;
}

export interface AdminContact { phone?: string | null; phoneSuffix?: string | null; }

export interface AdminSubmission {
  id: string;
  type: SubmissionType;
  caseId: string | null;
  name: string;
  assessmentCode: string;
  l1RefCode?: string | null;
  status: ReviewStatus;
  submittedAt: string;
  headlineAge: number;
  actualAge: number;
  contact: AdminContact;
  // detail-only:
  report?: string | null;
  dimensionScores?: Record<string, number>;
  organAges?: Record<string, number>;
  score?: number;
  doctorNote?: string | null;
}
```

- [ ] **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/admin/types.ts src/lib/admin/types.test.ts
git commit -m "feat(admin): V0 types — status, caseId helpers, AdminSubmission"
```

---

### Task 3: `session.ts` (TDD)

**Files:** Create `src/lib/admin/session.ts`; test `src/lib/admin/session.test.ts`.

Portable HMAC (Web Crypto + `btoa/atob`) so the same code runs in Edge middleware and Node routes.

- [ ] **Step 1: Failing test** `src/lib/admin/session.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert';
import { signSession, verifySession, ADMIN_COOKIE } from './session';

const SECRET = 'test-secret-please-change-0123456789';

test('cookie name is stable', () => assert.equal(ADMIN_COOKIE, 'nv_admin'));
test('fresh token verifies', async () => {
  assert.equal(await verifySession(SECRET, await signSession(SECRET)), true);
});
test('wrong secret fails', async () => {
  assert.equal(await verifySession('another-secret-another-secret-00', await signSession(SECRET)), false);
});
test('tampered token fails', async () => {
  const t = await signSession(SECRET);
  assert.equal(await verifySession(SECRET, t.slice(0, -2) + 'xy'), false);
});
test('expired token fails', async () => {
  assert.equal(await verifySession(SECRET, await signSession(SECRET, -1000)), false);
});
test('malformed tokens fail safely', async () => {
  assert.equal(await verifySession(SECRET, ''), false);
  assert.equal(await verifySession(SECRET, null), false);
  assert.equal(await verifySession(SECRET, 'nodot'), false);
});
```

- [ ] **Step 2: Run** `npm test` → FAIL.

- [ ] **Step 3: Implement** `src/lib/admin/session.ts`:
```ts
export const ADMIN_COOKIE = 'nv_admin';
const enc = new TextEncoder();
const dec = new TextDecoder();

function bytesToB64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function b64urlToBytes(str: string): Uint8Array {
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/'));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function signSession(secret: string, ttlMs = 12 * 3600 * 1000): Promise<string> {
  const data = bytesToB64url(enc.encode(JSON.stringify({ exp: Date.now() + ttlMs })));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(data)));
  return `${data}.${bytesToB64url(sig)}`;
}
export async function verifySession(secret: string, token?: string | null): Promise<boolean> {
  if (!secret || !token || !token.includes('.')) return false;
  const [data, sig] = token.split('.');
  if (!data || !sig) return false;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), b64urlToBytes(sig), enc.encode(data));
    if (!ok) return false;
    const payload = JSON.parse(dec.decode(b64urlToBytes(data)));
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch { return false; }
}
```

- [ ] **Step 4: Run** `npm test` → PASS.

- [ ] **Step 5: Commit**
```bash
git add src/lib/admin/session.ts src/lib/admin/session.test.ts
git commit -m "feat(admin): portable HMAC session cookie"
```

---

### Task 4: `cloudbase.ts` — client, normalize (tested), helpers

**Files:** Create `src/lib/admin/cloudbase-sdk.d.ts`, `src/lib/admin/cloudbase.ts`; test `src/lib/admin/normalize.test.ts`.

- [ ] **Step 1: SDK shim** `src/lib/admin/cloudbase-sdk.d.ts`:
```ts
declare module '@cloudbase/node-sdk';
```

- [ ] **Step 2: Failing test** `src/lib/admin/normalize.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert';
import { normalize } from './cloudbase';

test('normalize PLA + legacy pending', () => {
  const o = normalize('pla', {
    _id: 'a1', name: '张三', age: 50, bioAge: 46, score: 72,
    dimensionScores: { 运动能力: 8 }, contact: '13800000000', assessmentCode: 'BCA-AB12',
    report: 'r', createdAt: '2026-06-10T00:00:00.000Z', status: 'pending',
  });
  assert.equal(o.type, 'pla'); assert.equal(o.id, 'a1');
  assert.equal(o.headlineAge, 46); assert.equal(o.actualAge, 50);
  assert.equal(o.status, 'submitted');            // legacy normalized
  assert.equal(o.contact.phone, '13800000000');
  assert.equal(o.caseId, null);
});

test('normalize CBA', () => {
  const o = normalize('cba', {
    _id: 'c1', assessmentCode: 'BCA-ZZ99', l1RefCode: 'BCA-AB12', name: '李四',
    phoneSuffix: '6212', actualAge: 60, phenoAge: 64, organAges: { 代谢活力: 62 },
    submittedAt: '2026-06-11T00:00:00.000Z', status: 'under_review',
    caseId: 'BAC-2026-0003', report: 'cba-r', doctorNote: '已沟通',
  });
  assert.equal(o.headlineAge, 64); assert.equal(o.status, 'under_review');
  assert.equal(o.contact.phoneSuffix, '6212'); assert.equal(o.caseId, 'BAC-2026-0003');
  assert.equal(o.doctorNote, '已沟通');
});
```

- [ ] **Step 3: Run** `npm test` → FAIL.

- [ ] **Step 4: Implement** `src/lib/admin/cloudbase.ts`:
```ts
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
```

- [ ] **Step 5: Run** `npm test` → PASS (`normalize.test.ts`; DB helpers exercised live in Task 7).

- [ ] **Step 6: Typecheck** — `npm run build` → compiles.

- [ ] **Step 7: Commit**
```bash
git add src/lib/admin/cloudbase.ts src/lib/admin/cloudbase-sdk.d.ts src/lib/admin/normalize.test.ts
git commit -m "feat(admin): cloudbase client, normalize, caseId tx/backfill, list/get/deliver"
```

---

### Task 5: Auth — login, logout, middleware

**Files:** Create `src/app/api/admin/login/route.ts`, `src/app/api/admin/logout/route.ts`, `src/middleware.ts`.

- [ ] **Step 1: Login** `src/app/api/admin/login/route.ts`:
```ts
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
```

- [ ] **Step 2: Logout** `src/app/api/admin/logout/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { ADMIN_COOKIE } from '@/lib/admin/session';
export const runtime = 'nodejs';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 });
  return res;
}
```

- [ ] **Step 3: Middleware** `src/middleware.ts`:
```ts
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
```

- [ ] **Step 4: Typecheck** — `npm run build` → compiles; build log lists `ƒ Middleware`.

- [ ] **Step 5: Smoke test** (`npm run dev` in another shell):
```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/submissions          # 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' -d '{"password":"wrong"}'                                  # 401
curl -s -i -X POST http://localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' -d "{\"password\":\"$ADMIN_DASHBOARD_PASSWORD\"}" | grep -i 'set-cookie\|HTTP/'  # 200 + Set-Cookie
```

- [ ] **Step 6: Commit**
```bash
git add src/app/api/admin/login/route.ts src/app/api/admin/logout/route.ts src/middleware.ts
git commit -m "feat(admin): login/logout routes + middleware gate"
```

---

### Task 6: Data API — list, detail, deliver

**Files:** Create `src/app/api/admin/submissions/route.ts`, `.../[type]/[id]/route.ts`, `.../[type]/[id]/deliver/route.ts`.

- [ ] **Step 1: List** `src/app/api/admin/submissions/route.ts`:
```ts
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
```

- [ ] **Step 2: Detail** `src/app/api/admin/submissions/[type]/[id]/route.ts` (backfill caseId + auto under_review):
```ts
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
```

- [ ] **Step 3: Deliver** `src/app/api/admin/submissions/[type]/[id]/deliver/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { getOne, deliver } from '@/lib/admin/cloudbase';
import type { SubmissionType } from '@/lib/admin/types';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const asType = (t: string): SubmissionType | null => (t === 'pla' || t === 'cba' ? t : null);

export async function POST(req: Request, { params }: { params: { type: string; id: string } }) {
  const type = asType(params.type);
  if (!type) return NextResponse.json({ error: 'bad_type' }, { status: 400 });
  const body = await req.json().catch(() => ({}));
  const doctorNote = String(body.doctorNote || '').trim();
  if (!doctorNote) return NextResponse.json({ error: 'doctorNote_required' }, { status: 400 });

  const current = await getOne(type, params.id);
  if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  if (current.status === 'delivered') {
    return NextResponse.json({ error: 'already_delivered' }, { status: 409 });
  }
  try {
    await deliver(type, params.id, doctorNote);
    return NextResponse.json({ item: await getOne(type, params.id) });
  } catch (e: any) {
    console.error('admin deliver error', e);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Typecheck** — `npm run build` → compiles.

- [ ] **Step 5: Commit**
```bash
git add "src/app/api/admin/submissions/route.ts" "src/app/api/admin/submissions/[type]/[id]/route.ts" "src/app/api/admin/submissions/[type]/[id]/deliver/route.ts"
git commit -m "feat(admin): list + detail (caseId backfill, auto under_review) + deliver routes"
```

---

### Task 7: Live data-layer smoke test

**Files:** none (verification).

- [ ] **Step 1: Identify a test record** — an existing `report_submissions` doc id (CloudBase console) or submit one PLA on the live site.

- [ ] **Step 2: Auth + list** (dev server running):
```bash
P="$ADMIN_DASHBOARD_PASSWORD"
curl -s -c /tmp/nv.txt -X POST http://localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' -d "{\"password\":\"$P\"}" >/dev/null
curl -s -b /tmp/nv.txt 'http://localhost:3000/api/admin/submissions?type=all&status=submitted' | head -c 600
```
Expected: `{ items: [...] }`, statuses normalized to `submitted`.

- [ ] **Step 3: Detail (backfill + auto-review)**
```bash
curl -s -b /tmp/nv.txt 'http://localhost:3000/api/admin/submissions/pla/<ID>' | head -c 600
```
Expected: `caseId` `BAC-2026-NNNN`, `status:'under_review'`, `report` present.

- [ ] **Step 4: Deliver + guard**
```bash
curl -s -b /tmp/nv.txt -X POST 'http://localhost:3000/api/admin/submissions/pla/<ID>/deliver' \
  -H 'Content-Type: application/json' -d '{"doctorNote":"已电话沟通，建议复查血脂"}'
curl -s -o /dev/null -w "%{http_code}\n" -b /tmp/nv.txt -X POST \
  'http://localhost:3000/api/admin/submissions/pla/<ID>/deliver' \
  -H 'Content-Type: application/json' -d '{"doctorNote":"x"}'   # already delivered → 409
```
Expected: first returns the record with `status:'delivered'` + `doctorNote`; second `409`. Confirm in CloudBase console.

- [ ] **Step 5: No commit.** Fix Task 4/6 code if any check fails.

---

### Task 8: UI helpers + login page

**Files:** Create `src/app/admin/AdminUI.tsx`, `src/app/admin/login/page.tsx`.

- [ ] **Step 1: Helpers** `src/app/admin/AdminUI.tsx`:
```tsx
'use client';
import { cn } from '@/lib/utils';
import type { ReviewStatus } from '@/lib/admin/types';

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  submitted: '待审核', under_review: '审核中', delivered: '已交付',
};
export function StatusBadge({ status }: { status: ReviewStatus }) {
  const tone: Record<ReviewStatus, string> = {
    submitted: 'bg-clinical-bg text-clinical-secondary',
    under_review: 'bg-clinical-jade/15 text-clinical-jade',
    delivered: 'bg-clinical-primary/15 text-clinical-primary',
  };
  return <span className={cn('px-2 py-0.5 rounded text-xs font-medium', tone[status])}>{STATUS_LABEL[status]}</span>;
}
export async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
```
> Verify `clinical-bg/secondary/jade/primary` exist: `grep -E "bg|secondary|jade|primary" tailwind.config.ts`. Substitute existing tokens if any are missing — do NOT edit `tailwind.config.ts`. Confirm `cn` is exported from `src/lib/utils` (grep it); if not, use `clsx`/template strings.

- [ ] **Step 2: Login page** `src/app/admin/login/page.tsx`:
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../AdminUI';

export default function AdminLogin() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError('');
    try { await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) }); router.push('/admin'); }
    catch { setError('密码错误，请重试。'); } finally { setBusy(false); }
  }
  return (
    <main className="min-h-screen flex items-center justify-center bg-clinical-bg px-4">
      <form onSubmit={submit} className="clinical-card w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold text-clinical-primary">案例审核台 · 登录</h1>
        <input type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="管理密码" autoFocus className="w-full h-12 px-3 rounded border text-base" />
        {error && <p className="text-sm text-clinical-coral">{error}</p>}
        <button type="submit" disabled={busy}
          className="w-full h-12 rounded bg-clinical-primary text-white font-medium disabled:opacity-60">
          {busy ? '验证中…' : '进入'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Typecheck** — `npm run build` → compiles.

- [ ] **Step 4: Commit**
```bash
git add src/app/admin/AdminUI.tsx src/app/admin/login/page.tsx
git commit -m "feat(admin): UI helpers + login page"
```

---

### Task 9: Queue list page

**Files:** Create `src/app/admin/page.tsx`.

- [ ] **Step 1: Implement** `src/app/admin/page.tsx`:
```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, StatusBadge } from './AdminUI';
import type { AdminSubmission, ReviewStatus, SubmissionType } from '@/lib/admin/types';

const STATUS_TABS: { key: ReviewStatus | 'all'; label: string }[] = [
  { key: 'submitted', label: '待审核' }, { key: 'under_review', label: '审核中' },
  { key: 'delivered', label: '已交付' }, { key: 'all', label: '全部' },
];
const TYPE_TABS: { key: SubmissionType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' }, { key: 'pla', label: 'PLA' }, { key: 'cba', label: 'CBA' },
];

export default function AdminList() {
  const [status, setStatus] = useState<ReviewStatus | 'all'>('submitted');
  const [type, setType] = useState<SubmissionType | 'all'>('all');
  const [items, setItems] = useState<AdminSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const q = new URLSearchParams({ type });
      if (status !== 'all') q.set('status', status);
      setItems((await api(`/api/admin/submissions?${q}`)).items);
    } catch (e: any) { setErr(e.message || '加载失败'); } finally { setLoading(false); }
  }, [type, status]);
  useEffect(() => { load(); }, [load]);

  return (
    <main className="min-h-screen bg-clinical-bg p-4 pb-safe">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-clinical-primary">案例审核台</h1>
        <button onClick={() => api('/api/admin/logout', { method: 'POST' }).then(() => location.href = '/admin/login')}
          className="text-sm text-clinical-muted">退出</button>
      </header>
      <div className="flex flex-wrap gap-2 mb-2">
        {TYPE_TABS.map(t => (
          <button key={t.key} onClick={() => setType(t.key)}
            className={`px-3 h-9 rounded text-sm ${type === t.key ? 'bg-clinical-primary text-white' : 'bg-white text-clinical-secondary'}`}>{t.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_TABS.map(t => (
          <button key={t.key} onClick={() => setStatus(t.key)}
            className={`px-3 h-9 rounded text-sm ${status === t.key ? 'bg-clinical-jade text-white' : 'bg-white text-clinical-secondary'}`}>{t.label}</button>
        ))}
      </div>
      {loading && <p className="text-clinical-muted">加载中…</p>}
      {err && <p className="text-clinical-coral">{err}</p>}
      {!loading && !err && items.length === 0 && <p className="text-clinical-muted">暂无记录。</p>}
      <ul className="space-y-2">
        {items.map(it => (
          <li key={`${it.type}-${it.id}`}>
            <Link href={`/admin/${it.type}/${it.id}`} className="clinical-card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="font-medium text-clinical-primary truncate">{it.name || '未具名'}</span>
                <div className="text-xs text-clinical-muted truncate">
                  {it.caseId || '未分配'} · {it.type.toUpperCase()} · {it.headlineAge}/{it.actualAge}岁 · {new Date(it.submittedAt).toLocaleString('zh-CN')}
                </div>
              </div>
              <StatusBadge status={it.status} />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck** — `npm run build` → compiles.

- [ ] **Step 3: Browser check** — `/admin` shows the queue; tabs refetch.

- [ ] **Step 4: Commit**
```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin): queue list page"
```

---

### Task 10: Case detail page (doctorNote + Deliver)

**Files:** Create `src/app/admin/[type]/[id]/page.tsx`.

- [ ] **Step 1: Implement** `src/app/admin/[type]/[id]/page.tsx`:
```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api, StatusBadge } from '../../AdminUI';
import type { AdminSubmission } from '@/lib/admin/types';

export default function AdminDetail() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [item, setItem] = useState<AdminSubmission | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { item } = await api(`/api/admin/submissions/${type}/${id}`);
      setItem(item); setNote(item.doctorNote || '');
    } catch (e: any) { setErr(e.message || '加载失败'); }
  }, [type, id]);
  useEffect(() => { load(); }, [load]);

  async function deliver() {
    if (!note.trim()) return;
    setBusy(true); setErr('');
    try {
      const { item } = await api(`/api/admin/submissions/${type}/${id}/deliver`, {
        method: 'POST', body: JSON.stringify({ doctorNote: note }),
      });
      setItem(item);
    } catch (e: any) { setErr(e.message || '操作失败'); } finally { setBusy(false); }
  }

  if (err) return <main className="p-4"><p className="text-clinical-coral">{err}</p></main>;
  if (!item) return <main className="p-4"><p className="text-clinical-muted">加载中…</p></main>;
  const delivered = item.status === 'delivered';

  return (
    <main className="min-h-screen bg-clinical-bg p-4 pb-safe">
      <a href="/admin" className="text-sm text-clinical-muted">← 返回队列</a>

      <section className="clinical-card mt-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-clinical-primary">{item.name || '未具名'}</h1>
          <StatusBadge status={item.status} />
        </div>
        <p className="text-xs text-clinical-muted mt-1">
          {item.caseId || '未分配'} · 评估编号 {item.assessmentCode} · {item.type.toUpperCase()}
          {item.l1RefCode ? ` · 关联 ${item.l1RefCode}` : ''}
        </p>
      </section>

      <section className="clinical-card mt-3">
        <h2 className="clinical-section-label">联系方式</h2>
        <p className="text-sm mt-2">手机：{item.contact.phone || (item.contact.phoneSuffix ? `尾号 ${item.contact.phoneSuffix}` : '未提供')}</p>
      </section>

      <section className="clinical-card mt-3">
        <h2 className="clinical-section-label">评估报告</h2>
        <p className="text-sm mt-1">身体年龄 {item.headlineAge} / 实际 {item.actualAge} 岁{typeof item.score === 'number' ? ` · 评分 ${item.score}` : ''}</p>
        {item.type === 'pla' && item.dimensionScores && (
          <ul className="text-sm mt-2 grid grid-cols-2 gap-1">
            {Object.entries(item.dimensionScores).map(([k, v]) => <li key={k}>{k}: {v}</li>)}
          </ul>
        )}
        {item.type === 'cba' && item.organAges && (
          <ul className="text-sm mt-2 grid grid-cols-2 gap-1">
            {Object.entries(item.organAges).map(([k, v]) => <li key={k}>{k}: {v}岁</li>)}
          </ul>
        )}
        <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{item.report || '报告缺失'}</div>
      </section>

      <section className="clinical-card mt-3">
        <h2 className="clinical-section-label">医生备注</h2>
        <textarea value={note} onChange={e => setNote(e.target.value)} disabled={delivered}
          placeholder="填写本案例的医生备注…" className="w-full h-28 p-2 mt-2 rounded border text-base disabled:opacity-70" />
      </section>

      <section className="mt-4">
        {!delivered ? (
          <button disabled={busy || !note.trim()} onClick={deliver}
            className="w-full h-12 rounded bg-clinical-primary text-white font-medium disabled:opacity-60">
            {busy ? '提交中…' : '确认交付'}
          </button>
        ) : (
          <p className="text-center text-sm text-clinical-jade">本案例已交付。</p>
        )}
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Typecheck** — `npm run build` → compiles.

- [ ] **Step 3: Browser check** — open a case (status flips to 审核中), write a note, 确认交付 → status 已交付, textarea locks.

- [ ] **Step 4: Commit**
```bash
git add "src/app/admin/[type]/[id]/page.tsx"
git commit -m "feat(admin): case detail — view, contact, doctorNote, deliver"
```

---

### Task 11: `generateReport` cloud function

**Files:** Modify `cloud-functions/generateReport/index.js`. Deploy via Monaco console (CLAUDE.md §8).

- [ ] **Step 1: Add caseId helper** — insert near top-level helpers:
```js
// [CHANGE 2026-06-13] 原因：提交时分配可读 caseId(BAC-YYYY-NNNN)，原子事务避免并发重复 | 影响范围：generateReport 入库
async function allocateCaseId() {
  const envId = process.env.TCB_ENV_ID || 'bioage-compass-prod-9chaf35e573d';
  const db = require('@cloudbase/node-sdk').init({ env: envId }).database();
  const year = new Date().getFullYear();
  let seq = 0;
  await db.runTransaction(async (tx) => {
    const ref = tx.collection('case_counters').doc(String(year));
    const snap = await ref.get();
    const cur = snap && snap.data ? (Array.isArray(snap.data) ? snap.data[0] : snap.data) : null;
    if (!cur) { seq = 1; await ref.set({ year, seq }); }
    else { seq = (cur.seq || 0) + 1; await ref.update({ seq }); }
  });
  return `BAC-${year}-${String(seq).padStart(4, '0')}`;
}
```

- [ ] **Step 2: Allocate before the insert payload** (just before `const payload = JSON.stringify({`):
```js
// [CHANGE 2026-06-13] 原因：caseId 提交时分配；失败不阻塞，由 admin 详情读取时 backfill | 影响范围：generateReport
let caseId = null;
try { caseId = await allocateCaseId(); } catch (e) { console.log('caseId alloc failed:', e.message); }
```

- [ ] **Step 3: Update the `data` object** — replace the trailing line:
```js
        report: rawReport, createdAt: new Date().toISOString(), status: 'pending'
```
with:
```js
        report: rawReport, createdAt: new Date().toISOString(),
        // [CHANGE 2026-06-13] 原因：新生命周期 + 可读编号 | 影响范围：report_submissions 文档
        status: 'submitted', caseId
```

- [ ] **Step 4: Gate the email send** — change:
```js
  let emailResult = 'skipped';
  if (EMAIL_AUTH_CODE) {
```
to:
```js
  // [CHANGE 2026-06-13] 原因：停用管理员邮件，改为站内审核台；保留代码可逆 | 影响范围：generateReport 邮件
  const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';
  let emailResult = 'skipped';
  if (EMAIL_ENABLED && EMAIL_AUTH_CODE) {
```

- [ ] **Step 5: Deploy** via Monaco console; save.

- [ ] **Step 6: Verify** (CLAUDE.md §8 curl), then confirm in CloudBase console the new doc has `status:'submitted'`, `caseId` `BAC-2026-NNNN`, and `emailResult:'skipped'`.

- [ ] **Step 7: Commit source mirror**
```bash
git add cloud-functions/generateReport/index.js
git commit -m "feat(generateReport): email off + status submitted + caseId at submission"
```

---

### Task 12: `analyzeCBA` cloud function

**Files:** Modify `cloud-functions/analyzeCBA/index.js`. Deploy via Monaco console.

- [ ] **Step 1: Add caseId helper** (takes existing `tcbApp`):
```js
// [CHANGE 2026-06-13] 原因：提交时分配可读 caseId，原子事务避免并发重复 | 影响范围：analyzeCBA 入库
async function allocateCaseId(app) {
  const db = app.database();
  const year = new Date().getFullYear();
  let seq = 0;
  await db.runTransaction(async (tx) => {
    const ref = tx.collection('case_counters').doc(String(year));
    const snap = await ref.get();
    const cur = snap && snap.data ? (Array.isArray(snap.data) ? snap.data[0] : snap.data) : null;
    if (!cur) { seq = 1; await ref.set({ year, seq }); }
    else { seq = (cur.seq || 0) + 1; await ref.update({ seq }); }
  });
  return `BAC-${year}-${String(seq).padStart(4, '0')}`;
}
```

- [ ] **Step 2: Declare doc-id holder + allocate** — just before `const dbPayload = {`:
```js
// [CHANGE 2026-06-13] 原因：caseId 提交时分配；SDK 不可用则留空由 admin backfill | 影响范围：analyzeCBA
let cbaDocId = null;
let caseId = null;
if (tcbApp) { try { caseId = await allocateCaseId(tcbApp); } catch (e) { console.log('caseId alloc failed:', e.message); } }
```

- [ ] **Step 3: Add fields to `dbPayload`** — change:
```js
      submittedAt: submittedAt ?? new Date().toISOString(),
      status:      'pending',
    };
```
to:
```js
      submittedAt: submittedAt ?? new Date().toISOString(),
      // [CHANGE 2026-06-13] 原因：新生命周期 + 可读编号 | 影响范围：cba_submissions 文档
      status:      'submitted',
      caseId,
    };
```

- [ ] **Step 4: Capture inserted `_id`** — change the SDK insert:
```js
        await tcbApp.database().collection('cba_submissions').add(dbPayload);
```
to:
```js
        const _add = await tcbApp.database().collection('cba_submissions').add(dbPayload);
        cbaDocId = _add && (_add.id || _add._id || (_add.ids && _add.ids[0])) || null;
```

- [ ] **Step 5: Persist narrative** — after `rawCba` is produced (report generation step, ~line 349+):
```js
// [CHANGE 2026-06-13] 原因：把生成的 CBA 全文写回文档，供审核台展示（原仅在邮件） | 影响范围：cba_submissions.report
if (cbaDocId && rawCba) {
  try { await tcbApp.database().collection('cba_submissions').doc(cbaDocId).update({ report: rawCba }); }
  catch (e) { console.log('CBA report persist failed:', e.message); }
}
```
(Use the actual local variable name for the generated report if it is not `rawCba`.)

- [ ] **Step 6: Gate the email send** — change:
```js
    let emailResult = 'skipped';
    if (EMAIL_AUTH_CODE) {
```
to:
```js
    // [CHANGE 2026-06-13] 原因：停用管理员邮件，改为站内审核台；保留代码可逆 | 影响范围：analyzeCBA 邮件
    const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';
    let emailResult = 'skipped';
    if (EMAIL_ENABLED && EMAIL_AUTH_CODE) {
```

- [ ] **Step 7: Deploy** via Monaco console; save.

- [ ] **Step 8: Verify** — submit a CBA case; confirm the `cba_submissions` doc has `status:'submitted'`, `caseId`, a populated `report`, and `emailResult:'skipped'`.

- [ ] **Step 9: Commit source mirror**
```bash
git add cloud-functions/analyzeCBA/index.js
git commit -m "feat(analyzeCBA): email off + status submitted + caseId + persist report"
```

---

### Task 13: Full gate + deploy + production smoke

- [ ] **Step 1: Gates**
```bash
PYTHONPATH=. python3 preflight_check.py
PYTHONPATH=. python3 tests/run_tests.py
npm test
npm run build
```
Expected: preflight OK, risk tests PASS, admin units PASS, build clean.

- [ ] **Step 2: Vercel env vars** — set `TCB_ENV_ID`, `TENCENT_SECRET_ID`, `TENCENT_SECRET_KEY`, `ADMIN_DASHBOARD_PASSWORD`, `ADMIN_SESSION_SECRET`. Leave `EMAIL_ENABLED` unset (email off).

- [ ] **Step 3: Deploy** — `git push origin main:clinical`.

- [ ] **Step 4: Production smoke** — `https://nanoviga.com/admin` → login → open a `submitted` case (becomes 审核中, caseId shown) → write doctorNote → 确认交付 (→ 已交付). Confirm writes in CloudBase console.

- [ ] **Step 5: Email-off check** — submit a fresh PLA + CBA from the live site; verify no admin email, both appear in `/admin` as `submitted` with a `caseId`, and CBA detail shows its narrative.

---

## Self-Review

- **Spec coverage:** caseId at submission (T4/T11/T12) · admin login (T5/T8) · pending list (T9) · detail page (T10) · single doctorNote (T4/T6/T10) · EMAIL_ENABLED=false (T11/T12) · lifecycle submitted→under_review→delivered (T4/T6/T10) · CBA narrative persist (T12) · manual delivery (no code — by design). All V0 spec items map to a task. Removed/postponed items appear nowhere — confirmed.
- **Placeholder scan:** none — every code step is complete; verification steps give exact commands + expected output.
- **Type consistency:** `AdminSubmission`, `ReviewStatus` (3 values), `SubmissionType`, `formatCaseId`/`parseCaseId`/`isPending`, `normalize`, `allocateCaseId`, `backfillCaseId`, `listSubmissions`, `getOne`, `ensureUnderReview`, `deliver`, `signSession`/`verifySession`/`ADMIN_COOKIE` defined once, used consistently across tasks. The cloud-function `allocateCaseId` mirrors the TS transaction logic and writes the same `BAC-YYYY-NNNN` format.

---

## Execution Handoff
(Choose subagent-driven or inline execution after the user approves this plan.)
