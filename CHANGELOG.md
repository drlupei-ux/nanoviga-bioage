# Changelog — BioAge Compass

All notable changes to this project. Format loosely follows [Keep a Changelog](https://keepachangelog.com/).
Production runs from the `clinical` branch (Vercel) + Tencent CloudBase functions.

---

## [MVP-v0.9-beta] — 2026-06-19 · 🧊 Product Freeze

The "doctor-in-the-loop + WeChat delivery" conversion MVP. Email delivery is intentionally **off**; the objective is converting PLA users into WeChat contacts for manual doctor report delivery.

### Added
- **Conversion flow (Claim Code).** Results page redesigned: `ClaimReportCTA` (basic-result framing + report-value list + a personal **Claim Code** = `assessmentCode` suffix, e.g. `K8M4`). One primary CTA "领取我的完整医生报告" → copies a pre-filled WeChat request + opens a full-screen `WeChatClaimModal` (**≤1 click to QR**).
- **WeChat acquisition modal**, mobile-first, environment-adaptive: inside WeChat → 长按识别二维码; external browsers → **save-to-album → 微信扫一扫 → 相册**, plus one-tap **copy WeChat ID** (`Charlie20850`).
- **Admin: formatted Doctor Report View** (`reportFormat.ts` + `DoctorReportView.tsx`) — parses raw AI JSON into readable sections (评级 / 三大风险 / 风险机制 / 90 天路线图) with **"复制到微信"** (report + doctor note as plain text).
- **Admin: Claim Code column + cross-status search** (by claim code / case id / name) — Dr. Lu matches a case from the code the user sends.
- **Conversion funnel analytics** → new `funnel_events` collection + public `/api/track`: `pla_completed`, `claim_generated`, `get_report_clicked`, `qr_modal_opened`, `report_delivered`.
- **Admin Review Dashboard (V0)**: password login + `adminGuard` per-route; queue → case detail → lifecycle `submitted → under_review → delivered`; single free-text doctor note (editable after delivery — not a lock).
- **`caseId` `BAC-YYYY-NNNN`** allocated at submission via an atomic `case_counters` transaction (shared PLA+CBA yearly sequence); admin backfill for legacy/null.
- Tooling: `scripts/deploy-fn.ts` (CloudBase function deploy via `@cloudbase/manager-node`), `scripts/ensure-case-counters.ts`, labeled test-data seed/cleanup scripts.

### Changed
- **Email disabled** in both cloud functions behind `EMAIL_ENABLED` (unset = off). New submissions write `status:'submitted'`.
- `analyzeCBA` now **persists the generated CBA narrative** to `cba_submissions.report`.
- Cloud-function deploys now **bundle `@cloudbase/node-sdk`** (`package.json` + `InstallDependency`) so the SDK path (correct collection + caseId) works — fixes the silent HTTP-fallback-to-`assessments` regression.

### Fixed
- **Security:** admin API was briefly publicly readable (Vercel doesn't run `src/middleware.ts`) → added per-route `adminGuard`.
- **WeChat QR add-friend** failed in external browsers → environment-adaptive instructions + copy-ID fallback.

### Deliberately NOT built (postponed)
- Email-to-`drlupei@gmail.com` after review · Tencent SES · PDF/attachment · payment automation · automated user-facing delivery · L3 FMA / L4 ECA.

---

## [v0.1.0-beta] — 2026-03-29 → 2026-06-08 (pre-freeze work, consolidated)

- **2026-06-08** — Clinical email system refactor: model **JSON contract → deterministic HTML template** (`emailTemplate.js`, shared, inlined at deploy), 5-section report. (Email later disabled in v0.9.)
- **2026-06-07** — Production fixes: CBA OCR response-contract (`{ok}`), removed残留 ¥199 copy (内测免费), CloudBase ~100KB payload limit → per-image compressed concurrent forwarding.
- **2026-06-03** — CBA: ¥199 payment code removed (内测免费); real screenshot OCR via Tencent OCR + DeepSeek (21-field JSON); doctor manual cross-check note.
- **2026-03-29** — `v0.1.0-beta` tag. L1 PLA (29-question, 7D→5D radar, bioAge), L2 CBA (PhenoAge/Levine 2018), DeepSeek reports, admin email notifications (since disabled), `risk_engine` R0–R3 gating.

*(Full historical detail previously lived in `PROJECT_STATUS.md`; see git history for commit-level notes.)*
