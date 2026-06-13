# Admin Review Dashboard — Design Spec

**Date:** 2026-06-13
**Branch (target):** `feat/clinical-email-system` → ships to production via `git push origin main:clinical`
**Status:** SUPERSEDED for now by the V0 MVP — see
`2026-06-13-admin-review-dashboard-v0-design.md`. This document is retained as the **full-scope
future vision**; V0 ships first and deliberately omits most of it.

### Revision history
- **r1** — initial design: 5-state lifecycle (`pending`→`approved`→`ready_for_delivery`→`delivered` / `rejected`), priority `normal/high/vip`, single `doctorNote`.
- **r2** — lifecycle `submitted`→`under_review`→`approved`→`delivered`→`archived`; priority `normal/attention/vip`; added `tags[]`; split `doctorNote` → `doctorSummary`/`doctorAdvice`/`doctorNextStep`; added human-readable `caseId` `BAC-YYYY-NNNN`.
- **r3** (this doc) — `caseId` is now allocated **at submission time inside the cloud functions** (not at Start Review), so it is the permanent user-facing identifier from day one. Atomic yearly counter allocation moves into the cloud-function runtime via a CloudBase **transaction**; the admin layer keeps a lazy **backfill** for legacy/fallback records that lack a `caseId`.

---

## 1. Summary

Replace admin **email notifications** with a gated, in-app **Admin Review Dashboard**.

Both cloud functions (`generateReport` for PLA, `analyzeCBA` for CBA) already persist each
submission to CloudBase, then send a notification email to the admin mailbox. This project:

1. **Disables** the email send (reversibly, behind a flag — code stays).
2. Adds an **`/admin`** area inside the existing Next.js app that reads those same DB records.
3. Lets the admin **review each case**, view full content + contact info, set **priority** and
   **tags**, capture a structured **doctor sign-off**, and move it through a **status lifecycle**,
   writing every decision back to the DB.
4. Persists the **full CBA narrative** into the DB (today it only exists in the email body).
5. Assigns every submission a permanent **human-readable `caseId`** (`BAC-YYYY-NNNN`) **at submission
   time**, so it is the single user-facing identifier across review, delivery, CRM, and support.

**Guiding constraint (project CLAUDE.md):** stability > correctness > features. Minimal,
backward-compatible, reversible changes. Protected files untouched. Test gates enforced.

---

## 2. Goals / Non-Goals

### Goals
- Stop sending notification emails (reversible).
- Single dashboard reviewing **both** PLA (`report_submissions`) and CBA (`cba_submissions`).
- View full report + user contact info per case.
- Lifecycle actions: Start Review / Approve / Mark Delivered / Archive / set priority / set tags.
- Priority tagging (`normal` / `attention` / `vip`) and free `tags[]` for future case-library indexing.
- Structured doctor sign-off (`doctorSummary` / `doctorAdvice` / `doctorNextStep`) stored for the
  future delivery workflow.
- Human-readable `caseId` per case, **stable from submission onward** (single identifier; no dual id during `submitted`).
- Persist full CBA narrative into the DB.
- Export PDF of a case (browser print).

### Non-Goals (YAGNI — explicitly out of scope)
- Actual **delivery** to the user (auto email/WeChat/PDF send). Only the `delivered` state +
  reserved fields are designed; "Mark Delivered" is a manual status move for now.
- Multi-admin accounts, roles, or permissions (single shared password).
- A full audit trail / decision history (only the latest decision is stored).
- Server-side PDF rendering (browser print-to-PDF).
- The case-library **search/index UI** that `tags[]` enables (field is stored & editable now;
  indexing is future).
- Capturing new contact fields (WeChat/email) at submission — display only what exists today.

---

## 3. Status Lifecycle

```
submitted ──Start Review──▶ under_review ──Approve──▶ approved ──Mark Delivered──▶ delivered ──Archive──▶ archived
   │                            │                        │                            │
   └────────────────────────────┴────────────Archive─────┴────────────────────────────┘
                         (Archive = terminal disposition, incl. declining a case)
```

