# Admin Review Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace admin email notifications with a password-gated in-app `/admin` review dashboard that reads PLA/CBA submissions from CloudBase, lets the admin move each case through a 5-state lifecycle with priority/tags/doctor sign-off, and writes decisions back — while allocating a permanent `BAC-YYYY-NNNN` caseId at submission.

**Architecture:** Next.js `/admin` pages + `/api/admin/*` routes run server-side on Vercel and talk to CloudBase via `@cloudbase/node-sdk` (admin credential). A signed httpOnly cookie + `middleware.ts` gate all admin paths. Two CloudBase cloud functions are edited (manual Monaco deploy) to disable email behind a flag, write `status:'submitted'`, persist the CBA narrative, and allocate the caseId via an atomic `case_counters` transaction.

**Tech Stack:** Next.js 14.2.5, TypeScript (strict), `@cloudbase/node-sdk`, Web Crypto (portable HMAC for Edge middleware + Node routes), `node:test` + `tsx` for unit tests, Tailwind `clinical.*` tokens.

**Spec:** `docs/superpowers/specs/2026-06-13-admin-review-dashboard-design.md` (r3).

**Branch/deploy:** work on `feat/clinical-email-system`; ship via `git push origin main:clinical` (Vercel watches `clinical`). Cloud functions deploy manually via the legacy Monaco console (runtime CLAUDE.md §8).

---

## File Structure

**New (Next.js — ships via Vercel):**
- `src/lib/admin/types.ts` — enums, `AdminSubmission`, transition map + guard, caseId format/parse
- `src/lib/admin/session.ts` — portable HMAC cookie sign/verify (Web Crypto)
- `src/lib/admin/cloudbase.ts` — admin SDK singleton, collection map, normalize, list/get/update, caseId transaction + backfill
- `src/lib/admin/cloudbase-sdk.d.ts` — module shim (`@cloudbase/node-sdk` ships no types)
- `src/lib/admin/*.test.ts` — `node:test` units for types/session
- `src/middleware.ts` — auth gate for `/admin/*` + `/api/admin/*`
- `src/app/api/admin/login/route.ts`, `logout/route.ts`
- `src/app/api/admin/submissions/route.ts` (list)
- `src/app/api/admin/submissions/[type]/[id]/route.ts` (detail GET, with caseId backfill)
- `src/app/api/admin/submissions/[type]/[id]/review/route.ts` (POST actions)
- `src/app/admin/login/page.tsx`, `src/app/admin/page.tsx` (list), `src/app/admin/[type]/[id]/page.tsx` (detail)
- `src/app/admin/AdminUI.tsx` — shared client helpers (badges, fetch wrapper)
- append print styles to `src/app/globals.css` (new `@media print` block; protected rules untouched)

**Edited:**
- `package.json` — add `@cloudbase/node-sdk` dep, `tsx` devDep, `test` script
- `cloud-functions/generateReport/index.js` — email flag + `status:'submitted'` + caseId + priority/tags
- `cloud-functions/analyzeCBA/index.js` — same + persist `report`

**New collection:** `case_counters` (created lazily by the cloud functions).

---

## Conventions for every task

