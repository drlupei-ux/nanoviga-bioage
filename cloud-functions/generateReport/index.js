// [CHANGE 2026-05-31] 原因：部署 CLINICAL_REASONING_SYSTEM (A+B+C+H 升级) 到生产环境 | 影响范围：cloud-functions/generateReport/index.js
// [CHANGE 2026-06-08] 原因：JSON contract + HTML multipart email via shared template (Task 12) | 影响范围：cloud-functions/generateReport/index.js
const https = require('https');
const tls   = require('tls');
const ET    = require('../shared/emailTemplate'); // 部署时内联，见 plan Task 14

const ENDPOINT = 'https://bioage-compass-prod-9chaf35e573d-1405252881.ap-shanghai.app.tcloudbase.com';
const ADMIN_EMAIL = '13816746212@163.com';

// ─── CLINICAL REASONING SYSTEM ──────────────────────────────────────────────
// Source: docs/clinical-principles.md + WF_Risk_Context.md + WF_Biomarker_Analysis.md
// Integration maturity: 72/100 (post A+B+C+H upgrades). See docs/integration-maturity-analysis.md.
const CLINICAL_REASONING_SYSTEM = `You are a clinical reasoning assistant operating under the bioage-compass evidence-based medicine framework. Apply all rules below to every report.

── EVIDENCE TIERS ──────────────────────────────────────────────────────
Tag every claim. Using stronger language than evidence supports is a governance failure.
  Tier 1 (RCT + hard endpoints):          "established," "reduces," "shown to improve"
  Tier 2 (RCT + validated surrogates):    "likely reduces," "evidence supports"
  Tier 3 (large prospective cohort):      "associated with," "linked to," "observed correlation"
  Tier 4 (mechanistic/animal only):       "may," "in animal models," "mechanistically plausible"
Minimum tier: Tier 2 for any clinical recommendation or public-facing claim.
Mechanistic background may use Tier 4 only with explicit [Tier 4] label.

── BIOMARKER RULES ─────────────────────────────────────────────────────
Biomarker ≠ clinical outcome. State this explicitly when recommending biomarker modification.
Known surrogate failures — do not overstate benefit:
  HDL-C raising → no MACE reduction [Tier 1 negative: niacin, CETP inhibitors]
  HbA1c intensive lowering → increased mortality in one arm [ACCORD trial]
  Epigenetic clock slowing → hard outcome evidence not established [Tier 4]
  Telomere lengthening → hard outcome evidence not established [Tier 4]
Never cite animal lifespan extension as human longevity evidence. Tag: [Animal — species].
Observational studies establish association, not causation.
Mendelian randomization provides stronger causal inference than cohort; tag: [MR — causal inference, not RCT].
No preprint or conference abstract may anchor a clinical recommendation.

── MECHANISM ANALYSIS (required before each biomarker recommendation) ──
For every biomarker or dimension flagged as clinically significant, abnormal, or
elevated-risk, provide the following before interpreting or recommending intervention:
  (1) What biological process does this biomarker reflect?
  (2) Is it a direct measure or a downstream proxy — and of what upstream process?
  (3) What is driving this value in this patient's specific context?
No speculation without flagging as [Speculative] or [Tier 4].
Jumping from a lab value to a recommendation without mechanistic framing is a reasoning failure.

── BIOMARKER DISCORDANCE ────────────────────────────────────────────────
When two biomarkers in the same domain conflict, resolve to the higher-evidence, more
proximal variable. Name both explicitly; explain the resolution.
  ApoB > LDL-C        (ApoB counts atherogenic particles; LDL-C misses small-dense LDL)
  CAC > HDL-C         (CAC is established plaque — outcome, not biomarker; HDL raising Tier 1 negative)
  HOMA-IR > HbA1c     (insulin resistance precedes glucose dysregulation by years)
  IL-6 > hsCRP        (IL-6 is the upstream signal; hsCRP is the hepatic readout)
  VO2max > blood labs  (Tier 1 all-cause mortality predictor independent of lipid panels)
  Labs > epigenetic age (clock Tier 3–4; investigate for underlying metabolic drivers instead)
  Lp(a) > LDL-C       (genetically fixed, independent of LDL-C; upgrade risk if Lp(a) > 50 mg/dL)

── DECISION PHILOSOPHY ─────────────────────────────────────────────────
Leverage-first: identify the single highest-leverage change before listing any others.
  Leverage = effect size × evidence quality × feasibility.
  Rank before recommending. Never present an undifferentiated list.
Trajectory over snapshot: direction of travel matters more than a single value.
Healthspan over lifespan: biomarker optimization that reduces function is not a net win.
Avoid optimization theater: redirect supplement fine-tuning and low-evidence stacking
  toward high-leverage fundamentals.
Adherence over perfection: real-world benefit = efficacy × adherence rate × duration.
Contextual interpretation: reference ranges are population statistics, not individual targets.
Restraint: when risk is genuinely low, major modifiable factors are addressed, and
  proposed interventions are Tier 4 — affirm what works, name 1–2 monitoring intervals,
  do not generate a new optimization agenda. Optimization identity is a clinical risk.

── RISK CONTEXT (assess before every recommendation) ───────────────────
Step 1 — Establish baseline risk level (low / borderline / intermediate / high / very high).
  If ≥ 5 medications: conduct deprescribing audit (STOPP/START criteria) before adding anything.

Step 2 — Check risk amplifiers:
  Cardiometabolic: insulin resistance, central adiposity, atherogenic dyslipidemia (ApoB/TG/HDL),
    Lp(a) > 50 mg/dL, elevated hsCRP, hypertension, OSA.
  Lifestyle: smoking, sedentary/low VO2max, chronic psychological stress.
  Genetic/fixed: familial hypercholesterolemia, premature family CVD history (M < 55 / F < 65).

Step 3 — Check protective modifiers (reduce effective risk below the baseline score): [A]
  High VO2max (> 10 METs):                Tier 1 — all-cause mortality protection
  Muscle mass / grip strength:             Tier 2–3 — metabolic reserve, functional longevity
  Mediterranean / whole-food diet:         Tier 1–2 — CV and metabolic protection
  Non-smoker / never-smoked:              Tier 1 — large baseline protective effect
  Blood pressure well-controlled:          Tier 1 — major modifier when treated to target
  Adequate sleep quality (≥ 7h):          Tier 2 — attenuates cortisol dysregulation
  Low-dose aspirin (secondary only):       Tier 1 for secondary prevention; not primary prevention
Modifier logic: a patient with intermediate score + high VO2max + non-smoking + controlled BP
may carry lower effective risk than their score suggests. State the modifier logic explicitly —
do not omit protective factors when calculating effective risk.

Step 4 — Dual-indication scan (before finalizing any intervention list): [H]
  Check whether any single agent addresses multiple active amplifiers simultaneously.
  Dual-indication agents are higher leverage than two separate single-indication agents.
    SGLT2 inhibitor:    T2DM + HFrEF/HFmrEF LVEF stabilization + CKD progression (Tier 1 each)
    GLP-1 agonist:      T2DM + ASCVD events (SELECT/LEADER/SUSTAIN-6) + NASH + weight (Tier 1)
    ACE inhibitor/ARB:  Hypertension + post-MI cardioprotection + CKD proteinuria + HFrEF (Tier 1)
    Rosuvastatin:       ApoB/LDL-C reduction + elevated hsCRP in normal-LDL patients (JUPITER, Tier 1)
  When a dual-indication agent applies, prefer it over two separate single-indication agents.

Step 5 — Benefit horizon: will this patient live long enough to receive the intervention's benefit?
  (Statins require 2–5 years for mortality benefit — this matters for frail or short-horizon patients.)

── PHARMACOTHERAPY / LIFESTYLE BALANCE ──────────────────────────────── [C]
RULE: Do NOT default to pharmacotherapy before high-leverage lifestyle interventions in
  low/intermediate-risk patients. Where lifestyle-first is the established approach,
  pharmacotherapy adds marginal absolute benefit.
RULE: Do NOT default to lifestyle-only recommendations in high/very-high-risk patients
  where pharmacotherapy is independently indicated regardless of lifestyle change —
  e.g., statin in established ASCVD, antihypertensive in stage 2 hypertension,
  anticoagulation in AF. These are not lifestyle-first situations.
RULE: Treat risk as a continuous spectrum, not binary. "Low risk" ≠ no risk.
  "Normal labs" ≠ optimal health. State the residual risk explicitly.

── CONFLICT RESOLUTION (apply in order when priorities conflict) ────────
1. Prevent immediate harm   (near-term established harm > long-term speculative benefit)
2. Preserve function        (functional capacity yields to no biomarker target)
3. Match the horizon        (intervention payoff must not exceed benefit window)
4. Favor adherence          (design for actual life context, not ideal conditions)
5. Reduce burden            (deprescribing is an active high-leverage intervention)
6. Optimize biomarkers      (proxies — yield to all principles above)

── UNCERTAINTY — state explicitly in these four situations ─────────────
1. Evidence is Tier 3 or below for this recommendation
2. Effect size is small or clinically marginal
3. Study population differs meaningfully from this individual
4. Conflicting evidence exists — describe the conflict; do not omit the contradicting trial


── FRAILTY MODIFIER (apply when ≥3 of: age ≥70 / gait <0.8 m/s / grip <27kg (M) or <16kg (F) / weight loss ≥5% in 6mo / ≥5 medications / MMSE <24 / ≥2 falls/yr / dysphagia / terminal dx with limited prognosis) ──── [G]
When frailty modifier triggers, REVERSE the Decision Philosophy ranking:
  "Preserve function" + "Match horizon" + "Reduce burden" categorically
  override "Optimize biomarkers". This re-ranking applies before any ROI
  sort. Default is de-escalation, not addition.

Frailty-relaxed targets:
  BP:     140/85 (not 130/80) unless documented LV strain
  HbA1c:  7.0–7.5 (not <7.0); deprescribe sulfonylurea if any hypoglycemia
  LDL:    stability over absolute target if life expectancy <5y
  Statin: reduce 40mg → 20mg in frail + low muscle if LDL already at target

Beers / STOPP deprescribing triggers (do this BEFORE adding anything):
  Sulfonylurea + age ≥75 or any cognitive impairment → falls + hypoglycemia
  Long-acting benzodiazepine in older adult           → falls + cognition
  NSAID + RAAS + diuretic concurrent                  → AKI (triple-whammy)
  Benzodiazepine in OSA                               → respiratory suppression
  Anticholinergic in dementia / MCI                   → cognitive worsening
  PPI >8 weeks without clear indication               → fracture + infection
  Glyburide in any frail patient                      → unacceptable hypoglycemia

Benefit horizon arithmetic (BEFORE adding chronic medication):
  Statin primary prevention requires 2–5y to mortality benefit;
    do NOT initiate if estimated life expectancy < benefit window.
  Cholinesterase inhibitor: 6–12mo symptom slowing; not disease-modifying.
  Memantine: modest function benefit; weigh against pill burden in dysphagia.
  Bisphosphonate: 1–2y fracture-reduction benefit window.

Dysphagia / pill-burden marker:
  Each new oral medication is a tax. Require explicit benefit > burden
  justification. Crushable / dissolvable formulations preferred.

── UPSTREAM-DRIVER DETECTION ───────────────────────────────────────────
When ≥2 active diagnoses or symptoms share a documented upstream driver
(OSA → resistant HTN + insulin resistance + inflammation; depression →
weight gain + metabolic decline; iron deficiency → fatigue + low T;
circadian disruption → IR + dyslipidemia + HTN), the upstream driver is
the primary lever — even when downstream symptoms have more visible
pharmacological options. Name the upstream chain explicitly.
Intensifying a downstream symptom while ignoring the upstream driver is
a reasoning failure.

── HRT EVIDENCE NUANCE ─────────────────────────────────────────────────
HRT cardiovascular evidence is genuinely conflicted:
  WHI (avg age 63, >10 yr post-menopause)      → increased CV events
  ELITE / KEEPS (within 6–10 yr of menopause)  → no increased CV events
  Timing hypothesis: within 10 yr of menopause AND no prior CV event
    ≠ WHI cohort.
Recommendation must state uncertainty:
  "Evidence supports HRT for vasomotor symptoms [Tier 1] and bone density
   [Tier 2]; CV-benefit claim in early-menopause cohort is not established
   [Tier 3]". Neither overclaim ("HRT prevents heart disease") nor
   categorically refuse.

── STATIN / TAMOXIFEN INTERACTION ──────────────────────────────────────
When patient is on tamoxifen, prefer rosuvastatin or pravastatin (not
CYP2D6-metabolized) over simvastatin / atorvastatin / fluvastatin
(CYP2D6 inhibition reduces tamoxifen → endoxifen conversion → reduced
anti-tumor efficacy). Name the interaction explicitly.


── REQUIRED OUTPUT FORMAT ──────────────────────────────────────────────
Every clinical report must contain:
  Effective risk level:   [low / moderate / high / very high]
  Primary lever:          [single most impactful intervention for this individual]
  Clinical escalation:    [condition under which pharmacotherapy is indicated]
  Deprioritize now:       [1–2 lower-leverage items to avoid]
  Monitor:                [specific measures and intervals]`;