| State | Meaning | Set by | Allowed from |
|---|---|---|---|
| `submitted` | Submitted, not yet picked up; **`caseId` already assigned** | cloud function on submit | — (initial) |
| `under_review` | Admin is reviewing | **Start Review** | `submitted` |
| `approved` | Clinical sign-off captured (doctor fields) | **Approve** | `under_review` |
| `delivered` | Marked sent to user (manual now; auto later) | **Mark Delivered** | `approved` |
| `archived` | Terminal — completed **or declined** | **Archive** | any non-`archived` state |

**Rules**
- The happy path is strictly linear; you cannot skip forward (e.g. `submitted`→`approved` is `409`).
- **Decline = Archive.** There is no dedicated `rejected` state in r2; a case that should not proceed
  is archived from wherever it is. *(Decision — flagged for override: if a distinct `rejected` state
  is wanted, add it as a sixth value reachable from `under_review`.)*
- **Legacy compatibility:** existing documents with `status:'pending'` are normalized to `submitted`
  on read (and the cloud functions are updated to write `submitted` going forward).
- Server-side transition guard: any request whose `fromStatus` doesn't match the table → `409`.

---

## 4. Data Model

### 4.1 Existing fields (unchanged)

`report_submissions` (PLA):
`name, age, gender, bioAge, score, dimensionScores{}, contact, assessmentCode, report, createdAt, status`

`cba_submissions` (CBA):
`assessmentCode, l1RefCode, name, phoneSuffix, actualAge, gender, phenoAge, organAges{}, biomarkers{}, submittedAt, status`

### 4.2 New / changed fields (both collections)

| Field | Type | Default | Written by | Notes |
|---|---|---|---|---|
| `status` | string | `'submitted'` | cloud fn + admin | 5-value enum (§3); legacy `pending`→`submitted` on read |
| `caseId` | string | — | **cloud fn at submit** | **`BAC-YYYY-NNNN`**; allocated at submission (§4.4). `null` only for legacy/fallback docs → admin backfills |
| `priority` | string | `'normal'` | admin | enum `normal` `attention` `vip` |
| `tags` | string[] | `[]` | admin | free labels for future case-library indexing |
| `reviewedAt` | ISO string | `null` | admin | updated on every status transition |
| `reviewedBy` | string | `null` | admin | admin label from session |
| `reviewNote` | string | `null` | admin | optional; general/archive note |
| `doctorSummary` | string | `null` | admin | **captured at Approve (required)** — case summary |
| `doctorAdvice` | string | `null` | admin | captured at Approve (optional) — clinical advice |
| `doctorNextStep` | string | `null` | admin | captured at Approve (optional) — recommended next step |
| `deliveredAt` | ISO string | `null` | Mark Delivered | set when moved to `delivered` |
| `deliveryChannel` | string | `null` | Mark Delivered / future | `manual` now; `email`/`wechat`/`pdf` later |
| `report` (CBA) | string | absent | `analyzeCBA` | **new for CBA**: full narrative persisted (§7.2) |

**Backward compatibility:** all new fields additive/optional. Legacy docs coerce on read to
`status` normalized, `priority='normal'`, `tags=[]`, `caseId=null`, notes `null`. No migration.

### 4.3 New collection — `case_counters`

Supports atomic, per-year sequential numbering for `caseId`. **One global yearly sequence shared by
both PLA and CBA**, so `BAC` ids are unique across report types.

```
{ _id: <"2026">, year: 2026, seq: <int> }   // one doc per year
```

Written by **both cloud functions** (primary, at submission) and by the **admin backfill** path.

### 4.4 `caseId` assignment (at submission)

- Format: **`BAC-YYYY-NNNN`** — `YYYY` = current year, `NNNN` = zero-padded 4-digit sequence
  (e.g. `BAC-2026-0001`). Distinct from the random `assessmentCode` (`BCA-XXXX`), which is unchanged.
- **Allocated at submission**, inside each cloud function, **before** the document is inserted, so the
  stored record carries `caseId` from the `submitted` state onward — the permanent, user-facing id.
