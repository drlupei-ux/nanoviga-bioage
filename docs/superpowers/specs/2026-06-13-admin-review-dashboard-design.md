# Admin Review Dashboard — Design Spec

**Date:** 2026-06-13
**Branch (target):** `feat/clinical-email-system` → ships to production via `git push origin main:clinical`
**Status:** Approved design, ready for implementation planning

---

## 1. Summary

Replace admin **email notifications** with a gated, in-app **Admin Review Dashboard**.

Both cloud functions (`generateReport` for PLA, `analyzeCBA` for CBA) already persist each
submission to CloudBase with `status: 'pending'`, then send a notification email to the admin
mailbox. This project:

1. **Disables** the email send (reversibly, behind a flag — code stays).
2. Adds an **`/admin`** area inside the existing Next.js app that reads those same DB records.
3. Lets the admin **review each report**, view full content + contact info, set **priority**,
   and move it through a **status lifecycle**, writing every decision back to the DB.
4. Persists the **full CBA narrative** into the DB (today it only exists in the email body) so the
   dashboard can display the complete CBA report.

**Guiding constraint (project CLAUDE.md):** stability > correctness > features. Minimal,
backward-compatible, reversible changes. Protected files untouched. Test gates enforced.

---

## 2. Goals / Non-Goals

### Goals
- Stop sending notification emails (reversible).
- Single dashboard reviewing **both** PLA (`report_submissions`) and CBA (`cba_submissions`).
- View full report + user contact info per submission.
- Approve / Reject / Mark Ready / Export PDF actions.
- Priority tagging (`normal` / `high` / `vip`).
- Doctor Note captured at approval, stored for future delivery.
- Persist full CBA narrative into the DB.
- Status written back to the DB on every transition.

### Non-Goals (YAGNI — explicitly out of scope)
- Actual **delivery** to the user (email/WeChat/PDF send on approval). Only the `delivered` state
  and reserved fields are designed; no send is implemented.
- Multi-admin accounts, roles, or permissions (single shared password).
- Full audit trail / decision history (only the latest decision is stored).
- Server-side PDF rendering (we use browser print-to-PDF).
- Capturing new contact fields (WeChat/email) at submission time — display only what exists today.

---

## 3. Status Lifecycle

```
pending ──Approve──▶ approved ──Mark Ready──▶ ready_for_delivery ──(future hook)──▶ delivered
   │
   └──Reject──▶ rejected
```

| State | Meaning | Set by | Allowed from |
|---|---|---|---|
| `pending` | Submitted, awaiting review | cloud function on submit | — (initial) |
| `approved` | Clinical content signed off | **Approve** button | `pending` |
| `ready_for_delivery` | Finalized, queued to send | **Mark Ready** button | `approved` |
| `delivered` | Sent to user | future delivery hook | `ready_for_delivery` |
| `rejected` | Declined | **Reject** button | `pending` |

**Rules**
- Reject is only allowed from `pending` (per final decision).
- Each forward/terminal transition writes review metadata (§5).
- Server-side transition guard: any request whose `from` state doesn't match the table above is
  rejected with `409 Conflict` (prevents stale-tab double-submits).

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
| `status` | string | `'pending'` | cloud fn + admin | now 5-state (§3) |
| `priority` | string | `'normal'` | admin (editable) | enum: `normal` `high` `vip` |
| `reviewedAt` | ISO string | `null` | admin | set on every status transition |
| `reviewedBy` | string | `null` | admin | admin label (from session) |
| `reviewNote` | string | `null` | admin | optional; used for reject reason or general note |
| `doctorNote` | string | `null` | admin | **captured at Approve**; stored for future delivery |
| `deliveredAt` | ISO string | `null` | future hook | reserved |
| `deliveryChannel` | string | `null` | future hook | reserved (`email`/`wechat`/`pdf`) |
| `report` (CBA) | string | — | `analyzeCBA` | **new for CBA**: full narrative persisted (§7.2) |

**Backward compatibility:** all new fields are additive and optional. Existing documents lacking
them are treated as: `priority='normal'`, notes `null`. No migration required; the API normalizes
missing fields on read.

### 4.3 Normalized read model (API → UI)

The API maps both collections into one shape so the dashboard is collection-agnostic:

```ts
type AdminSubmission = {
  id: string;                 // CloudBase _id
  type: 'pla' | 'cba';
  name: string;
  assessmentCode: string;
  l1RefCode?: string | null;  // CBA only
  status: 'pending'|'approved'|'ready_for_delivery'|'delivered'|'rejected';
  priority: 'normal'|'high'|'vip';
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
  doctorNote?: string | null;
};
```

---

## 5. Backend — Next.js API routes + CloudBase Admin SDK

