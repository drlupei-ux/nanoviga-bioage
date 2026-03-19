# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Two Products in One Repo

This repo contains two separate but related products that deploy independently:

| Product | Entry point | Deployed at | Tech |
|---|---|---|---|
| **BioAge Compass (index.html)** | `index.html` | CloudBase static hosting (auto-deploy from `main`) | Plain HTML + Vanilla JS + Chart.js CDN |
| **nanoviga-clinical (Next.js)** | `src/` | nanoviga.com via Vercel | Next.js 14.2.5 · TypeScript · Tailwind |

---

## Product 1 — BioAge Compass (`index.html`)

### Deployment

Edit `index.html`, commit, push to `main`. CloudBase auto-deploys.

```bash
git add index.html
git commit -m "..."
git push origin main
```

No build step. The file is ~3100 lines of self-contained HTML/CSS/JS. `wechat-qr.png` in repo root is the legacy fallback; the live QR image is served from Tencent COS:
```
https://wechat-qrcode-nano-1405252881.cos.ap-shanghai.myqcloud.com/wechat-qr.png
```

### Architecture

Single-page app with multiple `<div>` screens toggled via `display:none/block`. Screen flow:

```
welcomeScreen → basicInfoScreen → questionContainer
    → calculatingScreen → dashboardScreen
        → [wechatCtaSection shown inline on dashboard]
        → fullReportSection (via generateReport cloud fn)
```

All state is in global JS variables (`userInfo`, `answers[]`, `currentQuestion`, `window._reportBioAge`, etc.). No framework, no modules.

### Bio-Age Algorithm (mirrored from Next.js `scoring.ts`)

```js
ageFactor = age < 35 ? 0.8 : age < 45 ? 1.0 : age < 55 ? 1.2 : 1.5
delta     = ((totalScore - 50) / 5) * ageFactor
bioAge    = clamp(actualAge - delta + geneticPenalty + bmiAdj * 0.3,
                  actualAge - 15, actualAge + 18)
```

`totalScore` = average of 7 dimension scores × 10 (0–100). `geneticPenalty` = `(5 - genScore) * 0.3` when 遗传因素 score < 5.

### WeChat QR — Browser Detection

Two classes control visibility; `initWechatUI()` is called on `DOMContentLoaded`:
- `.wx-wechat-only` — shown only inside WeChat (`/MicroMessenger/i`)
- `.wx-native-only` — shown in Safari/Chrome; displays a "一键复制微信号" button (WeChat ID: `Charlie20850`)

Copy uses `navigator.clipboard.writeText()` with `execCommand('copy')` fallback. Success shows `#wxCopyToast`.

### Cloud Functions

**CloudBase environment:** `bioage-compass-prod-9chaf35e573d` (ap-shanghai)

HTTP endpoints (no auth required):
```
POST .../saveAssessment   — saves assessment to `assessments` collection
POST .../generateReport   — calls DeepSeek AI, saves to `report_submissions`, sends email
```

Cloud function source lives at `cloud-functions/generateReport/index.js` (261 lines, Node.js 18).

**generateReport modes** (controlled by `event.body.mode`):
- `summary` — 4-sentence summary + CBA recommendation, `max_tokens=350`
- `full` — 2-section report (风险信号 + 缓龄策略, ~600 words), `max_tokens=1500`, also saves to DB + sends SMTP email via `smtp.163.com:465`

**Deploying cloud function changes:**
Use the old CloudBase console (`console.cloud.tencent.com`) — it exposes Monaco editor directly in the page JS scope:
```js
monaco.editor.getModels()[0].setValue(code)  // then click 保存
```
The new console (`tcb.cloud.tencent.com`) uses a cross-origin iframe — avoid it.

**Environment variables on the cloud function:** `DEEPSEEK_API_KEY`, `EMAIL_163_AUTH_CODE`