exports.main = async (event, context) => {
  let data = {};
  try {
    let bodyStr = event.body || '';
    if (event.isBase64Encoded && bodyStr)
      bodyStr = Buffer.from(bodyStr, 'base64').toString('utf8');
    if (bodyStr) data = JSON.parse(bodyStr);
  } catch(e) {}

  const { name, age, gender, bioAge, score, dimensionScores, mode, contact, assessmentCode, agingPace, peerPercentile } = data;
  const DEEPSEEK_KEY    = process.env.DEEPSEEK_API_KEY;
  const EMAIL_AUTH_CODE = process.env.EMAIL_163_AUTH_CODE;

  if (!DEEPSEEK_KEY) return errResp('DEEPSEEK_API_KEY not configured');

  const dimText = dimensionScores
    ? Object.entries(dimensionScores).map(([k,v]) => `${k}: ${v}分`).join('、')
    : '';

  // ─── 模式1：短摘要 + CBA推荐（评估完成后自动展示） ──────────────────────
  if (mode === 'summary') {
    const prompt =
      `你是一位专业的抗衰老健康顾问。根据以下PLA评估数据，生成4句话的简短摘要，最后推荐CBA深度评估。\n\n` +
      `用户：${name||'用户'}，${age}岁，${gender==='male'?'男':'女'}\n` +
      `生物年龄：${bioAge}岁，PLA评分：${score}分\n维度得分：${dimText}\n\n` +
      `要求：\n` +
      `第1-2句：核心结论（生物年龄与实际年龄对比、整体状态）\n` +
      `第3句：最关键的优势或待改善点（具体维度）\n` +
      `第4句：推荐进行CBA（精准生物年龄）深度评估，说明其与PLA互补的价值\n` +
      `格式：纯文字，温暖专业，无标题，无换行符。`;

    const summary = await callDeepSeek(DEEPSEEK_KEY, prompt, 350);
    return okResp({ summary });
  }

  // ─── 模式2：完整缓龄报告 + 保存DB + 发邮件通知 ───────────────────────────
  // [CHANGE 2026-06-08] 移除 ageDiff/derivedStatus 死变量：评级改由 sections.hero.rating（computeRating）派生
  const agingPaceStr = agingPace ? `${agingPace}x` : ((bioAge && age) ? (bioAge/age).toFixed(2) + 'x' : 'N/A');
  const computedPeerPercentile = (peerPercentile != null && peerPercentile !== '')
    ? Number(peerPercentile)
    : (bioAge && age ? Math.max(1, Math.min(99, Math.round(50 - (age - bioAge) * 3.5))) : null);
  const peerRankStr  = (computedPeerPercentile != null) ? `前${computedPeerPercentile}%` : 'N/A';

  // [CHANGE 2026-06-08] JSON contract prompt (Task 12 Step 1) — structured output replaces Markdown
  const prompt =
    `根据以下PLA评估数据，生成一份"身体年龄风险评估"结构化结论。\n\n` +
    `用户：${name||'用户'}，${age}岁，${gender==='male'?'男':'女'}\n` +
    `身体年龄：${bioAge}岁，衰老速度：${agingPaceStr}，同龄排名：${peerRankStr}，PLA评分：${score}分\n` +
    `各维度：${dimText}\n\n` +
    `仅返回合法JSON（无Markdown、无JSON外文字），schema：\n` +
    `{"rating":"优秀|需关注|高风险","ratingReason":"一句话",` +
    `"risks":[{"name":"风险名","oneLine":"≤30字"}],` +
    `"mechanism":[{"cause":"原因","physiology":"生理机制","result":"结果"}],` +
    `"roadmap":{"d7":[".."],"d30":[".."],"d90":[".."]}}\n` +
    `要求：risks恰好3条；语言简体中文，临床、克制、可执行。`;

  // [CHANGE 2026-05-31] 改用 callDeepSeekWithReasoning 注入 CLINICAL_REASONING_SYSTEM
  // [CHANGE 2026-06-08] max_tokens 降至 800（JSON contract 无需长文本）
  const rawReport = await callDeepSeekWithReasoning(DEEPSEEK_KEY, CLINICAL_REASONING_SYSTEM, prompt, 800);
  const parsed = ET.parseModelJson(rawReport);

  const nowStr  = new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const dateStr = new Date().toLocaleDateString('zh-CN', { timeZone: 'Asia/Shanghai' });
  const sections = ET.assembleL1Sections({
    name, age, gender, bioAge, score,
    agingPaceStr, peerRankStr,
    contact: contact || '', assessmentCode: assessmentCode || '',
    submittedAt: nowStr, date: dateStr,
  }, parsed, rawReport);
  const htmlBody = ET.renderEmail(sections);
  const rating   = sections.hero.rating.label;
  const subject  = `【缓龄报告】${name||'新客户'} | ${rating} | ${assessmentCode||''}`.slice(0, 60);
  const textBody = `BioAge Compass 身体年龄评估报告\n客户：${name||'未知'} | 编号：${assessmentCode||''}\n身体年龄：${bioAge}岁（实际${age}岁）| 评级：${rating}\n（请在支持HTML的邮件客户端查看完整报告）`;

  // 保存到 CloudBase 数据库（使用内置 HTTP API，无需 npm）
  let dbSaved = false, dbError = null;
  try {
    const envId   = process.env.TCB_ENV_ID || 'bioage-compass-prod-9chaf35e573d';
    const token   = process.env.TCB_TOKEN || process.env.TENCENTCLOUD_SECRETID || '';
    const dbUrl   = `https://${envId}.ap-shanghai.app.tcloudbase.com/database`;
    const payload = JSON.stringify({
      collectionName: 'report_submissions',
      data: {
        name: name||'', age: age||0, gender: gender||'',
        bioAge: bioAge||0, score: score||0,
        dimensionScores: dimensionScores||{},
        contact: contact||'', assessmentCode: assessmentCode||'',
        report: rawReport, createdAt: new Date().toISOString(), status: 'pending'
      }
    });
    // 使用 CloudBase 云函数内置身份直接调用数据库
    const tcb = (() => { try { return require('@cloudbase/node-sdk'); } catch(e) { return null; } })();
    if (tcb) {
      const app = tcb.init({ env: envId });
      await app.database().collection('report_submissions').add(JSON.parse(payload).data);
      dbSaved = true;
      console.log('Saved to DB via SDK');
    } else {
      // 降级：通过内置 HTTP endpoint 保存
      await new Promise((res, rej) => {
        const u = new URL(`https://${envId}-1405252881.ap-shanghai.app.tcloudbase.com/saveAssessment`);
        const body = JSON.stringify({ _collection: 'report_submissions', ...JSON.parse(payload).data });
        const req = https.request({ hostname: u.hostname, path: u.pathname, method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
        }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); });
        req.on('error', rej); req.write(body); req.end();
      });
      dbSaved = true;
      console.log('Saved to DB via HTTP fallback');
    }
  } catch(e) { dbError = e.message; console.log('DB error:', e.message); }

  // [CHANGE 2026-03-27] 原因：fire-and-forget 导致云函数返回后 SMTP 连接被终止，邮件静默丢失 | 影响范围：cloud-functions/generateReport/index.js
  let emailResult = 'skipped';
  if (EMAIL_AUTH_CODE) {
    try {
      await sendSmtpEmail163(ADMIN_EMAIL, EMAIL_AUTH_CODE, ADMIN_EMAIL, subject, textBody, htmlBody);
      emailResult = 'sent';
      console.log('Email sent OK');
    } catch(e) {
      emailResult = 'failed: ' + e.message;
      console.log('Email failed:', e.message);
    }
  } else {
    console.log('EMAIL_163_AUTH_CODE not set, skipping email');
  }

  return okResp({ report: rawReport, saved: dbSaved, dbError, emailResult });
};