All admin DB access runs **server-side on Vercel** via `@cloudbase/node-sdk` initialized with a
Tencent CAM credential. Client never sees credentials.

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
`src/lib/admin/cloudbase.ts` — lazy singleton:
```ts
tcb.init({ env: TCB_ENV_ID, secretId: TENCENT_SECRET_ID, secretKey: TENCENT_SECRET_KEY })
```
Exposes `db()` and typed `listPending`, `getOne`, `updateReview` helpers. All routes use
`runtime = 'nodejs'` (SDK needs Node, not Edge).

### 5.4 Routes

| Route | Method | Auth | Behavior |
|---|---|---|---|
| `/api/admin/login` | POST | none | Compare body password to `ADMIN_DASHBOARD_PASSWORD`; on match set signed httpOnly cookie, return `{ok:true}`; else `401`. |
| `/api/admin/logout` | POST | cookie | Clear cookie. |
| `/api/admin/submissions` | GET | cookie | Query `?type=pla\|cba\|all&status=&priority=`. Returns normalized list (no `report`/biomarkers payload — list is lean). Default sort: priority (vip→high→normal) then `submittedAt` desc. |
| `/api/admin/submissions/[type]/[id]` | GET | cookie | Full normalized `AdminSubmission` incl. report + detail fields. |
| `/api/admin/submissions/[type]/[id]/review` | POST | cookie | Body `{action, fromStatus, priority?, reviewNote?, doctorNote?}`. Validates transition (§3), writes status + metadata, returns updated record. |

