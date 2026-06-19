# PROJECT STATUS — BioAge Compass

> **Single source of truth.** Start here. Update on every release.
> History lives in [`CHANGELOG.md`](./CHANGELOG.md). Release detail: [`docs/releases/MVP-v0.9-beta.md`](./docs/releases/MVP-v0.9-beta.md). Architecture: [`docs/architecture/current-system.md`](./docs/architecture/current-system.md).

**Last updated:** 2026-06-19 · **Status:** 🧊 **Product Freeze** (MVP v0.9 Beta) — entering first user testing.

---

## Current version
| Field | Value |
|---|---|
| Version | **MVP v0.9-beta** |
| Git tag | `MVP-v0.9-beta` |
| Production commit | `6b6a977` |
| Working branch | `feat/clinical-email-system` (deployed → `clinical`; **`main` is stale at the 2026-06-03 baseline, not merged**) |
| Repo | `drlupei-ux/nanoviga-bioage` |

## Deployment status
| Component | State |
|---|---|
| Frontend (Next.js 14.2.5) | ✅ Live — `nanoviga.com` (Vercel, **production branch = `clinical`**), commit `6b6a977` |
| Cloud fn `generateReport` (PLA) | ✅ Deployed (Node 18, `@cloudbase/node-sdk` bundled via `package.json`+`InstallDependency`); **email OFF** |
| Cloud fn `analyzeCBA` (CBA) | ✅ Deployed (same); persists narrative; **email OFF** |
| Email delivery | ⛔ **Disabled** (`EMAIL_ENABLED` unset). By design — delivery model is **WeChat manual**, not email. |
| CloudBase env | `bioage-compass-prod-9chaf35e573d` (ap-shanghai) |
| Collections | `report_submissions`, `cba_submissions`, `case_counters`, `funnel_events`, `assessments` (legacy/fallback) |
| Admin dashboard | ✅ Live — `/admin` (password-gated, route-level `adminGuard`) |

## User testing status
**Not started.** Plan: [`docs/testing/first-20-users-plan.md`](./docs/testing/first-20-users-plan.md). Milestone = **first 10–20 real PLA users through the WeChat claim flow**. Funnel is instrumented (`funnel_events`) but **no real data collected yet** (no pre-redesign baseline exists).

## Open issues
| ID | Issue | Pri | Notes |
|---|---|---|---|
| OPEN-01 | ~50 legacy test records clutter the admin queue | P1 | Search mitigates; purge before scale. Data-hygiene script exists (`npm run clean:test-cases` covers `isTest:true` only). |
| OPEN-02 | Conversion funnel has no baseline; WeChat *add* is unmeasurable client-side | P1 | Track `qr_modal_opened`→`report_delivered` from `funnel_events` after ~50 sessions. |
| OPEN-03 | `/admin` unauth shows page shell then 401 (no clean redirect) | P3 | Cosmetic; API is guarded — no data exposure. |
| OPEN-04 | External-browser WeChat add is higher-friction (save-to-album / copy-ID) | P2 | Inherent WeChat limitation; in-WeChat 长按识别 works. |
| OPEN-05 | Admin session cookie is 12h (frequent re-login) | P3 | Acceptable for single-doctor pilot. |
| OPEN-06 | CBA flow built but unexercised in production (`cba_submissions` empty) | P2 | Validate during pilot if CBA is offered. |
| OPEN-07 | PLA×CBA linkage depends on `sessionStorage` (same browser/tab) | P3 | DB fallback exists; carried from v0.1. |

## Technical debt
- **Branch divergence:** production runs from `clinical` (fed by `feat/clinical-email-system`); `main` is stale. Decide a branching convention before more contributors.
- **Cloud-function deploy is bespoke:** `node tools/build-deploy.js` (inlines `emailTemplate.js`) → `scripts/deploy-fn.ts` (via `@cloudbase/manager-node`). Documented but not a one-command release.
- **Middleware does not run on Vercel** for this setup → auth enforced by per-route `adminGuard` (defense-in-depth). Don't rely on `src/middleware.ts` alone.
- **Report stored as raw model JSON** in DB; formatting happens at render (`reportFormat.ts`). Acceptable, but the "final report" is assembled only in the dashboard / WeChat-copy text, not persisted as one artifact.
- **BAC caseId sequence has small gaps** from controlled testing (harmless; ids unique).
- **Two `ADMIN_EMAIL` constants** (163) remain in cloud functions behind the disabled email path (dead-ish until/unless email is re-enabled).

## Next milestone
**Run the first 10–20-user test** (see testing plan) → read the real conversion funnel → decide whether to (a) reduce WeChat-add friction, (b) build the post-review delivery automation (email-to-Gmail / formatted artifact — currently postponed), or (c) iterate results-page copy. **Do not build delivery automation or payments until the funnel and the manual delivery loop are validated with real users.**

---
*Maintained as the project SSOT. On each release: bump version/commit/tag, refresh deployment + open issues + testing status, and add a `CHANGELOG.md` entry.*