// ─── DeepSeek API 调用 ────────────────────────────────────────────────────────
function callDeepSeek(key, prompt, maxTokens) {
  return new Promise((resolve, reject) => {
    const reqBody = JSON.stringify({
      model: 'deepseek-chat',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens, temperature: 0.7
    });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'Content-Length': Buffer.byteLength(reqBody) }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body).choices[0].message.content); }
        catch(e) { reject(new Error('Parse: ' + body.slice(0,200))); }
      });
    });
    req.on('error', reject);
    req.write(reqBody); req.end();
  });
}

// [CHANGE 2026-05-31] 新增：带 system message 的 DeepSeek 调用（用于注入临床推理框架）
function callDeepSeekWithReasoning(key, systemContent, userPrompt, maxTokens) {
  return new Promise((resolve, reject) => {
    const reqBody = JSON.stringify({
      model: 'deepseek-chat',
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user',   content: userPrompt },
      ],
      max_tokens: maxTokens, temperature: 0.7
    });
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'Content-Length': Buffer.byteLength(reqBody) }
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body).choices[0].message.content); }
        catch(e) { reject(new Error('Parse: ' + body.slice(0,200))); }
      });
    });
    req.on('error', reject);
    req.write(reqBody); req.end();
  });
}

// ─── 163 SMTP 直连（无需 npm） ─────────────────────────────────────────────────
// [CHANGE 2026-06-08] 增加 htmlBody 参数；DATA_CMD 改用 ET.buildMimeMessage 发送 multipart/alternative
function sendSmtpEmail163(fromEmail, authCode, toEmail, subject, textBody, htmlBody) {
  return new Promise((resolve, reject) => {
    const b64 = s => Buffer.from(s,'utf8').toString('base64');
    let state = 'GREETING', buf = '', done = false;

    const finish = err => {
      if (!done) {
        done = true;
        try { socket.destroy(); } catch(_) {}
        err ? reject(err) : resolve();
      }
    };

    const socket = tls.connect({ host: 'smtp.163.com', port: 465 });

    socket.on('data', chunk => {
      buf += chunk.toString();
      while (true) {
        const idx = buf.indexOf('\r\n');
        if (idx === -1) break;
        const line = buf.substring(0, idx);
        buf = buf.substring(idx + 2);
        if (line.length < 3) continue;
        if (line[3] === '-') continue; // 多行响应继续等

        const code = parseInt(line.substring(0, 3));
        console.log(`[SMTP ${state}] ${code}: ${line.substring(4,60)}`);

        if (code >= 400) { finish(new Error(`SMTP ${code}: ${line}`)); return; }

        switch (state) {
          case 'GREETING':
            if (code === 220) { socket.write('EHLO bioage-compass\r\n'); state = 'EHLO'; }
            break;
          case 'EHLO':
            if (code === 250) { socket.write('AUTH LOGIN\r\n'); state = 'AUTH_INIT'; }
            break;
          case 'AUTH_INIT':
            if (code === 334) { socket.write(b64(fromEmail)+'\r\n'); state = 'AUTH_USER'; }
            break;
          case 'AUTH_USER':
            if (code === 334) { socket.write(b64(authCode)+'\r\n'); state = 'AUTH_PASS'; }
            break;
          case 'AUTH_PASS':
            if (code === 235) { socket.write(`MAIL FROM:<${fromEmail}>\r\n`); state = 'MAIL_FROM'; }
            else finish(new Error('Auth failed: ' + line));
            break;
          case 'MAIL_FROM':
            if (code === 250) { socket.write(`RCPT TO:<${toEmail}>\r\n`); state = 'RCPT_TO'; }
            break;
          case 'RCPT_TO':
            if (code === 250) { socket.write('DATA\r\n'); state = 'DATA_CMD'; }
            break;
          case 'DATA_CMD':
            if (code === 354) {
              const msg = ET.buildMimeMessage({ fromEmail, toEmail, subject, textBody, htmlBody });
              socket.write(msg + '\r\n.\r\n');
              state = 'DATA_SENT';
            }
            break;
          case 'DATA_SENT':
            if (code === 250) { socket.write('QUIT\r\n'); state = 'QUIT'; }
            break;
          case 'QUIT':
            finish(null);
            break;
        }
      }
    });

    socket.on('error', finish);
    socket.on('close', () => finish(null));
    setTimeout(() => { console.log('SMTP timeout'); finish(new Error('SMTP timeout')); }, 25000);
  });
}

// ─── 响应辅助 ─────────────────────────────────────────────────────────────────
const headers = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' };
const okResp  = d => ({ statusCode:200, headers, body: JSON.stringify({code:0,...d}) });
const errResp = m => ({ statusCode:200, headers, body: JSON.stringify({code:-1,message:m}) });
