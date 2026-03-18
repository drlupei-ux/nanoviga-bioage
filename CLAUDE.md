# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:3000
npm run build    # Production build
npm run lint     # ESLint via Next.js
```

The dev server is also configured in `.claude/launch.json` and can be started via the Claude Code preview tool with the name `nanoviga-clinical`.

> ⚠️ `next.config` must be `.js` (CommonJS) — Next.js 14.2.5 does not support `.ts` config files.

## Architecture

**Stack:** Next.js 14.2.5 App Router · TypeScript · Tailwind CSS · Recharts · Lucide icons · No backend (all client-side)

### Assessment Flow

All state lives in `src/context/AssessmentContext.tsx` — a single React Context wrapping the entire app (`layout.tsx`). State is **in-memory only** and lost on page refresh or navigation away from the active session.

```
/ (landing)
  → /assessment  (ProfileForm → 29 QuestionCards)
      → setResults() + router.push("/results")
          → /results  (displays scores, radar, findings, recommendations)
              → router.push("/report")
                  → /report  (lead capture form → WeChat QR success screen)
```

The context stores `profile` (UserProfile), `answers` (number[]), and `results` (AssessmentResults). If `results` is null when `/results` loads, it redirects to `/`.

### Scoring (`src/lib/scoring.ts`)

29 questions across 7 dimensions (4–5 questions each). Each option scores 10/7/4/1.

```
dimensionScore  = average of answers in that dimension  → 0–10 scale
totalScore      = (sum of all dimensionScores / 7) × 10 → 0–100 scale
delta           = ((totalScore - 50) / 5) × ageFactor
bioAge          = actualAge - delta + geneticPenalty + bmiAdj × 0.3
                  clamped to [actualAge - 15, actualAge + 18]
agingRate       = bioAge / actualAge
peerPercentile  = 50 - diff × 3.5  (clamped 1–99)
assessmentCode  = "BCA-" + 4-char random alphanumeric  (generated once in calculateResults)
```

`ageFactor` scales delta by age bracket: <35 → 0.8, <45 → 1.0, <55 → 1.2, ≥55 → 1.5.

### Design System

All colours are defined as `clinical.*` tokens in `tailwind.config.ts`:

| Token | Usage |
|---|---|
| `clinical-navy` / `clinical-primary` | Primary text |
| `clinical-secondary` | Secondary text |
| `clinical-muted` | Subdued labels |
| `clinical-jade` / `clinical-jade-lt` | Optimal / positive |
| `clinical-amber` / `clinical-amber-lt` | Average / neutral |
| `clinical-danger` / `clinical-danger-lt` | Attention / risk |
| `clinical-gold` | Logo / accent |
| `clinical-bg` | Page background |
| `clinical-border` | Card borders |

Two CSS component classes in `globals.css`:
- `.clinical-card` — white rounded card with border and shadow
- `.clinical-section-label` — small-caps section heading

Fonts: Inter (`--font-inter`, body) + Playfair Display (`--font-playfair`, `font-display` class, used for large score numbers and headings).

Score ranges (from `src/types/assessment.ts`):
- `optimal` ≥ 8.0 → jade (green)
- `average` ≥ 6.0 → amber
- `attention` < 6.0 → danger (red)

### Key Source Files

| File | Purpose |
|---|---|
| `src/types/assessment.ts` | All shared types, DOMAIN_LABELS, score-range helpers, `getAgingStatus()` |
| `src/lib/questions.ts` | All 29 questions with Chinese text and option scores |
| `src/lib/scoring.ts` | `calculateResults()` — the full bio-age computation |
| `src/components/FindingCard.tsx` | Per-dimension result card; contains `FINDING_COPY` (Chinese) |
| `src/components/RecommendationCard.tsx` | Priority intervention card |
| `src/components/HeroScore.tsx` | Animated bio-age display with spectrum bar |
| `src/components/RadarHealth.tsx` | Recharts radar chart of 7 dimensions |
| `src/app/report/page.tsx` | Lead capture (name + phone required); success screen shows WeChat QR |
| `public/wechat-qr.jpg` | Doctor + WeChat QR image shown after lead capture |

## UI & Content Rules

Follow the skill files in `/skills/nanoviga_ui_v1/`:

- **Tone:** clinical, calm, authoritative. Never mention "AI", "model", "algorithm", or "generated".
- **Language:** Chinese primary, English secondary. All user-facing copy must be in Chinese.
- **No new UI patterns** outside the defined component system.
- **Mobile-first**, max content width `max-w-xl` on results page, `max-w-sm`/`max-w-md` on forms and questions.
- Elderly-friendly font sizes: body copy `text-sm`, section descriptions `text-base`, dimension names `font-semibold text-base`.
- Use `cn()` (from `src/lib/utils.ts`) for conditional Tailwind class merging.

## The 7 Assessment Dimensions

运动能力 · 身心平衡 · 营养代谢 · 睡眠质量 · 遗传因素 · 环境因素 · 感官衰老

Each has 4 questions (except 运动能力 which has 5, 身心平衡 which has 4, and 营养代谢 which has 4). Total: 29 questions.