- After any Next.js/TS change, the **gate** is: `PYTHONPATH=. python3 preflight_check.py` → `PYTHONPATH=. python3 tests/run_tests.py` → `npm run build`. The first two must stay green (they are unrelated to this work but are the project's mandatory gate); the build must typecheck.
- Cloud-function logic uses `node --test`.
- Commit after each task. Commit format `<type>(<scope>): <desc>`; end body with `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Do NOT modify protected files: `src/lib/scoring.ts`, `src/context/AssessmentContext.tsx`, `tailwind.config.ts`, protected `.clinical-*`/`.pb-safe*` rules in `globals.css`.

---

# Phase 0 — Foundations

### Task 1: Add dependencies + test runner

**Files:**
- Modify: `package.json`

- [ ] **Step 1: Install runtime + dev deps**

Run:
```bash
npm install @cloudbase/node-sdk
npm install -D tsx
```
Expected: both added to `package.json`, no peer-dep errors.

- [ ] **Step 2: Add a `test` script**

Edit `package.json` `scripts` to add (keep existing scripts):
```json
"test": "node --import tsx --test src/lib/admin/*.test.ts"
```

- [ ] **Step 3: Verify the runner works on an empty match**

Run: `npm test`
Expected: exits 0 with "tests 0" (no test files yet) — confirms `tsx` loader is wired.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(admin): add @cloudbase/node-sdk + tsx test runner"
```

---

### Task 2: Document required env vars

**Files:**
- Modify: `.env.local` (local only — NOT committed; already gitignored)
- Create: `docs/superpowers/plans/admin-env.example` (committed reference)

- [ ] **Step 1: Add local env vars** to `.env.local`:
```
TCB_ENV_ID=bioage-compass-prod-9chaf35e573d
TENCENT_SECRET_ID=<CAM SecretId>
TENCENT_SECRET_KEY=<CAM SecretKey>
ADMIN_DASHBOARD_PASSWORD=<choose a strong password>
ADMIN_SESSION_SECRET=<random 32+ char string>
```

- [ ] **Step 2: Create committed example** `docs/superpowers/plans/admin-env.example`:
```
# Vercel + local env for the Admin Review Dashboard
TCB_ENV_ID=bioage-compass-prod-9chaf35e573d
TENCENT_SECRET_ID=
TENCENT_SECRET_KEY=
ADMIN_DASHBOARD_PASSWORD=
ADMIN_SESSION_SECRET=
```

- [ ] **Step 3: Commit** (only the example; `.env.local` is ignored)
```bash
git add docs/superpowers/plans/admin-env.example
git commit -m "docs(admin): env var reference for dashboard"
```

---

# Phase 1 — Core logic (TDD)

### Task 3: `types.ts` — enums, AdminSubmission, transition guard, caseId format

**Files:**
- Create: `src/lib/admin/types.ts`
- Test: `src/lib/admin/types.test.ts`

- [ ] **Step 1: Write the failing test** `src/lib/admin/types.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert';
import { canTransition, nextStatus, formatCaseId, parseCaseId, PRIORITY_ORDER } from './types';

test('canTransition allows the linear happy path', () => {
  assert.equal(canTransition('start_review', 'submitted'), true);
  assert.equal(canTransition('approve', 'under_review'), true);
  assert.equal(canTransition('mark_delivered', 'approved'), true);
  assert.equal(canTransition('archive', 'delivered'), true);
});

test('canTransition rejects skips and bad states', () => {
  assert.equal(canTransition('approve', 'submitted'), false);
  assert.equal(canTransition('mark_delivered', 'under_review'), false);
  assert.equal(canTransition('start_review', 'archived'), false);
});

test('archive is allowed from any non-archived state', () => {
  for (const s of ['submitted', 'under_review', 'approved', 'delivered'] as const) {
    assert.equal(canTransition('archive', s), true);
  }
  assert.equal(canTransition('archive', 'archived'), false);
});

test('nextStatus returns the target for status-changing actions', () => {
  assert.equal(nextStatus('start_review'), 'under_review');
  assert.equal(nextStatus('archive'), 'archived');
  assert.equal(nextStatus('set_priority'), null); // no status change
});

test('formatCaseId / parseCaseId round-trip', () => {
  assert.equal(formatCaseId(2026, 7), 'BAC-2026-0007');
  assert.deepEqual(parseCaseId('BAC-2026-0007'), { year: 2026, seq: 7 });
  assert.equal(parseCaseId('BCA-XXXX'), null);
});

test('PRIORITY_ORDER sorts vip first', () => {
  assert.ok(PRIORITY_ORDER.vip < PRIORITY_ORDER.attention);
  assert.ok(PRIORITY_ORDER.attention < PRIORITY_ORDER.normal);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './types'`.

- [ ] **Step 3: Implement** `src/lib/admin/types.ts`:
```ts
export type SubmissionType = 'pla' | 'cba';

export type ReviewStatus =
  | 'submitted' | 'under_review' | 'approved' | 'delivered' | 'archived';

export type Priority = 'normal' | 'attention' | 'vip';

export type ReviewAction =
  | 'start_review' | 'approve' | 'mark_delivered' | 'archive'
  | 'set_priority' | 'set_tags';

export const PRIORITY_ORDER: Record<Priority, number> = {
  vip: 0, attention: 1, normal: 2,
};

// status-changing actions: allowed `from` states + resulting `to` state
const STATUS_RULES: Record<
  'start_review' | 'approve' | 'mark_delivered' | 'archive',
  { from: ReviewStatus[]; to: ReviewStatus }
> = {
  start_review:   { from: ['submitted'],     to: 'under_review' },
  approve:        { from: ['under_review'],  to: 'approved' },
  mark_delivered: { from: ['approved'],      to: 'delivered' },
  archive:        { from: ['submitted', 'under_review', 'approved', 'delivered'], to: 'archived' },
};

export function canTransition(action: ReviewAction, from: ReviewStatus): boolean {
  if (action === 'set_priority' || action === 'set_tags') return from !== 'archived';
  const rule = STATUS_RULES[action];
  return !!rule && rule.from.includes(from);
}

export function nextStatus(action: ReviewAction): ReviewStatus | null {
  if (action === 'set_priority' || action === 'set_tags') return null;
  return STATUS_RULES[action].to;
}

export const CASE_ID_RE = /^BAC-(\d{4})-(\d{4})$/;
export function formatCaseId(year: number, seq: number): string {
  return `BAC-${year}-${String(seq).padStart(4, '0')}`;
}
export function parseCaseId(id: string): { year: number; seq: number } | null {
  const m = CASE_ID_RE.exec(id);
  return m ? { year: Number(m[1]), seq: Number(m[2]) } : null;
}

export interface AdminContact {
  phone?: string | null;
  phoneSuffix?: string | null;
  wechat?: string | null;
  email?: string | null;
}

export interface AdminSubmission {
  id: string;
  type: SubmissionType;
  caseId: string | null;
  name: string;
  assessmentCode: string;
  l1RefCode?: string | null;
  status: ReviewStatus;
  priority: Priority;
  tags: string[];
  submittedAt: string;
  headlineAge: number;
  actualAge: number;
  contact: AdminContact;
  // detail-only:
  report?: string | null;
  dimensionScores?: Record<string, number>;
  organAges?: Record<string, number>;
  biomarkers?: Record<string, unknown>;
  score?: number;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewNote?: string | null;
  doctorSummary?: string | null;
  doctorAdvice?: string | null;
  doctorNextStep?: string | null;
  deliveredAt?: string | null;
  deliveryChannel?: string | null;
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test`
Expected: PASS (all `types.test.ts` cases).

- [ ] **Step 5: Commit**
```bash
git add src/lib/admin/types.ts src/lib/admin/types.test.ts
git commit -m "feat(admin): status/priority enums, transition guard, caseId format"
```

---

### Task 4: `session.ts` — portable HMAC cookie

**Files:**
- Create: `src/lib/admin/session.ts`
- Test: `src/lib/admin/session.test.ts`

Uses Web Crypto (`globalThis.crypto.subtle`) + `btoa/atob` so the same code runs in Edge middleware and Node routes.

- [ ] **Step 1: Write the failing test** `src/lib/admin/session.test.ts`:
```ts
import test from 'node:test';
import assert from 'node:assert';
import { signSession, verifySession, ADMIN_COOKIE } from './session';

const SECRET = 'test-secret-please-change-0123456789';

test('cookie name is stable', () => {
  assert.equal(ADMIN_COOKIE, 'nv_admin');
});

test('a freshly signed token verifies', async () => {
  const token = await signSession(SECRET);
  assert.equal(await verifySession(SECRET, token), true);
});

test('a token signed with another secret fails', async () => {
  const token = await signSession(SECRET);
  assert.equal(await verifySession('other-secret-other-secret-000000', token), false);
});

test('a tampered token fails', async () => {
  const token = await signSession(SECRET);
  assert.equal(await verifySession(SECRET, token.slice(0, -2) + 'xy'), false);
});

test('an expired token fails', async () => {
  const token = await signSession(SECRET, -1000); // already expired
  assert.equal(await verifySession(SECRET, token), false);
});

test('empty / malformed tokens fail safely', async () => {
  assert.equal(await verifySession(SECRET, ''), false);
  assert.equal(await verifySession(SECRET, null), false);
  assert.equal(await verifySession(SECRET, 'nodot'), false);
});
```

- [ ] **Step 2: Run test, verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './session'`.

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
  const s = str.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw', enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'],
  );
}

/** ttlMs default 12h. Negative ttl yields an already-expired token (for tests). */
export async function signSession(secret: string, ttlMs = 12 * 3600 * 1000): Promise<string> {
  const payload = { exp: Date.now() + ttlMs };
  const data = bytesToB64url(enc.encode(JSON.stringify(payload)));
  const key = await hmacKey(secret);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)));
  return `${data}.${bytesToB64url(sig)}`;
}

export async function verifySession(secret: string, token?: string | null): Promise<boolean> {
  if (!secret || !token || !token.includes('.')) return false;
  const [data, sig] = token.split('.');
  if (!data || !sig) return false;
  try {
    const key = await hmacKey(secret);
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), enc.encode(data));
    if (!ok) return false;
    const payload = JSON.parse(dec.decode(b64urlToBytes(data)));
    return typeof payload.exp === 'number' && payload.exp > Date.now();
  } catch {
    return false;
  }
}
```

- [ ] **Step 4: Run test, verify it passes**

Run: `npm test`
Expected: PASS (all `session.test.ts` cases).

- [ ] **Step 5: Commit**
```bash
git add src/lib/admin/session.ts src/lib/admin/session.test.ts
git commit -m "feat(admin): portable HMAC session cookie sign/verify"
```

---

# Phase 2 — CloudBase data layer

### Task 5: SDK type shim + client singleton + collection map

**Files:**
- Create: `src/lib/admin/cloudbase-sdk.d.ts`
- Create: `src/lib/admin/cloudbase.ts` (first slice: init + constants + normalize)
- Test: `src/lib/admin/normalize.test.ts`

- [ ] **Step 1: Module shim** `src/lib/admin/cloudbase-sdk.d.ts` (package ships no types):
```ts
declare module '@cloudbase/node-sdk';
```

- [ ] **Step 2: Write the failing test** `src/lib/admin/normalize.test.ts` (normalize is a pure function, test it in isolation):
```ts
import test from 'node:test';
import assert from 'node:assert';
import { normalize } from './cloudbase';

test('normalize maps a PLA doc', () => {
  const out = normalize('pla', {
    _id: 'a1', name: '张三', age: 50, gender: 'male', bioAge: 46, score: 72,
    dimensionScores: { 运动能力: 8 }, contact: '13800000000', assessmentCode: 'BCA-AB12',
    report: '...', createdAt: '2026-06-10T00:00:00.000Z', status: 'pending',
  });
  assert.equal(out.type, 'pla');
  assert.equal(out.id, 'a1');
  assert.equal(out.headlineAge, 46);
  assert.equal(out.actualAge, 50);
  assert.equal(out.status, 'submitted');       // legacy pending -> submitted
  assert.equal(out.priority, 'normal');         // default when missing
  assert.deepEqual(out.tags, []);
  assert.equal(out.contact.phone, '13800000000');
  assert.equal(out.caseId, null);
});

test('normalize maps a CBA doc', () => {
  const out = normalize('cba', {
    _id: 'c1', assessmentCode: 'BCA-ZZ99', l1RefCode: 'BCA-AB12', name: '李四',
    phoneSuffix: '6212', actualAge: 60, gender: 'female', phenoAge: 64,
    organAges: { 代谢活力: 62 }, biomarkers: { hsCRP: 1.2 },
    submittedAt: '2026-06-11T00:00:00.000Z', status: 'under_review',
    caseId: 'BAC-2026-0003', priority: 'vip', tags: ['糖代谢'],
  });
  assert.equal(out.type, 'cba');
  assert.equal(out.headlineAge, 64);
  assert.equal(out.actualAge, 60);
  assert.equal(out.status, 'under_review');
  assert.equal(out.priority, 'vip');
  assert.deepEqual(out.tags, ['糖代谢']);
  assert.equal(out.contact.phoneSuffix, '6212');
  assert.equal(out.contact.wechat, null);       // not captured today
  assert.equal(out.caseId, 'BAC-2026-0003');
});
```

- [ ] **Step 3: Run test, verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './cloudbase'`.

- [ ] **Step 4: Implement** `src/lib/admin/cloudbase.ts` (this slice — more added in Task 6/7):
```ts
import tcb from '@cloudbase/node-sdk';
import type { AdminSubmission, Priority, ReviewStatus, SubmissionType } from './types';

export const COLLECTION: Record<SubmissionType, string> = {
  pla: 'report_submissions',
  cba: 'cba_submissions',
};

let _app: any = null;
export function getApp(): any {
  if (!_app) {
    _app = tcb.init({
      env: process.env.TCB_ENV_ID,
      secretId: process.env.TENCENT_SECRET_ID,
      secretKey: process.env.TENCENT_SECRET_KEY,
    });
  }
  return _app;
}
export function getDb(): any {
  return getApp().database();
}

function normStatus(s: unknown): ReviewStatus {
  const v = String(s ?? 'submitted');
  if (v === 'pending') return 'submitted'; // legacy normalization
  const allowed = ['submitted', 'under_review', 'approved', 'delivered', 'archived'];
  return (allowed.includes(v) ? v : 'submitted') as ReviewStatus;
}
function normPriority(p: unknown): Priority {
  return p === 'vip' || p === 'attention' ? p : 'normal';
}

/** Pure mapper from a raw CloudBase doc to the normalized admin shape. */
export function normalize(type: SubmissionType, d: any): AdminSubmission {
  const base = {
    id: String(d._id ?? ''),
    type,
    caseId: d.caseId ?? null,
    name: d.name ?? '',
    assessmentCode: d.assessmentCode ?? '',
    status: normStatus(d.status),
    priority: normPriority(d.priority),
    tags: Array.isArray(d.tags) ? d.tags : [],
    reviewedAt: d.reviewedAt ?? null,
    reviewedBy: d.reviewedBy ?? null,
    reviewNote: d.reviewNote ?? null,
    doctorSummary: d.doctorSummary ?? null,
    doctorAdvice: d.doctorAdvice ?? null,
    doctorNextStep: d.doctorNextStep ?? null,
    deliveredAt: d.deliveredAt ?? null,
    deliveryChannel: d.deliveryChannel ?? null,
    report: d.report ?? null,
  };
  if (type === 'pla') {
    return {
      ...base,
      l1RefCode: null,
      submittedAt: d.createdAt ?? d.submittedAt ?? '',
      headlineAge: Number(d.bioAge ?? 0),
      actualAge: Number(d.age ?? 0),
      score: Number(d.score ?? 0),
      dimensionScores: d.dimensionScores ?? {},
      contact: { phone: d.contact ?? null, phoneSuffix: null, wechat: null, email: null },
    };
  }
  return {
    ...base,
    l1RefCode: d.l1RefCode ?? null,
    submittedAt: d.submittedAt ?? d.createdAt ?? '',
    headlineAge: Number(d.phenoAge ?? 0),
    actualAge: Number(d.actualAge ?? 0),
    organAges: d.organAges ?? {},
    biomarkers: d.biomarkers ?? {},
    contact: { phone: null, phoneSuffix: d.phoneSuffix ?? null, wechat: null, email: null },
  };
}
```

- [ ] **Step 5: Run test, verify it passes**

Run: `npm test`
Expected: PASS (`normalize.test.ts`). (`getApp`/`getDb` are not exercised here — no network.)

- [ ] **Step 6: Commit**
```bash
git add src/lib/admin/cloudbase.ts src/lib/admin/cloudbase-sdk.d.ts src/lib/admin/normalize.test.ts
git commit -m "feat(admin): cloudbase client + pure normalize() for PLA/CBA docs"
```

---

### Task 6: caseId transaction + backfill + list/get/update helpers

**Files:**
- Modify: `src/lib/admin/cloudbase.ts` (append)

These hit the live DB, so they are verified by the Phase-2 runtime smoke test (Task 11), not by `node:test`. Build-typecheck is the gate here.

- [ ] **Step 1: Append the data helpers** to `src/lib/admin/cloudbase.ts`:
```ts
import { COLLECTION as _C } from './cloudbase'; // (no-op; helpers below live in same file)
import { formatCaseId, type AdminSubmission, type Priority, type ReviewStatus } from './types';

const COUNTERS = 'case_counters';

/** Atomically allocate the next BAC id via a CloudBase transaction. */
export async function allocateCaseId(): Promise<string> {
  const db = getDb();
  const year = new Date().getFullYear();
  const id = String(year);
  let seq = 0;
  await db.runTransaction(async (tx: any) => {
    const ref = tx.collection(COUNTERS).doc(id);
    const snap = await ref.get();
    const cur = snap && snap.data
      ? (Array.isArray(snap.data) ? snap.data[0] : snap.data)
      : null;
    if (!cur) {
      seq = 1;
      await ref.set({ year, seq });
    } else {
      seq = (cur.seq || 0) + 1;
      await ref.update({ seq });
    }
  });
  return formatCaseId(year, seq);
}

/** Heal a record missing caseId. Idempotent: returns the existing id if present. */
export async function backfillCaseId(type: SubmissionType, _id: string): Promise<string | null> {
  const db = getDb();
  const snap = await db.collection(COLLECTION[type]).doc(_id).get();
  const doc = snap?.data?.[0];
  if (!doc) return null;
  if (doc.caseId) return doc.caseId;
  const caseId = await allocateCaseId();
  await db.collection(COLLECTION[type]).doc(_id).update({ caseId });
  return caseId;
}

export interface ListFilter {
  type: SubmissionType | 'all';
  status?: ReviewStatus;
  priority?: Priority;
  tag?: string;
}

async function listOne(type: SubmissionType, f: ListFilter): Promise<AdminSubmission[]> {
  const db = getDb();
  const where: Record<string, unknown> = {};
  if (f.status) where.status = f.status === 'submitted'
    ? db.command.in(['submitted', 'pending']) // include legacy
    : f.status;
  if (f.priority) where.priority = f.priority;
  const orderField = type === 'pla' ? 'createdAt' : 'submittedAt';
  const res = await db.collection(COLLECTION[type])
    .where(where).orderBy(orderField, 'desc').limit(200).get();
  let rows = (res.data || []).map((d: any) => normalize(type, d));
  if (f.tag) rows = rows.filter(r => r.tags.includes(f.tag!));
  return rows;
}

export async function listSubmissions(f: ListFilter): Promise<AdminSubmission[]> {
  const types: SubmissionType[] = f.type === 'all' ? ['pla', 'cba'] : [f.type];
  const all = (await Promise.all(types.map(t => listOne(t, f)))).flat();
  const order: Record<Priority, number> = { vip: 0, attention: 1, normal: 2 };
  return all.sort((a, b) =>
    order[a.priority] - order[b.priority] ||
    (b.submittedAt.localeCompare(a.submittedAt)),
  );
}

export async function getOne(type: SubmissionType, id: string): Promise<AdminSubmission | null> {
  const db = getDb();
  const res = await db.collection(COLLECTION[type]).doc(id).get();
  const doc = res?.data?.[0];
  return doc ? normalize(type, doc) : null;
}

/** Apply a vetted review patch (status/notes/priority/tags). */
export async function updateReview(
  type: SubmissionType, id: string, patch: Record<string, unknown>,
): Promise<void> {
  const db = getDb();
  await db.collection(COLLECTION[type]).doc(id).update(patch);
}
```

> Note: the duplicate `import { COLLECTION as _C }` line above is illustrative of "same file" — when implementing, do NOT re-import from self. Place these helpers in the SAME `cloudbase.ts` so `COLLECTION`, `getDb`, `normalize`, `SubmissionType` are already in scope. Remove the self-import line.

- [ ] **Step 2: Clean up imports** — ensure `cloudbase.ts` has a single top import block:
```ts
import tcb from '@cloudbase/node-sdk';
import {
  formatCaseId,
  type AdminSubmission, type Priority, type ReviewStatus, type SubmissionType,
} from './types';
```
and no self-import. `SubmissionType` is now imported (used by COLLECTION + helpers).

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: compiles with no TS errors. (Runtime DB behavior verified in Task 11.)

- [ ] **Step 4: Commit**
```bash
git add src/lib/admin/cloudbase.ts
git commit -m "feat(admin): caseId transaction, backfill, list/get/update helpers"
```

---

# Phase 3 — Auth routes + middleware

### Task 7: Login / logout routes

**Files:**
- Create: `src/app/api/admin/login/route.ts`
- Create: `src/app/api/admin/logout/route.ts`

- [ ] **Step 1: Implement login** `src/app/api/admin/login/route.ts`:
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
  const token = await signSession(process.env.ADMIN_SESSION_SECRET || '');
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, token, {
    httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge: 12 * 3600,
  });
  return res;
}
```

- [ ] **Step 2: Implement logout** `src/app/api/admin/logout/route.ts`:
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

- [ ] **Step 3: Typecheck**

Run: `npm run build`
Expected: compiles.

- [ ] **Step 4: Commit**
```bash
git add src/app/api/admin/login/route.ts src/app/api/admin/logout/route.ts
git commit -m "feat(admin): login/logout routes with signed cookie"
```

---

### Task 8: Middleware gate

**Files:**
- Create: `src/middleware.ts`

- [ ] **Step 1: Implement** `src/middleware.ts`:
```ts
import { NextResponse, type NextRequest } from 'next/server';
import { verifySession, ADMIN_COOKIE } from '@/lib/admin/session';

export const config = { matcher: ['/admin/:path*', '/api/admin/:path*'] };

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // public endpoints
  if (pathname === '/api/admin/login' || pathname === '/admin/login') {
    return NextResponse.next();
  }
  const token = req.cookies.get(ADMIN_COOKIE)?.value;
  const ok = await verifySession(process.env.ADMIN_SESSION_SECRET || '', token);
  if (ok) return NextResponse.next();

  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }
  const url = req.nextUrl.clone();
  url.pathname = '/admin/login';
  return NextResponse.redirect(url);
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run build`
Expected: compiles; build log lists `ƒ Middleware`.

- [ ] **Step 3: Manual smoke test** (dev server)

Run in one shell: `npm run dev`
In another:
```bash
# unauthenticated API → 401
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/admin/submissions
# wrong password → 401
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' -d '{"password":"wrong"}'
# correct password → 200 + Set-Cookie (use your .env.local value)
curl -s -i -X POST http://localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' -d "{\"password\":\"$ADMIN_DASHBOARD_PASSWORD\"}" | grep -i 'set-cookie\|HTTP/'
```
Expected: `401`, `401`, then `200` with a `Set-Cookie: nv_admin=...`.

- [ ] **Step 4: Commit**
```bash
git add src/middleware.ts
git commit -m "feat(admin): middleware gate for /admin and /api/admin"
```

---

# Phase 4 — Data API routes

### Task 9: List route

**Files:**
- Create: `src/app/api/admin/submissions/route.ts`

- [ ] **Step 1: Implement** `src/app/api/admin/submissions/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { listSubmissions, type ListFilter } from '@/lib/admin/cloudbase';
import type { Priority, ReviewStatus, SubmissionType } from '@/lib/admin/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const type = (q.get('type') || 'all') as SubmissionType | 'all';
  const filter: ListFilter = { type };
  const status = q.get('status'); if (status) filter.status = status as ReviewStatus;
  const priority = q.get('priority'); if (priority) filter.priority = priority as Priority;
  const tag = q.get('tag'); if (tag) filter.tag = tag;
  try {
    const items = await listSubmissions(filter);
    // lean list: strip heavy detail fields
    const lean = items.map(({ report, biomarkers, dimensionScores, organAges, ...rest }) => rest);
    return NextResponse.json({ items: lean });
  } catch (e: any) {
    console.error('admin list error', e);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
}
```
(Export `ListFilter` from `cloudbase.ts` if not already — it is defined there in Task 6.)

- [ ] **Step 2: Typecheck** — `npm run build` → compiles.

- [ ] **Step 3: Commit**
```bash
git add src/app/api/admin/submissions/route.ts
git commit -m "feat(admin): GET submissions list route"
```

---

### Task 10: Detail GET (with caseId backfill) + review POST

**Files:**
- Create: `src/app/api/admin/submissions/[type]/[id]/route.ts`
- Create: `src/app/api/admin/submissions/[type]/[id]/review/route.ts`

- [ ] **Step 1: Implement detail GET** `.../[type]/[id]/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { getOne, backfillCaseId } from '@/lib/admin/cloudbase';
import type { SubmissionType } from '@/lib/admin/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function asType(t: string): SubmissionType | null {
  return t === 'pla' || t === 'cba' ? t : null;
}

export async function GET(_req: Request, { params }: { params: { type: string; id: string } }) {
  const type = asType(params.type);
  if (!type) return NextResponse.json({ error: 'bad_type' }, { status: 400 });
  try {
    let item = await getOne(type, params.id);
    if (!item) return NextResponse.json({ error: 'not_found' }, { status: 404 });
    if (!item.caseId) {
      const caseId = await backfillCaseId(type, params.id);
      if (caseId) item = { ...item, caseId };
    }
    return NextResponse.json({ item });
  } catch (e: any) {
    console.error('admin detail error', e);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
}
```

- [ ] **Step 2: Implement review POST** `.../[type]/[id]/review/route.ts`:
```ts
import { NextResponse } from 'next/server';
import { getOne, updateReview } from '@/lib/admin/cloudbase';
import {
  canTransition, nextStatus,
  type Priority, type ReviewAction, type SubmissionType,
} from '@/lib/admin/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const REVIEWER = '管理员';
function asType(t: string): SubmissionType | null {
  return t === 'pla' || t === 'cba' ? t : null;
}

export async function POST(req: Request, { params }: { params: { type: string; id: string } }) {
  const type = asType(params.type);
  if (!type) return NextResponse.json({ error: 'bad_type' }, { status: 400 });

  const body = await req.json().catch(() => null);
  if (!body || !body.action) return NextResponse.json({ error: 'bad_request' }, { status: 400 });
  const action = body.action as ReviewAction;
  const fromStatus = body.fromStatus;

  const current = await getOne(type, params.id);
  if (!current) return NextResponse.json({ error: 'not_found' }, { status: 404 });

  // stale-tab guard
  if (fromStatus && fromStatus !== current.status) {
    return NextResponse.json({ error: 'conflict', current: current.status }, { status: 409 });
  }
  if (!canTransition(action, current.status)) {
    return NextResponse.json({ error: 'invalid_transition', current: current.status }, { status: 409 });
  }

  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { reviewedAt: now, reviewedBy: REVIEWER };

  switch (action) {
    case 'approve': {
      const summary = (body.doctorSummary || '').trim();
      if (!summary) return NextResponse.json({ error: 'doctorSummary_required' }, { status: 400 });
      patch.status = nextStatus(action);
      patch.doctorSummary = summary;
      patch.doctorAdvice = (body.doctorAdvice || '').trim() || null;
      patch.doctorNextStep = (body.doctorNextStep || '').trim() || null;
      break;
    }
    case 'mark_delivered': {
      patch.status = nextStatus(action);
      patch.deliveredAt = now;
      patch.deliveryChannel = 'manual';
      break;
    }
    case 'archive': {
      patch.status = nextStatus(action);
      if (body.reviewNote) patch.reviewNote = String(body.reviewNote).trim();
      break;
    }
    case 'start_review': {
      patch.status = nextStatus(action);
      break;
    }
    case 'set_priority': {
      const p = body.priority as Priority;
      if (p !== 'normal' && p !== 'attention' && p !== 'vip') {
        return NextResponse.json({ error: 'bad_priority' }, { status: 400 });
      }
      patch.priority = p;
      break;
    }
    case 'set_tags': {
      if (!Array.isArray(body.tags)) return NextResponse.json({ error: 'bad_tags' }, { status: 400 });
      patch.tags = body.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 20);
      break;
    }
    default:
      return NextResponse.json({ error: 'unknown_action' }, { status: 400 });
  }

  try {
    await updateReview(type, params.id, patch);
    const updated = await getOne(type, params.id);
    return NextResponse.json({ item: updated });
  } catch (e: any) {
    console.error('admin review error', e);
    return NextResponse.json({ error: 'db_error' }, { status: 500 });
  }
}
```

- [ ] **Step 3: Typecheck** — `npm run build` → compiles.

- [ ] **Step 4: Commit**
```bash
git add "src/app/api/admin/submissions/[type]/[id]/route.ts" "src/app/api/admin/submissions/[type]/[id]/review/route.ts"
git commit -m "feat(admin): detail GET (caseId backfill) + review POST with transition guard"
```

---

### Task 11: Live data-layer smoke test

**Files:** none (verification task)

- [ ] **Step 1: Seed/identify a test record** — submit one PLA report through the live site (or confirm an existing `report_submissions` doc id in the CloudBase console).

- [ ] **Step 2: Authenticate + list** (dev server running, cookie jar):
```bash
P="$ADMIN_DASHBOARD_PASSWORD"
curl -s -c /tmp/nv.txt -X POST http://localhost:3000/api/admin/login \
  -H 'Content-Type: application/json' -d "{\"password\":\"$P\"}" >/dev/null
curl -s -b /tmp/nv.txt 'http://localhost:3000/api/admin/submissions?type=all&status=submitted' | head -c 800
```
Expected: JSON `{ items: [...] }` with normalized records (status `submitted`, priority `normal`).

- [ ] **Step 3: Detail + caseId backfill**
```bash
curl -s -b /tmp/nv.txt 'http://localhost:3000/api/admin/submissions/pla/<ID>' | head -c 800
```
Expected: a `caseId` of form `BAC-2026-NNNN` present (allocated/backfilled), plus `report` text.

- [ ] **Step 4: Transition + guard**
```bash
# start review
curl -s -b /tmp/nv.txt -X POST 'http://localhost:3000/api/admin/submissions/pla/<ID>/review' \
  -H 'Content-Type: application/json' -d '{"action":"start_review","fromStatus":"submitted"}'
# invalid skip → expect 409
curl -s -o /dev/null -w "%{http_code}\n" -b /tmp/nv.txt -X POST \
  'http://localhost:3000/api/admin/submissions/pla/<ID>/review' \
  -H 'Content-Type: application/json' -d '{"action":"mark_delivered","fromStatus":"under_review"}'
# approve without summary → expect 400
curl -s -o /dev/null -w "%{http_code}\n" -b /tmp/nv.txt -X POST \
  'http://localhost:3000/api/admin/submissions/pla/<ID>/review' \
  -H 'Content-Type: application/json' -d '{"action":"approve","fromStatus":"under_review"}'
```
Expected: status → `under_review`; then `409`; then `400`. Confirm in CloudBase console the doc shows `caseId`, `status:'under_review'`, `reviewedAt`.

- [ ] **Step 5: No commit** (verification only). If any check fails, fix the relevant Task 5/6/10 code before proceeding.

---

# Phase 5 — Admin UI

### Task 12: Shared UI helpers

**Files:**
- Create: `src/app/admin/AdminUI.tsx`

- [ ] **Step 1: Implement** `src/app/admin/AdminUI.tsx`:
```tsx
'use client';
import { cn } from '@/lib/utils';
import type { Priority, ReviewStatus } from '@/lib/admin/types';

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  submitted: '待审核', under_review: '审核中', approved: '已批准',
  delivered: '已交付', archived: '已归档',
};
export const PRIORITY_LABEL: Record<Priority, string> = {
  vip: 'VIP', attention: '重点', normal: '常规',
};

export function StatusBadge({ status }: { status: ReviewStatus }) {
  const tone: Record<ReviewStatus, string> = {
    submitted: 'bg-clinical-bg text-clinical-secondary',
    under_review: 'bg-clinical-jade/15 text-clinical-jade',
    approved: 'bg-clinical-jade/25 text-clinical-jade',
    delivered: 'bg-clinical-primary/15 text-clinical-primary',
    archived: 'bg-clinical-bg text-clinical-muted',
  };
  return <span className={cn('px-2 py-0.5 rounded text-xs font-medium', tone[status])}>{STATUS_LABEL[status]}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const tone: Record<Priority, string> = {
    vip: 'bg-clinical-coral/20 text-clinical-coral',
    attention: 'bg-clinical-amber/20 text-clinical-amber',
    normal: 'bg-clinical-bg text-clinical-muted',
  };
  return <span className={cn('px-2 py-0.5 rounded text-xs font-medium', tone[priority])}>{PRIORITY_LABEL[priority]}</span>;
}

export async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
```
> If any `clinical-*` token used above (e.g. `clinical-coral`, `clinical-amber`) does not exist in `tailwind.config.ts`, substitute an existing token — do NOT edit `tailwind.config.ts`. Check available tokens first: `grep -A40 'clinical' tailwind.config.ts`.

- [ ] **Step 2: Verify tokens exist** — `grep -E "coral|amber|jade|muted|secondary|primary" tailwind.config.ts`. Replace any missing token names in `AdminUI.tsx` with present ones.

- [ ] **Step 3: Typecheck** — `npm run build` → compiles.

- [ ] **Step 4: Commit**
```bash
git add src/app/admin/AdminUI.tsx
git commit -m "feat(admin): shared status/priority badges + api helper"
```

---

### Task 13: Login page

**Files:**
- Create: `src/app/admin/login/page.tsx`

- [ ] **Step 1: Implement** `src/app/admin/login/page.tsx`:
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
    e.preventDefault();
    setBusy(true); setError('');
    try {
      await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ password }) });
      router.push('/admin');
    } catch {
      setError('密码错误，请重试。');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-clinical-bg px-4">
      <form onSubmit={submit} className="clinical-card w-full max-w-sm space-y-4">
        <h1 className="text-lg font-semibold text-clinical-primary">案例审核台 · 登录</h1>
        <input
          type="password" value={password} onChange={e => setPassword(e.target.value)}
          placeholder="管理密码" autoFocus
          className="w-full h-12 px-3 rounded border text-base"
        />
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

- [ ] **Step 2: Typecheck** — `npm run build` → compiles.

- [ ] **Step 3: Browser check** — `npm run dev`, open `http://localhost:3000/admin` → should redirect to `/admin/login`; enter the password → lands on `/admin` (will render in Task 14).

- [ ] **Step 4: Commit**
```bash
git add src/app/admin/login/page.tsx
git commit -m "feat(admin): login page"
```

---

### Task 14: List page

**Files:**
- Create: `src/app/admin/page.tsx`

- [ ] **Step 1: Implement** `src/app/admin/page.tsx`:
```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, StatusBadge, PriorityBadge } from './AdminUI';
import type { AdminSubmission, ReviewStatus, SubmissionType } from '@/lib/admin/types';

const STATUS_TABS: { key: ReviewStatus | 'all'; label: string }[] = [
  { key: 'submitted', label: '待审核' }, { key: 'under_review', label: '审核中' },
  { key: 'approved', label: '已批准' }, { key: 'delivered', label: '已交付' },
  { key: 'archived', label: '已归档' }, { key: 'all', label: '全部' },
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
      const { items } = await api(`/api/admin/submissions?${q.toString()}`);
      setItems(items);
    } catch (e: any) { setErr(e.message || '加载失败'); }
    finally { setLoading(false); }
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
            <Link href={`/admin/${it.type}/${it.id}`}
              className="clinical-card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-clinical-primary truncate">{it.name || '未具名'}</span>
                  <PriorityBadge priority={it.priority} />
                </div>
                <div className="text-xs text-clinical-muted truncate">
                  {it.caseId || '未分配'} · {it.type.toUpperCase()} · {it.headlineAge}/{it.actualAge}岁 · {new Date(it.submittedAt).toLocaleString('zh-CN')}
                </div>
                {it.tags.length > 0 && <div className="text-xs text-clinical-secondary truncate">#{it.tags.join(' #')}</div>}
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

- [ ] **Step 3: Browser check** — `/admin` shows the pending list; switching tabs refetches.

- [ ] **Step 4: Commit**
```bash
git add src/app/admin/page.tsx
git commit -m "feat(admin): submissions list page with type/status filters"
```

---

### Task 15: Detail page (view + contact + actions)

**Files:**
- Create: `src/app/admin/[type]/[id]/page.tsx`

- [ ] **Step 1: Implement** `src/app/admin/[type]/[id]/page.tsx`:
```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api, StatusBadge, PriorityBadge } from '../../AdminUI';
import type { AdminSubmission, Priority, ReviewAction } from '@/lib/admin/types';

