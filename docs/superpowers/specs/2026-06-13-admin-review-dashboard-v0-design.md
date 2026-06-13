# Admin Review Dashboard — V0 MVP Design Spec

**Date:** 2026-06-13
**Status:** Active scope. Supersedes (for now) the full-scope design
`2026-06-13-admin-review-dashboard-design.md`, which is retained as the future vision.
**Branch/deploy:** `feat/clinical-email-system` → `git push origin main:clinical` (Vercel watches
`clinical`); cloud functions via the legacy Monaco console (runtime CLAUDE.md §8).

---

## 1. Principle

First **50 free cases**, every one **manually reviewed by Dr. Lu**. Goal = **workflow validation**,
not scale. **Minimize engineering complexity.** Delivery happens **outside the system** (WeChat/
manual); the dashboard only tracks state and captures one free-text note.

## 2. Goal flow

```
User submits PLA/CBA  →  appears in admin queue  →  Dr. Lu opens & writes doctorNote  →  Deliver
```

## 3. Lifecycle (3 states only)

```
submitted ──(open the case)──▶ under_review ──(Deliver)──▶ delivered
```

| State | Meaning | Set by |
|---|---|---|
| `submitted` | In queue, not yet opened | cloud function on submit |
| `under_review` | Dr. Lu has opened the case | **auto** on first detail open (same write as caseId backfill) |
| `delivered` | Reviewed; note written; sent manually outside the system | **Deliver** button (writes `doctorNote`) |

- **One explicit admin action: Deliver.** Opening a `submitted` case auto-advances it to
  `under_review` (no separate "Start Review" button — fewer clicks, fewer APIs). Idempotent.
- No backward transitions, no decline/archive in V0. A case that shouldn't proceed is simply left
  un-delivered.

## 4. Data model — 3 new fields, additive

New fields on **both** `report_submissions` (PLA) and `cba_submissions` (CBA):

| Field | Type | Default | Notes |
|---|---|---|---|
| `status` | string | `'submitted'` | enum `submitted`/`under_review`/`delivered`; legacy `pending`→`submitted` on read |
| `caseId` | string | — | **`BAC-YYYY-NNNN`**, allocated **at submission** by the cloud function (atomic `case_counters` transaction). `null` only on SDK-fallback/legacy → admin backfills on detail open |
| `doctorNote` | string | `null` | single free-text field, written at Deliver |

Plus **CBA only**: persist the generated narrative into `report` (today it's only in the email) so
the detail page can display it.

**New collection:** `case_counters` — `{ _id:"<year>", year, seq }`, one shared yearly sequence for
both report types (atomic via `runTransaction`).

**Explicitly NOT in V0** (postponed to the full design): `approved`/`ready_for_delivery`/`archived`/
`declined`, `priority`, `tags[]`, `doctorSummary`/`doctorAdvice`/`doctorNextStep`, PDF export,
`deliveryChannel`, `deliveredAt`, `reviewedAt`, review history, audit log, delivery hooks.

## 5. Normalized read model (API → UI)

```ts
type AdminSubmission = {
  id: string; type: 'pla'|'cba';
  caseId: string | null;
  name: string; assessmentCode: string; l1RefCode?: string | null;
  status: 'submitted'|'under_review'|'delivered';
  submittedAt: string;            // createdAt (PLA) | submittedAt (CBA)
  headlineAge: number;            // bioAge (PLA) | phenoAge (CBA)
  actualAge: number;
  contact: { phone?: string|null; phoneSuffix?: string|null };  // display what exists
  // detail-only:
  report?: string | null;
  dimensionScores?: Record<string, number>;   // PLA
  organAges?: Record<string, number>;          // CBA
  score?: number;                              // PLA
  doctorNote?: string | null;
};
```

## 6. Backend — Next.js API routes + CloudBase Admin SDK

Server-side on Vercel via `@cloudbase/node-sdk` (admin credential). All routes `runtime='nodejs'`.

| Route | Method | Auth | Behavior |
|---|---|---|---|
| `/api/admin/login` | POST | none | password → signed httpOnly cookie · `401` |
| `/api/admin/logout` | POST | cookie | clear cookie |
| `/api/admin/submissions` | GET | cookie | `?type=pla\|cba\|all&status=` → normalized list (lean) |
| `/api/admin/submissions/[type]/[id]` | GET | cookie | full record; **backfill `caseId` if null** and **auto-advance `submitted→under_review`** |
| `/api/admin/submissions/[type]/[id]/deliver` | POST | cookie | body `{doctorNote}`; requires status `under_review`; writes `doctorNote` + `status='delivered'` |

**Env (Vercel):** `TCB_ENV_ID`, `TENCENT_SECRET_ID`, `TENCENT_SECRET_KEY`, `ADMIN_DASHBOARD_PASSWORD`,
`ADMIN_SESSION_SECRET`. **Dep:** `@cloudbase/node-sdk`. Cloud functions honor `EMAIL_ENABLED` (unset =
email off).

## 7. Frontend — 3 pages

- `src/middleware.ts` — gate `/admin/*` + `/api/admin/*` (except login).
- `/admin/login` — password field.
- `/admin` — queue: list of cases (default `status=submitted`; type filter), each row → detail. Shows
  `caseId`, name, type, age, submit time, status.
- `/admin/[type]/[id]` — detail: caseId/name header · contact (phone / CBA suffix) · report body
  (PLA scores+report | CBA organAges+narrative) · `doctorNote` textarea · **Deliver** button.

Mobile-first, `clinical.*` tokens. No protected files touched. Chinese UI; avoid banned words.

## 8. Cloud-function changes (manual Monaco deploy)

- **`generateReport`**: `EMAIL_ENABLED` flag (default off); write `status:'submitted'`; allocate +
  write `caseId` (transaction) on insert.
- **`analyzeCBA`**: same flag + `status:'submitted'` + `caseId`; **persist `report`** narrative
  (capture inserted `_id`, `update({report})` after generation).

## 9. Gates & deploy

`PYTHONPATH=. python3 preflight_check.py` → `tests/run_tests.py` → `npm test` → `npm run build`.
Admin shows existing reports only → no `risk_engine` R2+/R3 output. Ship via `push main:clinical`;
deploy + curl-verify both cloud functions.

## 10. Rollback

- Email: `EMAIL_ENABLED=true` restores notifications (code intact).
- Dashboard: revert the `clinical` deploy; new fields additive/inert.
- caseId: stop allocating/backfilling; existing ids remain; counter doc inert.
- CBA narrative: drop the `update()`; stored values remain valid.
No protected file changed, no field retyped/removed, no existing endpoint contract changed.

## 11. File inventory

**New:** `src/lib/admin/{types,session,cloudbase,cloudbase-sdk.d}.ts` (+ `*.test.ts`),
`src/middleware.ts`, `src/app/api/admin/{login,logout}/route.ts`,
`src/app/api/admin/submissions/route.ts`,
`src/app/api/admin/submissions/[type]/[id]/route.ts`,
`src/app/api/admin/submissions/[type]/[id]/deliver/route.ts`,
`src/app/admin/{AdminUI.tsx, login/page.tsx, page.tsx, [type]/[id]/page.tsx}`,
`package.json` (+`@cloudbase/node-sdk`, `tsx`, `test` script).
**Edited:** `cloud-functions/generateReport/index.js`, `cloud-functions/analyzeCBA/index.js`.
**Untouched protected:** `scoring.ts`, `AssessmentContext.tsx`, `tailwind.config.ts`, protected
`globals.css` rules.