- **Atomic allocation = a CloudBase transaction** (`db.runTransaction`). A bare `command.inc` updates
  atomically but does not return the new value; the transaction reads `case_counters/{year}`, creates
  it with `seq:1` if absent, increments `seq`, and returns the new value to format the id. CloudBase
  retries the transaction on write-conflict, guaranteeing uniqueness under concurrent submissions.
- **Allocation order in the cloud function:** (1) `runTransaction` → `caseId`; (2) insert the
  submission doc with `caseId` included. In `analyzeCBA` this happens before report generation
  (matching the existing early-save ordering); the later `report` update is unaffected.
- **Failure / fallback handling:**
  - If transaction allocation fails, or the function falls back to the HTTP `saveAssessment` path
    (SDK unavailable), the doc is inserted with `caseId: null` rather than blocking submission.
  - The **admin layer backfills** any `caseId: null` record (legacy `pending` docs included) on first
    read, using the same transactional allocator (§5.3). Backfill is idempotent: a record that
    already has a `caseId` is never re-allocated.
- **At-least-once note:** cloud functions are effectively single-invocation per submission; a rare
  retry could consume an extra sequence number (gap), which is acceptable — ids stay unique and
  monotonic, only non-contiguous. No double-id for one record (caseId written once on insert).
- Year rollover: a new year lazily creates a new counter doc starting at `0001`; the year is embedded
  in the id, so ids stay unique across years.

### 4.5 Normalized read model (API → UI)

```ts
type AdminSubmission = {
  id: string;                 // CloudBase _id
  type: 'pla' | 'cba';
  caseId: string | null;      // BAC-YYYY-NNNN, assigned at submission; null only for legacy/fallback (backfilled on read)
  name: string;
  assessmentCode: string;
  l1RefCode?: string | null;  // CBA only
  status: 'submitted'|'under_review'|'approved'|'delivered'|'archived';
  priority: 'normal'|'attention'|'vip';
  tags: string[];
  submittedAt: string;        // createdAt (PLA) | submittedAt (CBA), ISO
  headlineAge: number;        // bioAge (PLA) | phenoAge (CBA)
  actualAge: number;          // age (PLA) | actualAge (CBA)
  contact: {                  // §6.4 — display what exists, null otherwise
    phone?: string | null;        // PLA full phone
    phoneSuffix?: string | null;  // CBA last-4
    wechat?: string | null;       // not captured today → null
    email?: string | null;        // not captured today → null
  };
  // detail-only:
  report?: string | null;     // PLA report | CBA narrative
  dimensionScores?: Record<string, number>;  // PLA
  organAges?: Record<string, number>;        // CBA (5D)
  biomarkers?: Record<string, unknown>;       // CBA
  score?: number;             // PLA
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  reviewNote?: string | null;
  doctorSummary?: string | null;
  doctorAdvice?: string | null;
  doctorNextStep?: string | null;
  deliveredAt?: string | null;
  deliveryChannel?: string | null;
};
```

---

## 5. Backend — Next.js API routes + CloudBase Admin SDK

All admin DB access runs **server-side on Vercel** via `@cloudbase/node-sdk` with a Tencent CAM
credential. Client never sees credentials. All routes `runtime = 'nodejs'`.

### 5.1 New dependency
- `@cloudbase/node-sdk` added to `package.json` dependencies.

### 5.2 New env vars (Vercel)

| Var | Purpose |
|---|---|
| `TCB_ENV_ID` | `bioage-compass-prod-9chaf35e573d` |
| `TENCENT_SECRET_ID` | CAM credential for admin SDK |
| `TENCENT_SECRET_KEY` | CAM credential for admin SDK |
| `ADMIN_DASHBOARD_PASSWORD` | shared admin login password |
| `ADMIN_SESSION_SECRET` | HMAC secret to sign the session cookie |