**Test via curl:**
```bash
# summary mode
curl -s -X POST 'https://bioage-compass-prod-9chaf35e573d-1405252881.ap-shanghai.app.tcloudbase.com/generateReport' \
  -H 'Content-Type: application/json' \
  -d '{"mode":"summary","name":"测试","age":40,"gender":"male","bioAge":36,"score":78,"dimensionScores":{"运动能力":8,"身心平衡":7,"营养代谢":6,"睡眠质量":9,"遗传因素":8,"环境因素":7}}' \
  --max-time 60
```

### Other HTML Files

- `PLA_生活方式年龄评估.html` — early prototype, ~3100 lines, not deployed
- `layer2.html` — L2 CBA (blood biomarker age via PhenoAge algorithm) static page, served at `/layer2.html`

---

## Product 2 — nanoviga-clinical (Next.js)

### Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint via Next.js
```

> ⚠️ `next.config` must be `.js` (CommonJS) — Next.js 14.2.5 does not support `.ts` config files.

### Architecture

All state lives in `src/context/AssessmentContext.tsx` — a single React Context wrapping the entire app (`layout.tsx`). State is **in-memory only** and lost on page refresh.

```
/ (landing)
  → /assessment  (ProfileForm → 29 QuestionCards)
      → setResults() + router.push("/results")
          → /results  (scores, radar, findings, recommendations)
              → router.push("/report")
                  → /report  (lead capture → WeChat QR success screen)
```

If `results` is null when `/results` loads, it redirects to `/`.

### Scoring (`src/lib/scoring.ts`)

Same algorithm as `index.html` above. 29 questions × 7 dimensions, each option scores 10/7/4/1.

```
dimensionScore  = average of answers in dimension  → 0–10
totalScore      = (sum of dimensionScores / 7) × 10 → 0–100
assessmentCode  = "BCA-" + 4-char random alphanumeric
```

Score ranges (from `src/types/assessment.ts`): `optimal` ≥ 8.0 (jade), `average` ≥ 6.0 (amber), `attention` < 6.0 (danger).

### Design System

All colours are `clinical.*` tokens in `tailwind.config.ts`. Two reusable CSS classes in `globals.css`:
- `.clinical-card` — white rounded card with border and shadow
- `.clinical-section-label` — small-caps section heading

Fonts: Inter (body) + Playfair Display (`font-display`, used for large score numbers/headings).
Use `cn()` from `src/lib/utils.ts` for conditional Tailwind merging.

### Key Source Files

| File | Purpose |
|---|---|
| `src/types/assessment.ts` | All shared types, DOMAIN_LABELS, score-range helpers, `getAgingStatus()` |
| `src/lib/questions.ts` | All 29 questions with Chinese text and option scores |
| `src/lib/scoring.ts` | `calculateResults()` — full bio-age computation |
| `src/components/FindingCard.tsx` | Per-dimension result card; contains `FINDING_COPY` (Chinese) |
| `src/components/HeroScore.tsx` | Animated bio-age display with spectrum bar |
| `src/components/RadarHealth.tsx` | Recharts radar of 7 dimensions |
| `src/app/report/page.tsx` | Lead capture (name + phone required); success screen shows WeChat QR |

---

## UI & Content Rules (both products)

From `/skills/nanoviga_ui_v1/ui_principles.skill.md`:

- **Tone:** clinical, calm, authoritative
- **Forbidden words:** "AI", "model", "algorithm", "generated"
- **Language:** Chinese primary; all user-facing copy must be in Chinese
- **Preferred terms:** "Assessment" / "Clinical Insight" / "Key Findings" / "Recommended Actions"
- **Mobile-first**, result first, no long paragraphs, no hype language
- No new UI patterns outside the defined component system

## The 7 Assessment Dimensions

运动能力 · 身心平衡 · 营养代谢 · 睡眠质量 · 遗传因素 · 环境因素 · 感官衰老

Total: 29 questions (运动能力 has 5; all others have 4).