export default function AdminDetail() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [item, setItem] = useState<AdminSubmission | null>(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  // approve modal fields
  const [showApprove, setShowApprove] = useState(false);
  const [summary, setSummary] = useState('');
  const [advice, setAdvice] = useState('');
  const [nextStep, setNextStep] = useState('');
  const [tagInput, setTagInput] = useState('');

  const load = useCallback(async () => {
    try { const { item } = await api(`/api/admin/submissions/${type}/${id}`); setItem(item); }
    catch (e: any) { setErr(e.message || '加载失败'); }
  }, [type, id]);
  useEffect(() => { load(); }, [load]);

  const act = useCallback(async (action: ReviewAction, extra: Record<string, unknown> = {}) => {
    if (!item) return;
    setBusy(true); setErr('');
    try {
      const { item: updated } = await api(`/api/admin/submissions/${type}/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ action, fromStatus: item.status, ...extra }),
      });
      setItem(updated); setShowApprove(false);
    } catch (e: any) { setErr(e.message || '操作失败'); }
    finally { setBusy(false); }
  }, [item, type, id]);

  if (err) return <main className="p-4"><p className="text-clinical-coral">{err}</p></main>;
  if (!item) return <main className="p-4"><p className="text-clinical-muted">加载中…</p></main>;

  return (
    <main className="min-h-screen bg-clinical-bg p-4 pb-safe admin-print-root">
      <a href="/admin" className="text-sm text-clinical-muted no-print">← 返回列表</a>

      {/* 1. Header */}
      <section className="clinical-card mt-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-clinical-primary">{item.name || '未具名'}</h1>
          <div className="flex items-center gap-2"><PriorityBadge priority={item.priority} /><StatusBadge status={item.status} /></div>
        </div>
        <p className="text-xs text-clinical-muted mt-1">
          {item.caseId || '未分配'} · 评估编号 {item.assessmentCode} · {item.type.toUpperCase()}
          {item.l1RefCode ? ` · 关联 ${item.l1RefCode}` : ''}
        </p>
        {/* priority selector */}
        <div className="flex gap-2 mt-3 no-print">
          {(['normal', 'attention', 'vip'] as Priority[]).map(p => (
            <button key={p} disabled={busy || item.status === 'archived'}
              onClick={() => act('set_priority', { priority: p })}
              className={`px-2 h-9 rounded text-sm ${item.priority === p ? 'bg-clinical-primary text-white' : 'bg-white'}`}>
              {p === 'vip' ? 'VIP' : p === 'attention' ? '重点' : '常规'}
            </button>
          ))}
        </div>
        {/* tags editor */}
        <div className="mt-3 no-print">
          <div className="flex flex-wrap gap-2 mb-2">
            {item.tags.map(t => (
              <button key={t} disabled={busy || item.status === 'archived'}
                onClick={() => act('set_tags', { tags: item.tags.filter(x => x !== t) })}
                className="px-2 py-0.5 rounded text-xs bg-clinical-bg">#{t} ✕</button>
            ))}
          </div>
          <div className="flex gap-2">
            <input value={tagInput} onChange={e => setTagInput(e.target.value)} placeholder="新增标签"
              className="flex-1 h-9 px-2 rounded border text-base" />
            <button disabled={busy || !tagInput.trim() || item.status === 'archived'}
              onClick={() => { act('set_tags', { tags: [...item.tags, tagInput.trim()] }); setTagInput(''); }}
              className="px-3 h-9 rounded bg-clinical-jade text-white text-sm">加</button>
          </div>
        </div>
      </section>

      {/* 2. Contact */}
      <section className="clinical-card mt-3">
        <h2 className="clinical-section-label">联系方式</h2>
        <ul className="text-sm space-y-1 mt-2">
          <li>手机：{item.contact.phone || (item.contact.phoneSuffix ? `尾号 ${item.contact.phoneSuffix}` : '未提供')}</li>
          <li>微信：{item.contact.wechat || '未提供'}</li>
          <li>邮箱：{item.contact.email || '未提供'}</li>
        </ul>
      </section>

      {/* 3. Report body */}
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
        <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">
          {item.report || '报告缺失'}
        </div>
      </section>

      {/* 4. Doctor sign-off (read-back) */}
      {(item.doctorSummary || item.doctorAdvice || item.doctorNextStep) && (
        <section className="clinical-card mt-3">
          <h2 className="clinical-section-label">医生签字</h2>
          {item.doctorSummary && <p className="text-sm mt-1"><strong>小结：</strong>{item.doctorSummary}</p>}
          {item.doctorAdvice && <p className="text-sm mt-1"><strong>建议：</strong>{item.doctorAdvice}</p>}
          {item.doctorNextStep && <p className="text-sm mt-1"><strong>下一步：</strong>{item.doctorNextStep}</p>}
          <p className="text-xs text-clinical-muted mt-2">{item.reviewedBy} · {item.reviewedAt ? new Date(item.reviewedAt).toLocaleString('zh-CN') : ''}</p>
        </section>
      )}

      {/* 5. Actions */}
      <section className="mt-4 flex flex-wrap gap-2 no-print">
        {item.status === 'submitted' && (
          <button disabled={busy} onClick={() => act('start_review')} className="px-4 h-12 rounded bg-clinical-jade text-white">开始审核</button>
        )}
        {item.status === 'under_review' && (
          <button disabled={busy} onClick={() => setShowApprove(true)} className="px-4 h-12 rounded bg-clinical-primary text-white">批准</button>
        )}
        {item.status === 'approved' && (
          <button disabled={busy} onClick={() => act('mark_delivered')} className="px-4 h-12 rounded bg-clinical-primary text-white">标记已交付</button>
        )}
        {item.status !== 'archived' && (
          <button disabled={busy} onClick={() => act('archive', { reviewNote: '' })} className="px-4 h-12 rounded bg-white text-clinical-secondary border">归档</button>
        )}
        <button onClick={() => window.print()} className="px-4 h-12 rounded bg-white text-clinical-secondary border">导出 PDF</button>
      </section>

      {/* Approve modal */}
      {showApprove && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center p-4 no-print">
          <div className="clinical-card w-full max-w-md space-y-3">
            <h3 className="font-semibold text-clinical-primary">批准并填写医生签字</h3>
            <textarea value={summary} onChange={e => setSummary(e.target.value)} placeholder="病例小结（必填）" className="w-full h-20 p-2 rounded border text-base" />
            <textarea value={advice} onChange={e => setAdvice(e.target.value)} placeholder="临床建议（可选）" className="w-full h-20 p-2 rounded border text-base" />
            <textarea value={nextStep} onChange={e => setNextStep(e.target.value)} placeholder="下一步（可选）" className="w-full h-16 p-2 rounded border text-base" />
            <div className="flex gap-2 justify-end">
              <button onClick={() => setShowApprove(false)} className="px-4 h-12 rounded bg-white border">取消</button>
              <button disabled={busy || !summary.trim()}
                onClick={() => act('approve', { doctorSummary: summary, doctorAdvice: advice, doctorNextStep: nextStep })}
                className="px-4 h-12 rounded bg-clinical-primary text-white disabled:opacity-60">确认批准</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Typecheck** — `npm run build` → compiles.

- [ ] **Step 3: Browser check** — open a case from the list; exercise start_review → approve (modal, summary required) → mark_delivered; archive; priority/tags buttons update live.

- [ ] **Step 4: Commit**
```bash
git add "src/app/admin/[type]/[id]/page.tsx"
git commit -m "feat(admin): case detail page — view, contact, priority/tags, lifecycle actions"
```

---

### Task 16: Print styles for Export PDF

**Files:**
- Modify: `src/app/globals.css` (append a NEW block; do not touch protected rules)

- [ ] **Step 1: Append** to the END of `src/app/globals.css`:
```css
/* [CHANGE 2026-06-13] 原因：Admin 导出 PDF 打印样式（新增，不改动受保护规则） | 影响范围：/admin/[type]/[id] 打印 */
@media print {
  .no-print { display: none !important; }
  .admin-print-root { background: #fff !important; padding: 0 !important; }
  .admin-print-root .clinical-card { box-shadow: none !important; border: 1px solid #e5e7eb; break-inside: avoid; }
  a[href]:after { content: ''; } /* suppress URL expansion */
}
```

- [ ] **Step 2: Verify protected rules untouched**

Run: `git diff src/app/globals.css`
Expected: diff shows ONLY the appended `@media print` block; no changes to `.clinical-card` base rule, `.clinical-section-label`, or `.pb-safe*`.

- [ ] **Step 3: Browser check** — on a detail page, browser Print preview shows the report without nav/action buttons; "Save as PDF" produces a clean document.

- [ ] **Step 4: Commit**
```bash
git add src/app/globals.css
git commit -m "feat(admin): print stylesheet for Export PDF"
```

---

# Phase 6 — Cloud functions (manual Monaco deploy)

> These edit two large `index.js` files. Apply minimal diffs with the runtime CLAUDE.md §8 change annotation. Both are deployed via the legacy Monaco console; verify with curl after each deploy. Email is OFF whenever `EMAIL_ENABLED` is unset.

### Task 17: `generateReport` — email flag + submitted + caseId + defaults

**Files:**
- Modify: `cloud-functions/generateReport/index.js`

- [ ] **Step 1: Add the caseId helper** — insert this function near the other top-level helpers (e.g. just above `module.exports` or after the DeepSeek helper):
```js
// [CHANGE 2026-06-13] 原因：提交时分配可读 caseId(BAC-YYYY-NNNN)，原子事务避免并发重复 | 影响范围：generateReport 入库
async function allocateCaseId() {
  const envId = process.env.TCB_ENV_ID || 'bioage-compass-prod-9chaf35e573d';
  const app = require('@cloudbase/node-sdk').init({ env: envId });
  const db = app.database();
  const year = new Date().getFullYear();
  const id = String(year);
  let seq = 0;
  await db.runTransaction(async (tx) => {
    const ref = tx.collection('case_counters').doc(id);
    const snap = await ref.get();
    const cur = snap && snap.data ? (Array.isArray(snap.data) ? snap.data[0] : snap.data) : null;
    if (!cur) { seq = 1; await ref.set({ year, seq }); }
    else { seq = (cur.seq || 0) + 1; await ref.update({ seq }); }
  });
  return `BAC-${year}-${String(seq).padStart(4, '0')}`;
}
```

- [ ] **Step 2: Allocate before building the insert payload** — just before the `const payload = JSON.stringify({ ... })` block (~line 279), add:
```js
// [CHANGE 2026-06-13] 原因：caseId 提交时分配；失败不阻塞提交，由 admin 详情读取时 backfill | 影响范围：generateReport
let caseId = null;
try { caseId = await allocateCaseId(); } catch (e) { console.log('caseId alloc failed:', e.message); }
```

- [ ] **Step 3: Update the inserted `data` object** (currently ~lines 281-287). Replace:
```js
      data: {
        name: name||'', age: age||0, gender: gender||'',
        bioAge: bioAge||0, score: score||0,
        dimensionScores: dimensionScores||{},
        contact: contact||'', assessmentCode: assessmentCode||'',
        report: rawReport, createdAt: new Date().toISOString(), status: 'pending'
      }
```
with:
```js
      data: {
        name: name||'', age: age||0, gender: gender||'',
        bioAge: bioAge||0, score: score||0,
        dimensionScores: dimensionScores||{},
        contact: contact||'', assessmentCode: assessmentCode||'',
        report: rawReport, createdAt: new Date().toISOString(),
        // [CHANGE 2026-06-13] 原因：新生命周期/可读编号/优先级/标签 | 影响范围：report_submissions 文档
        status: 'submitted', caseId, priority: 'normal', tags: []
      }
```

- [ ] **Step 4: Gate the email send** — wrap the existing email block (~lines 312-324). Change:
```js
  let emailResult = 'skipped';
  if (EMAIL_AUTH_CODE) {
```
to:
```js
  // [CHANGE 2026-06-13] 原因：停用管理员邮件通知，改为站内审核台；保留代码可逆 | 影响范围：generateReport 邮件
  const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';
  let emailResult = 'skipped';
  if (EMAIL_ENABLED && EMAIL_AUTH_CODE) {
```
(The matching `} else { ... }` and closing brace stay; the `else` log message remains valid.)

- [ ] **Step 5: Deploy via Monaco console** (runtime CLAUDE.md §8 `applyEdits` chunked injection). Save in the console.

- [ ] **Step 6: Verify** with the documented curl (CLAUDE.md §8):
```bash
curl -s -X POST 'https://bioage-compass-prod-9chaf35e573d-1405252881.ap-shanghai.app.tcloudbase.com/generateReport' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"summary","name":"测试","age":40,"gender":"male","bioAge":36,"score":78,"dimensionScores":{"运动能力":8,"身心平衡":7,"营养代谢":6,"睡眠质量":9,"遗传因素":8,"环境因素":7}}' \
  --max-time 60
```
Then in CloudBase console confirm the new `report_submissions` doc has `status:'submitted'`, a `caseId` `BAC-2026-NNNN`, `priority:'normal'`, `tags:[]`, and that `emailResult` is `skipped` (email off).

- [ ] **Step 7: Commit the source mirror**
```bash
git add cloud-functions/generateReport/index.js
git commit -m "feat(generateReport): email flag off + status submitted + caseId allocation + defaults"
```

---

### Task 18: `analyzeCBA` — email flag + submitted + caseId + persist report

**Files:**
- Modify: `cloud-functions/analyzeCBA/index.js`

- [ ] **Step 1: Add the same caseId helper** — insert (taking the existing app to avoid re-init; `analyzeCBA` already has `tcbApp`):
```js
// [CHANGE 2026-06-13] 原因：提交时分配可读 caseId，原子事务避免并发重复 | 影响范围：analyzeCBA 入库
async function allocateCaseId(app) {
  const db = app.database();
  const year = new Date().getFullYear();
  const id = String(year);
  let seq = 0;
  await db.runTransaction(async (tx) => {
    const ref = tx.collection('case_counters').doc(id);
    const snap = await ref.get();
    const cur = snap && snap.data ? (Array.isArray(snap.data) ? snap.data[0] : snap.data) : null;
    if (!cur) { seq = 1; await ref.set({ year, seq }); }
    else { seq = (cur.seq || 0) + 1; await ref.update({ seq }); }
  });
  return `BAC-${year}-${String(seq).padStart(4, '0')}`;
}
```

- [ ] **Step 2: Allocate before `dbPayload`** (~line 300, before `const dbPayload = {`):
```js
// [CHANGE 2026-06-13] 原因：caseId 提交时分配；SDK 不可用则留空由 admin backfill | 影响范围：analyzeCBA
let caseId = null;
if (tcbApp) { try { caseId = await allocateCaseId(tcbApp); } catch (e) { console.log('caseId alloc failed:', e.message); } }
```

- [ ] **Step 3: Update `dbPayload`** (~lines 301-313). Change the trailing fields:
```js
      submittedAt: submittedAt ?? new Date().toISOString(),
      status:      'pending',
    };
```
to:
```js
      submittedAt: submittedAt ?? new Date().toISOString(),
      // [CHANGE 2026-06-13] 原因：新生命周期/可读编号/优先级/标签 | 影响范围：cba_submissions 文档
      status:      'submitted',
      caseId,
      priority:    'normal',
      tags:        [],
    };
```

- [ ] **Step 4: Capture the inserted `_id`** — at the SDK insert (~line 319) change:
```js
        await tcbApp.database().collection('cba_submissions').add(dbPayload);
```
to:
```js
        const _add = await tcbApp.database().collection('cba_submissions').add(dbPayload);
        var cbaDocId = _add && (_add.id || _add._id || (_add.ids && _add.ids[0])) || null;
```
(`var` so it is reachable later in the function regardless of block scoping; if the file is strict, declare `let cbaDocId = null;` just before the SDK-path `if (tcbApp)` block instead and assign here.)

- [ ] **Step 5: Persist the narrative after report generation** — after `rawCba` is produced (step 4 of the handler, ~line 349+, once the report text exists), add:
```js
// [CHANGE 2026-06-13] 原因：把生成的 CBA 全文写回文档，供审核台展示（原仅在邮件） | 影响范围：cba_submissions.report
if (cbaDocId && rawCba) {
  try { await tcbApp.database().collection('cba_submissions').doc(cbaDocId).update({ report: rawCba }); }
  catch (e) { console.log('CBA report persist failed:', e.message); }
}
```
(Place AFTER `rawCba` is assigned and `cbaDocId` is in scope. If `rawCba` has a different local name, use that variable.)

- [ ] **Step 6: Gate the email send** (~line 382). Change:
```js
    let emailResult = 'skipped';
    if (EMAIL_AUTH_CODE) {
```
to:
```js
    // [CHANGE 2026-06-13] 原因：停用管理员邮件通知，改为站内审核台；保留代码可逆 | 影响范围：analyzeCBA 邮件
    const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';
    let emailResult = 'skipped';
    if (EMAIL_ENABLED && EMAIL_AUTH_CODE) {
```

- [ ] **Step 7: Deploy via Monaco console** and save.

- [ ] **Step 8: Verify** — submit a CBA case end-to-end (site flow) or POST a `cba_submit` payload. In CloudBase console confirm the `cba_submissions` doc has `status:'submitted'`, `caseId`, `priority/tags`, and a populated `report` field; `emailResult` is `skipped`.

- [ ] **Step 9: Commit the source mirror**
```bash
git add cloud-functions/analyzeCBA/index.js
git commit -m "feat(analyzeCBA): email flag off + status submitted + caseId + persist report narrative"
```

---

# Phase 7 — Ship & verify

### Task 19: Full gate + deploy

- [ ] **Step 1: Run mandatory gates**
```bash
PYTHONPATH=. python3 preflight_check.py
PYTHONPATH=. python3 tests/run_tests.py
npm test
npm run build
```
Expected: preflight OK, risk tests all PASS, admin unit tests PASS, build clean.

- [ ] **Step 2: Set Vercel env vars** (Project → Settings → Environment Variables): `TCB_ENV_ID`, `TENCENT_SECRET_ID`, `TENCENT_SECRET_KEY`, `ADMIN_DASHBOARD_PASSWORD`, `ADMIN_SESSION_SECRET`. (Cloud functions additionally honor `EMAIL_ENABLED` — leave unset to keep email off.)

- [ ] **Step 3: Deploy to production**
```bash
git push origin main:clinical
```
(Vercel builds the `clinical` branch.)

- [ ] **Step 4: Production smoke test** — visit `https://nanoviga.com/admin` → redirected to login → enter password → review a real pending case end-to-end (start_review assigns/keeps caseId, approve captures doctor fields, mark_delivered, archive; Export PDF). Confirm writes in the CloudBase console.

- [ ] **Step 5: Confirm email is off** — submit a fresh PLA + CBA case from the live site; verify no admin email arrives and both records appear in `/admin` as `submitted` with a `caseId`.

- [ ] **Step 6 (note, not a code change):** This is the final task. No further commits unless smoke tests surface a bug — fix at the relevant task.

---

## Self-Review (completed during planning)

- **Spec coverage:** email-disable (T17/T18) · `/admin` location + auth (T7/T8/T13) · both PLA+CBA (T5/T6/T9) · view full report + contact (T15) · Approve/Reject(=Archive)/Mark Ready(=Mark Delivered)/Export PDF (T15/T16) · status write-back (T10) · 5-state lifecycle (T3) · priority normal/attention/vip (T3/T15) · tags[] (T6/T15) · doctorSummary/Advice/NextStep (T3/T10/T15) · caseId at submission + atomic counter + backfill (T6/T10/T17/T18) · persist CBA narrative (T18). All spec sections map to a task.
- **Placeholder scan:** none — every code step contains full code; verification steps give exact commands + expected output. The one self-import line in Task 6 is explicitly flagged for removal with instructions.
- **Type consistency:** `AdminSubmission`, `ReviewStatus`, `Priority`, `ReviewAction`, `canTransition`, `nextStatus`, `formatCaseId`, `normalize`, `allocateCaseId`, `backfillCaseId`, `listSubmissions`, `getOne`, `updateReview`, `signSession`/`verifySession`/`ADMIN_COOKIE` are defined once and used with matching signatures across tasks. Action names (`start_review`/`approve`/`mark_delivered`/`archive`/`set_priority`/`set_tags`) are identical in types, API, and UI.

---

## Execution Handoff

(See skill prompt — choose subagent-driven or inline execution after the user approves this plan.)