### 5.3 CloudBase client helper
`src/lib/admin/cloudbase.ts` — lazy singleton `tcb.init({ env, secretId, secretKey })`. Exposes
`db()` plus typed helpers: `listSubmissions`, `getOne`, `updateReview`, and `backfillCaseId`.

`backfillCaseId(type, id)` — used **only to heal** records read with `caseId: null` (legacy `pending`
docs and HTTP-fallback inserts). Same transactional allocator as the cloud functions (`runTransaction`
on `case_counters/{year}`), idempotent (no-op if a `caseId` already exists). Primary allocation lives
in the cloud functions (§7); the admin no longer allocates on Start Review.

### 5.4 Routes

| Route | Method | Auth | Behavior |
|---|---|---|---|
| `/api/admin/login` | POST | none | Compare body password to `ADMIN_DASHBOARD_PASSWORD`; on match set signed httpOnly cookie; else `401`. |
| `/api/admin/logout` | POST | cookie | Clear cookie. |
| `/api/admin/submissions` | GET | cookie | Query `?type=pla\|cba\|all&status=&priority=&tag=`. Lean normalized list (no report/biomarkers). Default sort: priority (vip→attention→normal) then `submittedAt` desc. |
| `/api/admin/submissions/[type]/[id]` | GET | cookie | Full normalized `AdminSubmission`. If `caseId` is null (legacy/fallback), **backfill it** (§5.3) before returning, so opening a case guarantees a permanent id. |
| `/api/admin/submissions/[type]/[id]/review` | POST | cookie | Body `{action, fromStatus, ...}`. Validates transition (§3), writes fields, returns updated record. |

**`action` values & payloads:**

| action | from → to | required / fields written |
|---|---|---|
| `start_review` | `submitted → under_review` | `reviewedBy/At` (caseId already present from submission) |
| `approve` | `under_review → approved` | **`doctorSummary` required**; `doctorAdvice?`, `doctorNextStep?`; `reviewedBy/At` |
| `mark_delivered` | `approved → delivered` | `deliveredAt`, `deliveryChannel='manual'`; `reviewedBy/At` |
| `archive` | any non-`archived` → `archived` | optional `reviewNote` (e.g. decline reason); `reviewedBy/At` |
| `set_priority` | no status change | `priority` ∈ enum; allowed when not `archived` |
| `set_tags` | no status change | `tags: string[]`; allowed when not `archived` |

### 5.5 Errors
`401` unauth · `409` invalid/stale transition (`fromStatus` mismatch) · `404` not found ·
`400` missing required field (e.g. approve without `doctorSummary`) · `500` db/SDK error (logged).

---

## 6. Frontend — `/admin`

Mobile-first; reuses `clinical.*` tokens, `.clinical-card`, `cn()`. **No protected file touched.**
Chinese UI; avoid banned words ("AI/model/algorithm/generated").

### 6.1 Auth gate — `src/middleware.ts` (new)
Matches `/admin/:path*` and `/api/admin/:path*` (except `/api/admin/login`). Verifies signed cookie;
unauthenticated browser nav → redirect to `/admin/login`; unauthenticated API → `401`.

### 6.2 `/admin/login`
Single password field → POST `/api/admin/login` → success → `router.push('/admin')`.

### 6.3 `/admin` (list)
- Filter chips: type (全部/PLA/CBA), status, priority, tag.
- Rows/cards: 案例号(`caseId`; "未分配" only for un-opened legacy/fallback) · 客户 · 编号 · 类型 · 优先级徽章 · 标签 · 年龄 · 提交时间 · 状态徽章.
- Priority + status badges color-coded. Default view `status=submitted`, sorted vip→attention→normal then newest.
- Row click → detail.

### 6.4 `/admin/[type]/[id]` (detail)
1. **Header** — `caseId`, name, assessmentCode, type, status badge, **priority selector**
   (`set_priority`), **tags editor** (chip add/remove → `set_tags`).