`action` ∈ `approve` | `mark_ready` | `reject` | `set_priority`.
- `approve`: requires `doctorNote` (per requirement #5) — captured here; `pending→approved`.
- `mark_ready`: `approved→ready_for_delivery`.
- `reject`: optional `reviewNote` (reason); `pending→rejected`.
- `set_priority`: updates `priority` only, no status change (allowed in any non-terminal state).

### 5.5 Errors
- `401` unauthenticated, `409` invalid transition / `fromStatus` mismatch, `404` not found,
  `400` missing required field (e.g. approve without doctorNote), `500` SDK/db error (logged).

---

## 6. Frontend — `/admin`

Mobile-first, uses existing `clinical.*` tokens, `.clinical-card`, `cn()`. No new design system.
**No protected files touched.** Tone follows product rules (clinical, Chinese UI; avoid the banned
words "AI/model/algorithm/generated").

### 6.1 Auth gate — `src/middleware.ts` (new)
Matches `/admin/:path*` and `/api/admin/:path*` (except `/api/admin/login`). Verifies the signed
cookie; unauthenticated browser nav → redirect to `/admin/login`; unauthenticated API → `401`.

### 6.2 `/admin/login`
Single password field → POST `/api/admin/login` → on success `router.push('/admin')`.

### 6.3 `/admin` (list)
- Filter chips: type (全部/PLA/CBA), status, priority.
- Table/cards: 客户 · 编号 · 类型 · 优先级徽章 · 年龄(headline/actual) · 提交时间 · 状态徽章.
- Priority badge color-coded (vip/high/normal). Status badge color-coded per state.
- Row/card click → detail. Default view = `status=pending`, sorted vip→high→normal then newest.

### 6.4 `/admin/[type]/[id]` (detail)
Sections:
1. **Header** — name, code, type, status badge, priority selector (writes via `set_priority`).
2. **Contact panel (requirement #4)** — shows available contact info:
   - PLA: phone (full). CBA: phone suffix (last 4) + `l1RefCode`.
   - WeChat / email rows render "未提供" since not captured at submission today (honest display;
     no fabricated data). Panel is structured so future captured fields slot in.
3. **Report body** —
   - PLA: rendered `report` text + `dimensionScores` (5D mapping for display) + score.
   - CBA: persisted narrative `report` + PhenoAge + `organAges` (5D) + key `biomarkers`.
4. **Review history** — current `status`, `reviewedBy/At`, `reviewNote`, `doctorNote` (read-back).
5. **Actions (contextual per §3)** —
   - `pending`: **Approve** (opens doctorNote-required modal) · **Reject** (optional reason) · Export PDF
   - `approved`: **Mark Ready for Delivery** · Export PDF
   - `ready_for_delivery` / `delivered` / `rejected`: read-only badge · Export PDF
   - Every action posts `fromStatus` for the server-side guard; UI refetches on success.

### 6.5 Export PDF
- A print stylesheet (`@media print`) hides nav/actions, shows a clean clinical report layout.
- **Export PDF** button calls `window.print()`; admin chooses "Save as PDF". No new deps.

---

## 7. Cloud-function changes (manual Monaco-console deploy)

Two functions edited; each redeployed once via the legacy Tencent console (per runtime CLAUDE.md §8
`applyEdits` procedure). Both changes are minimal and reversible.

### 7.1 `generateReport/index.js`
- Wrap the SMTP send in an explicit flag:
  `const EMAIL_ENABLED = process.env.EMAIL_ENABLED === 'true';` — default **off**.
  Email block runs only if `EMAIL_ENABLED && EMAIL_AUTH_CODE`. Code retained (reversible).
- DB save already stores the full `report`. **No other change.**
- New doc fields default via the admin layer; cloud fn keeps writing `status:'pending'`.
  (Optional, low-risk: also write `priority:'normal'` on insert for consistency.)

### 7.2 `analyzeCBA/index.js`
- Same `EMAIL_ENABLED` gate on the email send.
- **Persist the narrative (requirement #2):** capture the inserted doc id from `.add()` and, after
  report generation, `collection('cba_submissions').doc(id).update({ report: rawCba })`. Mirror the
  HTTP fallback path. This makes the full CBA report available to the dashboard.
  - Edge case: if generation fails, the doc still exists with `report` absent; dashboard shows
    "报告生成中/缺失" gracefully.

---

## 8. Security

- Admin password compared server-side; never shipped to client.
- Session cookie: httpOnly, `Secure`, `SameSite=Lax`, HMAC-signed with `ADMIN_SESSION_SECRET`,
  reasonable expiry (e.g. 12h).
- Middleware blocks all `/admin/*` + `/api/admin/*` before any data access.
- CAM credential scoped (ideally) to CloudBase DB access on the one env.
- No PII beyond what users submitted; CBA already stores only phone **suffix**.

---

## 9. Test & Deploy Gates (runtime CLAUDE.md)

1. `PYTHONPATH=. python3 preflight_check.py` — structure check passes.
2. `PYTHONPATH=. python3 tests/run_tests.py` — all PASS.
3. `npm run build` — no TS errors.
4. `risk_engine`: admin pages display **existing** reports only (no new medical generation), so no
   R2+/R3 output is introduced. Note this explicitly in the PR.
5. Ship admin/Next.js code: `git push origin main:clinical` (Vercel watches `clinical`).
6. Cloud functions: manual Monaco-console deploy (§7), then `curl`-verify both endpoints.

**Pre-deploy checklist**
- [ ] Vercel env vars set (§5.2).
- [ ] `npm run build` green.
- [ ] `/api/admin/*` smoke-tested with valid + invalid cookie.
- [ ] Both cloud functions redeployed with `EMAIL_ENABLED` unset (email off) and CBA narrative
      persistence confirmed via a test submission.

---

## 10. Rollback

- Email: set `EMAIL_ENABLED=true` to restore notifications (code intact).
- Dashboard: revert the `clinical` deploy; new collections fields are additive and inert if unused.
- CBA narrative persistence: removing the `update()` call reverts cleanly; existing docs keep their
  stored `report`.

---

## 11. File-level change inventory

**New (Next.js, shipped via Vercel):**
- `src/middleware.ts` — auth gate
- `src/lib/admin/cloudbase.ts` — admin SDK client + db helpers
- `src/lib/admin/session.ts` — cookie sign/verify
- `src/lib/admin/types.ts` — `AdminSubmission`, status/priority enums, transition map
- `src/app/admin/login/page.tsx`
- `src/app/admin/page.tsx` — list
- `src/app/admin/[type]/[id]/page.tsx` — detail
- `src/app/admin/admin.css` or print styles (or `@media print` in globals — **without** touching
  protected `.clinical-*`/`.pb-safe*` rules)
- `src/app/api/admin/login/route.ts`
- `src/app/api/admin/logout/route.ts`
- `src/app/api/admin/submissions/route.ts`
- `src/app/api/admin/submissions/[type]/[id]/route.ts`
- `src/app/api/admin/submissions/[type]/[id]/review/route.ts`
- `package.json` — add `@cloudbase/node-sdk`

**Edited (cloud functions, manual deploy):**
- `cloud-functions/generateReport/index.js` — `EMAIL_ENABLED` gate
- `cloud-functions/analyzeCBA/index.js` — `EMAIL_ENABLED` gate + persist `report` narrative

**Untouched protected files:** `src/lib/scoring.ts`, `src/context/AssessmentContext.tsx`,
`tailwind.config.ts`, protected `globals.css` rules.

---

## 12. Open follow-ups (future, not this spec)
- Delivery hook: `ready_for_delivery → delivered` via WeChat/email/PDF send.
- Capture WeChat/email at submission to populate the contact panel.
- Decision history / audit log if multi-admin is introduced.
