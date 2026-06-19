# Release: BioAge Compass — MVP v0.9 Beta

**Date:** 2026-06-19 · **Tag:** `MVP-v0.9-beta` · **Prod commit:** `6b6a977` · **URL:** https://nanoviga.com
**Status:** 🧊 Product Freeze — entering first user testing.

---

## 1. Product vision
BioAge Compass (生命罗盘 · 陆大夫抗衰管理) is an **AI-assisted, doctor-in-the-loop biological-age assessment** for preventive/longevity medicine. A user completes a lifestyle assessment, gets a credible biological-age result, and is converted into a **WeChat contact of Dr. Lu**, who reviews the AI-generated report, adds a clinical note, and **delivers it manually via WeChat**. The MVP objective is **not** automated report email — it is **maximizing PLA→WeChat conversion** and validating the manual clinical-delivery loop with real users.

## 2. Current architecture (as deployed)
- **Frontend:** Next.js 14.2.5 + TypeScript + Tailwind, on **Vercel**, domain `nanoviga.com`, **production branch = `clinical`**.
- **Backend:** Tencent **CloudBase** env `bioage-compass-prod-9chaf35e573d` (ap-shanghai). Two Node-18 HTTP functions: `generateReport` (PLA) and `analyzeCBA` (CBA). AI = **DeepSeek** (JSON-contract reports; OCR via Tencent OCR + DeepSeek for CBA).
- **Data (CloudBase DB):** `report_submissions` (PLA), `cba_submissions` (CBA), `case_counters` (BAC sequence), `funnel_events` (analytics), `assessments` (legacy/fallback).
- **Admin:** `/admin` Next.js pages, password-gated via signed httpOnly cookie + **per-route `adminGuard`** (Vercel doesn't run `src/middleware.ts`); reads/writes CloudBase via `@cloudbase/node-sdk` with a CAM credential.
- Full detail: [`docs/architecture/current-system.md`](../architecture/current-system.md).

## 3. Implemented features
- **L1 PLA assessment:** 29-question lifestyle questionnaire → biological age (`scoring.ts`), 7D internal → **5D brand radar** display.
- **Conversion flow:** redesigned results page → `ClaimReportCTA` (basic result + value list + **Claim Code**) → one-click → **WeChat claim modal** (claim code card + QR + adaptive add-friend instructions). ≤1 click to QR.
- **Claim Code:** reuses `assessmentCode` 4-char suffix (e.g. `K8M4`); maps to the case; sent by the user on WeChat for matching. No new DB field.
- **Case creation:** on claim → `report_submissions` doc with `status:'submitted'`, `caseId` (`BAC-YYYY-NNNN`), and a DeepSeek AI report.
- **Admin Review Dashboard:** login, queue (claim-code column + cross-status search), case detail with **formatted Doctor Report View** (raw JSON → readable sections) + **复制到微信** (report + note), single doctor note, lifecycle `submitted → under_review → delivered`.
- **L2 CBA:** report-image OCR extraction + PhenoAge (Levine 2018) + report; narrative persisted. (Built; unexercised in production.)
- **Funnel analytics:** `funnel_events` collection via `/api/track`.
- **Quality gates:** `risk_engine.py` (R0–R3), `preflight_check.py`, `tests/run_tests.py`, admin unit tests (`npm test`, 16).

## 4. Deployment status
| Component | State |
|---|---|
| Frontend `nanoviga.com` | ✅ live (`clinical`, `6b6a977`) |
| `generateReport` / `analyzeCBA` | ✅ deployed, SDK bundled, **email OFF** |
| Collections | ✅ all present (`report_submissions`, `cba_submissions`, `case_counters`, `funnel_events`) |
| Admin `/admin` | ✅ live, password-gated |

## 5. Cloud functions status
- **`generateReport`** — PLA: DeepSeek report (JSON), saves to `report_submissions`, allocates caseId, email gated **off**. Modes `summary`/`full`.
- **`analyzeCBA`** — CBA: OCR `extract` + `cba_submit` (PhenoAge results + report persist), email gated **off**.
- **Deploy method:** `node tools/build-deploy.js` (inlines `shared/emailTemplate.js`) → `scripts/deploy-fn.ts` via `@cloudbase/manager-node` with `package.json` + `InstallDependency=TRUE` (SDK must be bundled). Email re-enabled only by setting `EMAIL_ENABLED=true` (code retained).

## 6. Conversion flow
```
PLA complete → /results (basic result + Claim Code K8M4)
  → tap "领取我的完整医生报告"  (1 click)
      • copies WeChat request text (incl. claim code)
      • creates case + AI report (caseId BAC-YYYY-NNNN)
      • opens full-screen modal → QR + claim code + add-friend steps
  → user adds Dr. Lu on WeChat, sends the Claim Code
Dr. Lu /admin → search Claim Code → review → doctor note → 复制到微信 → send to user
```

## 7. Known limitations
- WeChat *add* is unmeasurable client-side (only intent: `qr_modal_opened`).
- External-browser add is higher-friction (save-to-album / copy-ID) vs in-WeChat 长按识别.
- Report stored as raw JSON; "final report" assembled only at render / in the WeChat-copy text (not a persisted single artifact).
- ~50 legacy test records clutter the admin queue (search mitigates).
- Admin session 12h; `/admin` unauth page-shell (cosmetic; API guarded).
- CBA flow unexercised in production; PLA×CBA linkage relies on `sessionStorage` (+ DB fallback).
- No conversion baseline (pre-redesign was never instrumented).

## 8. Deliberately postponed features
Email-to-`drlupei@gmail.com` after review · **Tencent SES** (only a test script exists) · **PDF/attachment** · payment automation (内测免费) · automated user-facing delivery · multi-admin/roles · admin funnel dashboard UI · **L3 FMA / L4 ECA**. These are **not** to be built until the manual loop + funnel are validated.

## 9. User testing objectives
1. Validate the **PLA → WeChat-add** conversion (is the Claim-Code framing compelling?).
2. Validate the **manual delivery loop** is operable for Dr. Lu at small scale (find→review→note→copy→send).
3. Confirm the formatted report is **clinically usable** and **trustworthy** to users received via WeChat.
4. Surface the highest-friction step in the real funnel.
Plan: [`docs/testing/first-20-users-plan.md`](../testing/first-20-users-plan.md).

## 10. Success metrics
- **Primary:** results→`qr_modal_opened` rate (CTA engagement) and `qr_modal_opened`→`report_delivered` (true WeChat-add + delivery, doctor-confirmed). Target directional: **≥40%** reach the QR modal; **≥50%** of those become a delivered case during the assisted pilot.
- Time-to-deliver per case (Dr. Lu effort) — target **< 10 min/case** at ≤20 cases.
- Report usefulness (interview 1–5) — target **≥4/5**.
- Zero data-integrity incidents (correct case matched to each Claim Code).

## 11. Risks
- **Conversion risk:** external-browser users may stall at save-to-album; ad/小红书 traffic could convert poorly.
- **Manual-scale risk:** delivery is 100% manual — fine at 10–20, won't scale without automation (deliberately deferred).
- **Trust/clinical risk:** AI report content must be doctor-reviewed before sending (workflow enforces, but human discipline required).
- **Data hygiene:** test-record clutter could cause a wrong-case match if search is misused.
- **Single point of failure:** one doctor, one WeChat account, one CAM credential.

## 12. Next development priorities (post-validation, in order)
1. **Measure** the real funnel from `funnel_events` (+ optional `/admin/funnel` view).
2. **Purge test data** / add `isTest` filter for a clean pilot queue.
3. Based on data: reduce the worst-friction step (likely WeChat add for external traffic).
4. Only then consider **delivery automation** (formatted artifact + a delivery channel) and **payments**.
5. Branching cleanup (`clinical` vs `main`), one-command cloud-fn release.