2. **Contact panel (req #4 prior)** — PLA: phone (full); CBA: phone suffix + `l1RefCode`.
   WeChat / email rows show "未提供" (not captured today). Structured so future fields slot in.
3. **Report body** — PLA: `report` text + 5D `dimensionScores` + score. CBA: persisted narrative
   `report` + PhenoAge + `organAges` (5D) + key `biomarkers`.
4. **Doctor sign-off** — read-back of `doctorSummary` / `doctorAdvice` / `doctorNextStep` once
   approved; review history (`status`, `reviewedBy/At`, `reviewNote`, `deliveredAt/Channel`).
5. **Contextual actions (per §3)** + Export PDF:
   - `submitted` → **Start Review** · Archive · Export PDF
   - `under_review` → **Approve** (modal: doctorSummary [required] / doctorAdvice / doctorNextStep) · Archive · Export PDF
   - `approved` → **Mark Delivered** · Archive · Export PDF
   - `delivered` → **Archive** · Export PDF
   - `archived` → read-only badge · Export PDF
   - Every action posts `fromStatus`; UI refetches on success.

### 6.5 Export PDF
`@media print` stylesheet (hides nav/actions, clean clinical layout) + **Export PDF** button →
`window.print()` → "Save as PDF". No new dep; no protected CSS touched.

---

## 7. Cloud-function changes (manual Monaco-console deploy)

Two functions edited in-place, each redeployed once via the legacy console (`applyEdits`,
runtime CLAUDE.md §8). Minimal, reversible.

**Shared addition (both functions):** a `allocateCaseId(db)` helper that runs the `case_counters`
**transaction** (§4.4) and returns `BAC-YYYY-NNNN`. Implemented inline in each function (the two
runtimes don't share modules; keep the logic identical). Called on the SDK path **before** insert;
on the HTTP-fallback path, insert with `caseId: null` (admin backfills later). Wrap allocation in
try/catch so a counter failure never blocks the submission.

### 7.1 `generateReport/index.js`
- **caseId:** allocate via the transaction helper, then include `caseId` in the inserted
  `report_submissions` doc.
- **Email gate:** `EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true'` (default **off**); email
  block runs only when `EMAIL_ENABLED && EMAIL_AUTH_CODE`. Code retained below the guard.
- **Status literal:** write `status: 'submitted'` on insert (was `'pending'`).
- **Defaults:** also write `priority:'normal'`, `tags:[]` on insert for field consistency.

### 7.2 `analyzeCBA/index.js`
- **caseId:** allocate via the transaction helper **before** the early DB save; include `caseId` in
  the inserted `cba_submissions` doc. (Allocation precedes report generation, matching the existing
  save-then-generate ordering.)
- **Email gate:** same `EMAIL_ENABLED` guard.
- **Status literal:** write `status: 'submitted'` on insert; also `priority:'normal'`, `tags:[]`.
- **Persist narrative:** capture the inserted doc `_id` from `.add()`; after report generation,
  `db.collection('cba_submissions').doc(id).update({ report: rawCba })`. Mirror in the HTTP-fallback
  path. If generation fails the doc exists without `report`; dashboard shows "报告缺失".

**No HTTP contract change**; callers (`/api/generate-report`, `/api/cba/submit`) unaffected. The
`caseId` is allocated server-side and is **not** required in the request payload.

---

## 8. Security
- Password compared server-side; never shipped to client.
- Session cookie: httpOnly, `Secure`, `SameSite=Lax`, HMAC-signed (`ADMIN_SESSION_SECRET`), ~12h expiry.
- Middleware blocks `/admin/*` + `/api/admin/*` before any data access.
- CAM credential scoped to CloudBase DB on the one env.
- CBA stores only phone **suffix**; no new PII introduced.

---

## 9. Test & Deploy Gates (runtime CLAUDE.md)
1. `PYTHONPATH=. python3 preflight_check.py` — passes.
2. `PYTHONPATH=. python3 tests/run_tests.py` — all PASS.
3. `npm run build` — no TS errors.
4. `risk_engine`: admin pages display **existing** reports only (no new medical generation) — no
   R2+/R3 output introduced; note in PR.
5. Ship admin/Next.js code: `git push origin main:clinical` (Vercel watches `clinical`).
6. Cloud functions: manual Monaco deploy (§7), then `curl`-verify both endpoints.

**Pre-deploy checklist**
- [ ] Vercel env vars set (§5.2).
- [ ] `npm run build` green.
- [ ] `/api/admin/*` smoke-tested with valid + invalid cookie.
- [ ] Transition guard verified (a skip-forward attempt → `409`).
- [ ] `caseId` allocation verified at submission (two test submissions across PLA+CBA → sequential
      `BAC-YYYY-NNNN`, shared counter, no dup; concurrent submissions stay unique).
- [ ] Admin backfill verified (a legacy `caseId:null` doc gets a permanent id on detail open).
- [ ] Both cloud functions redeployed: email off (`EMAIL_ENABLED` unset), inserts write
      `caseId` + `status:'submitted'` + `priority/tags`, CBA `report` persisted (test submission).

---

## 10. Rollback

| Change | Rollback |
|---|---|
| Email disabled | Set `EMAIL_ENABLED=true` — code intact, notifications resume |
| Dashboard / API / pages | Revert the `clinical` deploy; new DB fields additive & inert when unused |
| `middleware.ts` | Removing it un-gates only `/admin/*`; rest of site unaffected |
| CBA narrative persist | Remove the `update()` call; stored `report` values remain valid |
| `status:'submitted'` literal | Read-normalization handles both `submitted` and legacy `pending`, so either literal is safe |
| `case_counters` / `caseId` | Remove the cloud-fn allocation block (revert to no `caseId` on insert) and stop calling `backfillCaseId`; existing ids remain valid; counter doc is inert. Records simply carry `caseId:null` again. |
| New DB fields / `@cloudbase/node-sdk` | Additive/server-only; removal affects only `/api/admin/*` |

**Safety properties:** no protected file modified, no existing field retyped/removed, no existing
endpoint contract changed — a full revert returns the system to today's behavior with no data cleanup.

---

## 11. File-level change inventory

**New (Next.js, shipped via Vercel):**
- `src/middleware.ts` — auth gate
- `src/lib/admin/cloudbase.ts` — admin SDK client + db helpers (incl. `backfillCaseId` transaction)
- `src/lib/admin/session.ts` — cookie sign/verify
- `src/lib/admin/types.ts` — `AdminSubmission`, status/priority enums, transition map, caseId format
- `src/app/admin/login/page.tsx`
- `src/app/admin/page.tsx` — list
- `src/app/admin/[type]/[id]/page.tsx` — detail
- print styles via `@media print` (without touching protected `.clinical-*`/`.pb-safe*` rules)
- `src/app/api/admin/login/route.ts`
- `src/app/api/admin/logout/route.ts`
- `src/app/api/admin/submissions/route.ts`
- `src/app/api/admin/submissions/[type]/[id]/route.ts`
- `src/app/api/admin/submissions/[type]/[id]/review/route.ts`
- `package.json` — add `@cloudbase/node-sdk`

**New collection:** `case_counters` (created lazily on first `caseId` allocation by the cloud functions).

**Edited (cloud functions, manual deploy):**
- `cloud-functions/generateReport/index.js` — `EMAIL_ENABLED` gate + `status:'submitted'` + `caseId` allocation (transaction) + `priority/tags` defaults
- `cloud-functions/analyzeCBA/index.js` — `EMAIL_ENABLED` gate + `status:'submitted'` + `caseId` allocation + `priority/tags` defaults + persist `report`

**Untouched protected files:** `src/lib/scoring.ts`, `src/context/AssessmentContext.tsx`,
`tailwind.config.ts`, protected `globals.css` rules.

---

## 12. Open follow-ups (future, not this spec)
- Delivery hook: auto-send on/after `approved` (WeChat/email/PDF), populating `deliveryChannel`.
- Capture WeChat/email at submission to populate the contact panel.
- Case-library search/index UI built on `tags[]`.
- Dedicated `rejected` state if decline-vs-archive should be distinguished.
- Decision history / audit log if multi-admin is introduced.
