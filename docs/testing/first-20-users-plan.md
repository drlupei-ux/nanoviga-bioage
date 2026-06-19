# First 20 Users — Validation Plan

**For:** BioAge Compass MVP v0.9-beta · **Goal:** validate the PLA→WeChat conversion and the manual doctor-delivery loop with real users **before** building any automation.

> Guiding rule: this is **discovery**, not growth. 20 users is enough to learn whether the flow works and where it breaks. Do not optimize spend or build delivery automation until this completes.

---

## 1. Recruitment plan
- **Target persona:** female, 40–60, health-conscious, WeChat-native (the primary BioAge Compass user).
- **Sources (warm first):** Dr. Lu's existing WeChat contacts / patient circle (5–8), referrals (5), one small 小红书 / WeChat-moments post linking to `nanoviga.com` (7–10) to also test **cold/external-browser** traffic.
- **Cohorts to compare:** (a) **in-WeChat** opens (link shared in WeChat → 长按识别 works) vs (b) **external-browser** opens (小红书/Safari → save-to-album path). Tag each recruit's expected channel.
- **Sample:** 20 completed PLAs, aim ~10 per cohort.
- **Consent:** verbal/WeChat consent that this is a beta and the report is doctor-reviewed, not a diagnosis.
- **Cadence:** rolling, ~1 week; Dr. Lu handles delivery same-day.

## 2. Data collection plan
- **Automatic (already instrumented):** `funnel_events` collection (`pla_completed`, `claim_generated`, `get_report_clicked`, `qr_modal_opened`, `report_delivered`) — pull via `npm`-style query or admin DB.
- **Per-case (Dr. Lu logs in a simple sheet):** Claim Code, channel (in-WeChat / external), did they add WeChat? (Y/N), did they send the Claim Code unprompted? (Y/N), time to deliver, report usefulness (post-delivery 1–5), notes.
- **Drop-off capture:** for users who reached `qr_modal_opened` but never added WeChat, note suspected reason (couldn't recognize QR / didn't understand / lost interest).
- **No new PII storage** beyond what the app already captures; keep the sheet private.

## 3. Funnel metrics (compute from `funnel_events` + Dr. Lu's sheet)
| Step | Source | Definition |
|---|---|---|
| PLA completed | `pla_completed` | reached results |
| Claim generated | `claim_generated` | code shown (≈ same as completed) |
| **Get-report clicked** | `get_report_clicked` | tapped the primary CTA |
| **QR modal opened** | `qr_modal_opened` | saw the QR (conversion *intent*) |
| **WeChat added** | Dr. Lu sheet | actually added (not measurable in-app) |
| **Report delivered** | `report_delivered` | doctor delivered |
Key ratios: CTA-click rate (`clicked/completed`), QR-reach rate (`qr/completed`), **add rate** (`added/qr`, by cohort), delivery rate (`delivered/qr`). Compare in-WeChat vs external cohorts.

## 4. Interview questions (5–8 users, post-delivery, ~10 min on WeChat)
1. When you saw your result, did you feel it was **finished** or that there was more to get? Why?
2. Was it clear **what the full report contained** and why it was worth getting?
3. What made you decide to **add Dr. Lu** (or not)? What almost stopped you?
4. How easy was adding on WeChat? Where did you get stuck (QR / saving image / finding the chat)?
5. Did you understand you needed to **send the Claim Code**? Was that natural?
6. When you received the report, was it **clear and useful**? Did you trust it? (1–5)
7. Anything confusing, slow, or that felt "spammy"?
8. Would you recommend it to a friend? Pay for a deeper version?

## 5. Success criteria
**Go / iterate / stop signals** after 20 users:
- ✅ **Go (build next):** QR-reach ≥40% of completers; WeChat-add ≥50% of QR-reachers in the **in-WeChat** cohort; report usefulness ≥4/5; Dr. Lu delivery effort < 10 min/case.
- 🔁 **Iterate (fix friction, retest):** QR reached but add rate < 50% → fix the worst step (likely external-browser add or value framing); re-run a small batch.
- 🛑 **Stop / rethink:** completers rarely click the CTA (<20%), or users add but don't value the report (<3/5) → the offer/positioning, not the mechanics, is the problem.
- **Data-integrity gate (must pass):** every delivered report matched the correct Claim Code → case (no mismatches).

## 6. Out of scope for this test
Paid conversion, ad-spend optimization, delivery automation, SES/email, PDF, CBA upsell (unless a user organically asks). Keep the variables few.
