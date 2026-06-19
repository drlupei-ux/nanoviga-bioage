# Current System Architecture (as deployed)

**As of:** 2026-06-19 · prod commit `6b6a977` · MVP v0.9-beta.
Snapshot of what is **actually running in production**, not aspirational design.

---

## Topology
```
                 ┌─────────────────────────────────────────────┐
  User (mobile)  │  Vercel — Next.js 14.2.5 (branch: clinical) │
  ──────────────▶│  nanoviga.com                               │
                 │   public:  / · /assessment · /results       │
                 │            /cba/*  · /report                 │
                 │   admin:   /admin · /admin/[type]/[id]       │
                 │   api:     /api/save-assessment              │
                 │            /api/generate-report (await/keep) │
                 │            /api/cba/{analyze,submit}         │
                 │            /api/track  (funnel, public)      │
                 │            /api/admin/* (cookie-gated)       │
                 └───────────────┬─────────────────────────────┘
                                 │ HTTPS (server-side fetch / @cloudbase/node-sdk)
                                 ▼
        ┌────────────────────────────────────────────────────────────┐
        │ Tencent CloudBase  env bioage-compass-prod-9chaf35e573d      │
        │  ap-shanghai                                                 │
        │   Functions (Node 18, HTTP):                                 │
        │     • generateReport  — PLA: DeepSeek report, save, caseId   │
        │     • analyzeCBA      — CBA: OCR + PhenoAge + report persist │
        │   DB collections:                                            │
        │     report_submissions · cba_submissions · case_counters     │
        │     funnel_events · assessments (legacy/fallback)            │
        │   External: DeepSeek API · Tencent OCR · 163 SMTP (OFF)      │
        └────────────────────────────────────────────────────────────┘
```

## Frontend (Vercel)
- Next.js App Router, TS strict, Tailwind (`clinical.*` tokens). Two state contexts: `AssessmentContext` (PLA, sessionStorage `nanoviga_results`), `CBAContext` (`nanoviga_cba_results`).
- **Production branch is `clinical`** (Vercel git integration). Deploy = `git push origin <branch>:clinical`. `main` is stale.
- **Conversion components:** `ClaimReportCTA`, `WeChatClaimModal` (env-adaptive via `MicroMessenger` UA), `track()` → `/api/track`.
- **Admin:** `src/app/admin/*`, `src/lib/admin/*` (`types`, `session` portable HMAC cookie, `cloudbase` admin SDK, `auth` `adminGuard`, `reportFormat`). `src/middleware.ts` exists but **does not run on this Vercel deploy** — auth is enforced by per-route `adminGuard`.

## Backend (CloudBase)
- **`generateReport`** (PLA): modes `summary` (4-line) / `full` (report + save + email). Allocates `caseId` (`BAC-YYYY-NNNN`) via `case_counters` transaction; writes `status:'submitted'`; **email gated by `EMAIL_ENABLED` (off)**.
- **`analyzeCBA`** (CBA): `extract` (Tencent OCR → DeepSeek JSON) / `cba_submit` (PhenoAge results, save, persist report); email gated off.
- **Email transport:** raw 163 SMTP (`sendSmtpEmail163`) only; **SES not implemented** (standalone test script only). Recipient constant is a 163 address; **no Gmail path exists**.
- Shared `emailTemplate.js` (JSON→HTML renderer) is the single source, **inlined into each function at deploy** (`tools/build-deploy.js`).

## Data model (key fields)
- `report_submissions`: `name, age, gender, bioAge, score, dimensionScores, contact, assessmentCode, report (raw JSON), createdAt, status, caseId, doctorNote, priority, tags`.
- `cba_submissions`: `assessmentCode, l1RefCode, name, phoneSuffix, actualAge, gender, phenoAge, organAges, biomarkers, submittedAt, status, caseId, report`.
- `case_counters`: `{_id:"<year>", year, seq}` — atomic BAC sequence (shared PLA+CBA).
- `funnel_events`: `{event, props, path, ts, ua}` — `pla_completed`/`claim_generated`/`get_report_clicked`/`qr_modal_opened`/`report_delivered`.
- `assessments`: legacy + HTTP-fallback target (when SDK unavailable).

## Identity / security
- **Admin auth:** shared password (`ADMIN_DASHBOARD_PASSWORD`) → signed httpOnly cookie (`ADMIN_SESSION_SECRET`, portable Web-Crypto HMAC, 12h) → verified by `adminGuard` in every `/api/admin/*` route.
- **CloudBase access from Vercel:** `@cloudbase/node-sdk` with CAM `TENCENT_SECRET_ID/KEY` + `TCB_ENV_ID` (Vercel Production env vars).
- `/api/track` is public (anonymous funnel writes). Public PLA/CBA APIs unchanged.

## Deploy & gates
```bash
# Frontend → production
npm run build && git push origin feat/clinical-email-system:clinical   # Vercel builds `clinical`

# Cloud functions
node tools/build-deploy.js                                   # inline emailTemplate → tools/deploy/*.deploy.js
node --env-file=.env.local --import tsx scripts/deploy-fn.ts generateReport tools/deploy/generateReport.deploy.js
node --env-file=.env.local --import tsx scripts/deploy-fn.ts analyzeCBA   tools/deploy/analyzeCBA.deploy.js

# Gates
PYTHONPATH=. python3 preflight_check.py
PYTHONPATH=. python3 tests/run_tests.py
npm test          # admin lib unit tests
npm run build
```

## Known architectural caveats
- Vercel does not run `middleware.ts` here → rely on `adminGuard` (not middleware) for admin protection.
- Cloud-fn deploy **must** bundle `@cloudbase/node-sdk` (`package.json` + `InstallDependency`), else the SDK path silently falls back to the `assessments` collection and caseId allocation fails.
- CloudBase HTTP request body ≈ 100KB limit → CBA OCR forwards images one-by-one (compressed).
- `report` is stored as raw model JSON; formatting is render-time (`reportFormat.ts`).
