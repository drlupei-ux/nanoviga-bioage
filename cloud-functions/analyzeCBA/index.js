// [CHANGE 2026-03-23] 原因：CBA 云函数，负责 AI 指标提取 + 报告生成 + 邮件通知 | 影响范围：cloud-functions/analyzeCBA/index.js（新建）
// [CHANGE 2026-03-27] 原因：await SMTP 修复邮件静默丢失 | 影响范围：cloud-functions/analyzeCBA/index.js
// [CHANGE 2026-03-27] 原因：融合 PLA 数据实现双维度交叉分析 | 影响范围：cloud-functions/analyzeCBA/index.js
// [CHANGE 2026-03-28] 原因：PLA 维度统一使用5维品牌展示层（7D内部→5D映射），修复DB保存逻辑 | 影响范围：cloud-functions/analyzeCBA/index.js
// [CHANGE 2026-03-28] 原因：修复PLA数据查询——去除显式凭证覆盖、改用command.eq()、增加report_submissions回退 | 影响范围：cloud-functions/analyzeCBA/index.js
// Node.js 18 · 部署于 CloudBase 环境 bioage-compass-prod-9chaf35e573d
// [CHANGE 2026-05-31] 原因：部署 CLINICAL_REASONING_SYSTEM (A+B+C+H 升级) 到生产环境 | 影响范围：cloud-functions/analyzeCBA/index.js
const https  = require('https');
const tls    = require('tls');
const crypto = require('crypto');

const ADMIN_EMAIL = '13816746212@163.com';
const ENV_ID      = 'bioage-compass-prod-9chaf35e573d';

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

// ─── 主入口 ───────────────────────────────────────────────────────────────────
exports.main = async (event, context) => {
  let data = {};
  try {
    let bodyStr = event.body || '';
    if (event.isBase64Encoded && bodyStr)
      bodyStr = Buffer.from(bodyStr, 'base64').toString('utf8');
    if (bodyStr) data = JSON.parse(bodyStr);
  } catch(e) {}

  const DEEPSEEK_KEY    = process.env.DEEPSEEK_API_KEY;
  const EMAIL_AUTH_CODE = process.env.EMAIL_163_AUTH_CODE;

  if (!DEEPSEEK_KEY) return errResp('DEEPSEEK_API_KEY not configured');

  const { mode } = data;

  // ── 模式1：AI 指标提取（DeepSeek Vision）───────────────────────────────────
  if (mode === 'extract') {
    const { files } = data;
    if (!files || files.length === 0) return errResp('No files provided');
    const extractedValues = await extractBiomarkersWithAI(DEEPSEEK_KEY, files);
    return okResp({ biomarkers: extractedValues });
  }

  // ── 模式2：提交处理（保存 DB + 查询 PLA + 生成报告 + 邮件通知）──────────────
  if (mode === 'cba_submit') {
    const {
      assessmentCode, l1RefCode, l1PlaData, name: rawName, phoneSuffix,
      actualAge, gender, phenoAge, organAges, biomarkers, submittedAt
    } = data;
    // 联动用户：姓名优先从 l1PlaData.name（PLA sessionStorage 带来），其次用 rawName
    const name = rawName || (l1PlaData && l1PlaData.name) || null;

    // 初始化 TCB SDK（HTTP云函数需传显式凭证，运行时自动注入 TENCENTCLOUD_* 环境变量）
    // [CHANGE 2026-05-30] 原因：HTTP触发的云函数需显式传入凭证，否则SDK无法鉴权，database().add()静默失败
    let tcbApp = null;
    try {
      const tcb = require('@cloudbase/node-sdk');
      tcbApp = tcb.init({
        env:          ENV_ID,
        secretId:     process.env.TENCENTCLOUD_SECRETID,
        secretKey:    process.env.TENCENTCLOUD_SECRETKEY,
        sessionToken: process.env.TENCENTCLOUD_SESSIONTOKEN,
      });
      console.log('TCB SDK initialized OK');
    } catch(e) { console.log('TCB SDK not available:', e.message); }

    // 1. 获取关联 PLA 数据（先查，报告生成时需要）
    // 策略A（主）：使用前端随 payload 传入的 l1PlaData（sessionStorage 中的 PLA 评估快照）
    // 策略B（备）：若 l1PlaData 未传，尝试从 DB 查询 bioage_assessments
    let plaData = null;

    // 策略A：直接使用前端传入的 PLA 数据（最可靠，无DB权限/时序问题）
    if (l1RefCode && l1PlaData && l1PlaData.assessmentCode === l1RefCode) {
      plaData = l1PlaData;
      console.log('PLA data from payload (sessionStorage):', plaData.assessmentCode);
    }

    // 策略B：DB 回退查询（跨设备/浏览器刷新后 sessionStorage 丢失时使用）
    if (!plaData && l1RefCode && tcbApp) {
      const db = tcbApp.database();
      const _ = db.command;
      try {
        const res = await db.collection('bioage_assessments')
          .where({ assessmentCode: _.eq(l1RefCode) })
          .limit(1).get();
        if (res.data && res.data.length > 0) {
          plaData = res.data[0];
          console.log('PLA found in bioage_assessments (DB fallback):', plaData.assessmentCode);
        } else {
          console.log('bioage_assessments: no record for', l1RefCode);
          // 最终回退：report_submissions
          const res2 = await db.collection('report_submissions')
            .where({ assessmentCode: _.eq(l1RefCode) })
            .limit(1).get();
          if (res2.data && res2.data.length > 0) {
            const r = res2.data[0];
            plaData = {
              assessmentCode: r.assessmentCode, bioAge: r.bioAge,
              age: r.age, score: r.score,
              dimensionScores: r.dimensionScores,
              agingPace: r.agingPace, peerPercentile: r.peerPercentile,
            };
            console.log('PLA found in report_submissions (final fallback):', plaData.assessmentCode);
          }
        }
      } catch(e) {
        console.log('DB PLA query error:', e.message);
      }
    }

    // 3. 持久化到数据库（在报告生成和邮件发送之前，确保即使后续步骤失败也不丢失数据）
    // [CHANGE 2026-05-30] 原因：修复 cba_submit 模式中 DB 写入缺失 bug（dbSaved 未赋值，提交数据仅靠邮件，SMTP 失败时永久丢失）
    const organAges5D = mapCba6DTo5D(organAges);
    const dbPayload = {
      assessmentCode,
      l1RefCode:   l1RefCode ?? null,
      name:        name ?? null,
      phoneSuffix,
      actualAge,
      gender,
      phenoAge,
      organAges:   organAges5D ?? {},
      biomarkers:  biomarkers ?? {},
      submittedAt: submittedAt ?? new Date().toISOString(),
      status:      'pending',
    };
    let dbSaved = false;

    // 路径A：TCB SDK（首选）
    if (tcbApp) {
      try {
        await tcbApp.database().collection('cba_submissions').add(dbPayload);
        dbSaved = true;
        console.log('CBA submission saved to DB via SDK:', assessmentCode);
      } catch(e) {
        console.log('CBA DB save SDK failed:', e.message);
      }
    }

    // 路径B：HTTP 回退（SDK 不可用或鉴权失败时）— 与 generateReport 函数保持一致
    if (!dbSaved) {
      try {
        await new Promise((res, rej) => {
          const body = JSON.stringify({ _collection: 'cba_submissions', ...dbPayload });
          const req = https.request({
            hostname: `${ENV_ID}-1405252881.ap-shanghai.app.tcloudbase.com`,
            path:     '/saveAssessment',
            method:   'POST',
            headers:  { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) },
          }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => res(d)); });
          req.on('error', rej);
          req.write(body);
          req.end();
        });
        dbSaved = true;
        console.log('CBA submission saved to DB via HTTP fallback:', assessmentCode);
      } catch(e) {
        console.log('CBA DB HTTP fallback also failed:', e.message);
      }
    }

    // 4. 生成 DeepSeek 完整报告（融合 PLA 数据）
    // 6D→5D 映射已在步骤3之前完成，report 和 email 共享同一映射结果
    let report = '';
    try {
      report = await generateCBAReport(DEEPSEEK_KEY, {
        assessmentCode, l1RefCode, name, actualAge, gender,
        phenoAge, organAges: organAges5D, biomarkers, plaData
      });
    } catch(e) { console.log('Report gen error:', e.message); report = '（报告生成失败，请管理员手动触发）'; }

    // 5. 发送邮件通知（await 确保发送完成后再返回）
    let emailResult = 'skipped';
    if (EMAIL_AUTH_CODE) {
      const subject = buildEmailSubject({ name, phoneSuffix, l1RefCode, assessmentCode, phenoAge, actualAge });
      const body    = buildEmailBody({ assessmentCode, l1RefCode, name, phoneSuffix, actualAge, gender, phenoAge, organAges: organAges5D, biomarkers, report, plaData });
      try {
        await sendSmtpEmail163(ADMIN_EMAIL, EMAIL_AUTH_CODE, ADMIN_EMAIL, subject, body);
        emailResult = 'sent';
        console.log('Email sent OK');
      } catch(e) {
        emailResult = 'failed: ' + e.message;
        console.log('Email failed:', e.message);
      }
    }

    return okResp({ ok: true, dbSaved, hasReport: !!report, plaLinked: !!plaData, emailResult });
  }

  return errResp('Unknown mode: ' + mode);
};

// ─── CBA 6D 临床维度 → 5D 品牌展示维度映射 ───────────────────────────────────
// 前端 calculateCBAResults 输出 6 个临床维度；报告/邮件统一使用 5 个品牌维度
// 若已是 5D（含"代谢活力"键）则直接透传，兼容测试 payload
function mapCba6DTo5D(organAges) {
  if (!organAges) return null;
  if ('代谢活力' in organAges) return organAges;          // 已是 5D，直接返回
  const o = organAges;
  const renal   = o['肾脏功能'];
  const hepatic = o['肝脏功能'];
  // 器官储备 = 肾脏+肝脏均值；若仅有其一则以单值代入（不影响量级，仅降低精度）
  const organReserve = (renal != null && hepatic != null)
    ? Math.round((Number(renal) + Number(hepatic)) / 2)
    : (renal ?? hepatic ?? null);
  return {
    '代谢活力':   o['代谢健康'],
    '炎症免疫':   o['炎症状态'],
    '心血管韧性': o['心血管健康'],
    '神经睡眠':   o['血液健康'],   // 血液携氧能力 → 神经/睡眠功能
    '器官储备':   organReserve,    // 肾脏+肝脏功能均值
  };
}

// ─── PLA 7D 内部维度 → 5D 品牌展示维度映射 ──────────────────────────────────
// 与前端 src/lib/dimensionMapping.ts mapL1ToFivePillars() 保持一致
function mapPlaTo5D(dimensionScores) {
  if (!dimensionScores) return null;
  const d = dimensionScores;
  return {
    '代谢活力':   +(d['营养代谢'] || 0).toFixed(1),
    '炎症免疫':   +((d['身心平衡'] || 0) * 0.6 + (d['环境因素'] || 0) * 0.4).toFixed(1),
    '心血管韧性': +(d['运动能力'] || 0).toFixed(1),
    '神经睡眠':   +((d['睡眠质量'] || 0) * 0.7 + (d['感官衰老'] || 0) * 0.3).toFixed(1),
    '器官储备':   +(d['遗传因素'] || 0).toFixed(1),
  };
}

// ─── 腾讯云 OCR：图片 → 原始文字（TC3-HMAC-SHA256 手写签名，无 npm 依赖）─────────
// 签名规范：https://www.tencentcloud.com/document/product/845/32207
function tcSha256Hex(s) { return crypto.createHash('sha256').update(s, 'utf8').digest('hex'); }
function tcHmac(key, s)  { return crypto.createHmac('sha256', key).update(s, 'utf8').digest(); }

function ocrGeneralBasic(secretId, secretKey, imageBase64) {
  return new Promise((resolve, reject) => {
    const host = 'ocr.tencentcloudapi.com', service = 'ocr';
    const action = 'GeneralBasicOCR', version = '2018-11-19', region = 'ap-shanghai';
    const ts   = Math.floor(Date.now() / 1000);
    const date = new Date(ts * 1000).toISOString().slice(0, 10);   // UTC YYYY-MM-DD
    const payload = JSON.stringify({ ImageBase64: imageBase64 });

    const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${host}\n`;
    const signedHeaders    = 'content-type;host';
    const canonicalRequest = ['POST', '/', '', canonicalHeaders, signedHeaders, tcSha256Hex(payload)].join('\n');
    const credentialScope  = `${date}/${service}/tc3_request`;
    const stringToSign     = ['TC3-HMAC-SHA256', ts, credentialScope, tcSha256Hex(canonicalRequest)].join('\n');
    const kSigning  = tcHmac(tcHmac(tcHmac('TC3' + secretKey, date), service), 'tc3_request');
    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');
    const authorization = `TC3-HMAC-SHA256 Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const req = https.request({
      hostname: host, path: '/', method: 'POST',
      headers: {
        'Content-Type':  'application/json; charset=utf-8',
        'Host':          host,
        'X-TC-Action':   action,
        'X-TC-Version':  version,
        'X-TC-Timestamp': String(ts),
        'X-TC-Region':   region,
        'Authorization': authorization,
      },
    }, r => { let d = ''; r.on('data', c => d += c); r.on('end', () => resolve(d)); });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function ocrExtractText(secretId, secretKey, files) {
  let allText = '';
  for (const f of files.slice(0, 5)) {
    try {
      const resp = JSON.parse(await ocrGeneralBasic(secretId, secretKey, f.data));
      const dets = resp && resp.Response && resp.Response.TextDetections;
      if (Array.isArray(dets)) allText += dets.map(d => d.DetectedText).join('\n') + '\n';
      else if (resp && resp.Response && resp.Response.Error)
        console.log('OCR API error:', resp.Response.Error.Code, resp.Response.Error.Message);
    } catch (e) { console.log('OCR call failed:', e.message); }
  }
  return allText.trim();
}

// ─── 化验指标提取：腾讯云 OCR（图→文）+ DeepSeek（文→结构化 JSON）────────────────
// [CHANGE 2026-06-03] 原因：deepseek-chat 非视觉模型，截图从未真正解析（#2）；改为腾讯云 OCR 取文字、再用 DeepSeek 结构化 | 影响：CBA 截图指标提取
async function extractBiomarkersWithAI(deepseekKey, files) {
  const SECRET_ID  = process.env.TENCENT_SECRET_ID;
  const SECRET_KEY = process.env.TENCENT_SECRET_KEY;
  if (!SECRET_ID || !SECRET_KEY) { console.log('TENCENT_SECRET_ID/KEY 未配置，跳过 OCR'); return null; }

  const ocrText = await ocrExtractText(SECRET_ID, SECRET_KEY, files);
  if (!ocrText) { console.log('OCR 未识别出文字'); return null; }

  const prompt =
    `以下是体检报告截图经 OCR 识别出的原始文字，请从中提取生化指标数值，以 JSON 格式返回。\n` +
    `需要提取：albumin(g/L), creatinine(μmol/L), glucose(mmol/L), crp(mg/L), lymphPct(%), mcv(fL), rdw(%), alp(U/L), wbc(×10⁹/L), hemoglobin(g/L), platelets(×10⁹/L), alt(U/L), ast(U/L), ggt(U/L), hba1c(%), triglycerides(mmol/L), totalCholesterol(mmol/L), ldl(mmol/L), hdl(mmol/L), uricAcid(μmol/L), bun(mmol/L)\n` +
    `规则：只返回纯 JSON，找不到的填 null，数值保留原始精度；OCR 文字可能有错位/换行，请按指标名就近匹配数值。\n` +
    `JSON示例：{"albumin":42,"creatinine":85,"glucose":5.2}\n\nOCR原文：\n${ocrText}`;

  const reqBody = JSON.stringify({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: 800, temperature: 0.1,
  });
  try {
    const content = JSON.parse(await callDeepSeekRaw(deepseekKey, reqBody)).choices[0].message.content;
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const result = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== null && v !== undefined && !isNaN(Number(v))) result[k] = Number(v);
    }
    return result;
  } catch (e) { console.log('DeepSeek 结构化失败:', e.message); return null; }
}

// ─── DeepSeek 完整 CBA 报告生成（融合 PLA 数据）─────────────────────────────
async function generateCBAReport(key, { assessmentCode, l1RefCode, name, actualAge, gender, phenoAge, organAges, biomarkers, plaData }) {
  const genderStr  = gender === 'male' ? '男' : '女';
  const ageDiff    = actualAge - phenoAge;
  const diffStr    = ageDiff > 0 ? `比实际年龄年轻 ${ageDiff.toFixed(1)} 岁` : ageDiff < 0 ? `比实际年龄偏大 ${Math.abs(ageDiff).toFixed(1)} 岁` : '与实际年龄相当';
  // organAges already mapped to 5D by caller; use directly
  const organLines = organAges
    ? Object.entries(organAges).map(([dim, age]) => `${dim}: 器官年龄 ${age} 岁（差值 ${Number(age)-actualAge > 0 ? '+' : ''}${Number(age)-actualAge} 岁）`).join('\n')
    : '';
  const bioLines = biomarkers
    ? Object.entries(biomarkers).filter(([,v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join('  |  ')
    : '';

  // 构建 PLA 数据段（核心：双维度交叉分析指令）
  let plaSection = '';
  if (plaData) {
    const fiveDim = mapPlaTo5D(plaData.dimensionScores);
    const dimLines = fiveDim
      ? Object.entries(fiveDim).map(([k, v]) => `${k}:${v}分`).join('、')
      : '（无数据）';
    const plaAgeDiff = (plaData.age || 0) - (plaData.bioAge || 0);
    const plaStatus  = plaAgeDiff >= 8 ? '逆龄' : plaAgeDiff >= 3 ? '缓慢衰老' : plaAgeDiff >= -2 ? '正常衰老' : '加速衰老';
    plaSection =
      `\n\n【关联 L1 PLA 生活方式评估数据（编号 ${l1RefCode}）】\n` +
      `PLA生物年龄：${plaData.bioAge}岁（实际${plaData.age}岁，${plaAgeDiff > 0 ? '年轻' : '偏大'}${Math.abs(plaAgeDiff)}岁，${plaStatus}）\n` +
      `PLA总分：${plaData.score}分\n` +
      `五维生活方式得分：${dimLines}\n` +
      `衰老速度：${plaData.agingPace ? plaData.agingPace + 'x' : 'N/A'} | 同龄排名：${plaData.peerPercentile ? '前' + plaData.peerPercentile + '%' : 'N/A'}\n\n` +
      `⚡ 双维度交叉分析要求：\n` +
      `① 找出 CBA 异常生化指标与 PLA 低分维度之间的因果链（例：PLA睡眠质量低→CBA炎症指标CRP偏高）\n` +
      `② 识别 PLA 与 CBA 之间的"反差维度"（生活方式好但生化异常，或反之），解读其临床意义\n` +
      `③ 基于两套数据综合判断，优先干预哪个维度ROI最高（同时改善生活方式+生化指标）\n` +
      `④ 在报告结尾明确总结：CBA与PLA的交叉发现，让评估结论比单独任一评估更精准`;
  } else if (l1RefCode) {
    plaSection = `\n注：此用户已完成 L1 PLA 评估（编号 ${l1RefCode}），未能获取详细数据，请在报告中说明双维度评估的互补价值。`;
  }

  const prompt =
    `你是一位专业的抗衰老临床医生。请根据以下 CBA（临床生化生物年龄）评估数据，为用户生成一份完整的器官级生物年龄分析报告（约750字）。${plaSection}\n\n` +
    `用户信息：${name || '用户'}，${actualAge}岁，${genderStr}\n` +
    `PhenoAge 生物年龄：${phenoAge}岁（${diffStr}）\n` +
    `5维器官年龄：\n${organLines}\n` +
    `关键生化指标：${bioLines}\n\n` +
    `报告必须包含以下5个部分，每部分使用加粗标题：\n\n` +
    `1. **核心发现**：PhenoAge 与实际年龄差距解读，整体衰老状态评级\n\n` +
    `2. **5维器官年龄深度分析**：逐一解读每个品牌维度（代谢活力/炎症免疫/心血管韧性/神经睡眠/器官储备），分析关键指标临床意义\n\n` +
    `3. **衰老速度与同龄排名**：与同龄人群对比，通俗表达百分位意义\n\n` +
    `4. **优先干预路径**（ROI从高到低）：3个干预维度，每个给出2条具体建议${plaData ? '；若PLA数据印证了某项风险，需明确说明' : ''}\n\n` +
    `5. **3/6/12个月复查计划**：分阶段复查指标与节点${plaData ? '\n\n6. **PLA×CBA 双维度交叉洞察**：基于两套数据得出的综合结论，说明互相印证或反差之处，以及比单独评估更精准的具体发现' : ''}\n\n` +
    `语言：简体中文，专业权威，温暖可读，避免使用"AI"、"算法"等词。`;

  // [CHANGE 2026-05-31] 改用 callDeepSeekWithReasoning 注入 CLINICAL_REASONING_SYSTEM
  return await callDeepSeekWithReasoning(key, CLINICAL_REASONING_SYSTEM, prompt, 2000);
}

// ─── 邮件主题构建 ─────────────────────────────────────────────────────────────
function buildEmailSubject({ name, phoneSuffix, l1RefCode, assessmentCode, phenoAge, actualAge }) {
  const tag = l1RefCode ? `[联动 ${l1RefCode}]` : '[独立CBA]';
  return `【CBA报告】${name || '新用户'} | 尾号${phoneSuffix} | ${tag} | 生物年龄${phenoAge}岁 vs ${actualAge}岁`.slice(0, 70);
}

// ─── 邮件内容构建（含 PLA 融合摘要）────────────────────────────────────────────
function buildEmailBody({ assessmentCode, l1RefCode, name, phoneSuffix, actualAge, gender, phenoAge, organAges, biomarkers, report, plaData }) {
  const genderStr  = gender === 'male' ? '男' : '女';
  // organAges already mapped to 5D by caller; use directly
  const organLines = organAges
    ? Object.entries(organAges).map(([dim, age]) => `  ${dim}：${age}岁（${Number(age)-actualAge > 0 ? '+' : ''}${Number(age)-actualAge}岁）`).join('\n')
    : '  （无数据）';
  const bioLines = biomarkers
    ? Object.entries(biomarkers).filter(([,v]) => v !== null).map(([k, v]) => `  ${k}: ${v}`).join('\n')
    : '  （无数据）';

  // PLA 摘要段（邮件中显示）
  let plaBlock = '';
  if (plaData) {
    const fiveDim = mapPlaTo5D(plaData.dimensionScores);
    const dimLines = fiveDim
      ? Object.entries(fiveDim).map(([k, v]) => `  ${k}：${v}分`).join('\n')
      : '  （无数据）';
    plaBlock = `\n📋 关联 L1 PLA 数据（已融入报告）\n---------------------------------\nPLA生物年龄：${plaData.bioAge}岁（实际${plaData.age}岁）\nPLA总分：${plaData.score}分\n五维生活方式得分：\n${dimLines}\n`;
  } else if (l1RefCode) {
    plaBlock = `\n📋 L1 PLA 数据：编号 ${l1RefCode}，未能从数据库获取详情\n`;
  }

  return `============================
【BioAge Compass】CBA 临床生化报告请求
============================

📋 用户信息
-----------
CBA评估码：${assessmentCode}
L1联动编号：${l1RefCode || '无（独立用户）'}
姓名：${name || '未知'}
年龄：${actualAge}岁  性别：${genderStr}
手机尾号：${phoneSuffix}
提交时间：${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}

📊 CBA 评估结果
--------------
PhenoAge 生物年龄：${phenoAge}岁
实际年龄：${actualAge}岁
差值：${(actualAge - phenoAge) > 0 ? '年轻' : '偏大'}${Math.abs(actualAge - phenoAge).toFixed(1)}岁

5维器官年龄：
${organLines}

关键生化指标（⚠️ AI 提取，请陆医生对照用户微信发来的原始化验截图逐项复核）：
${bioLines}
${plaBlock}
📄 AI 完整 CBA 报告（${plaData ? '已融合PLA双维度分析' : '独立CBA分析'}）
-------------------
${report}

============================
⚡ 操作指引
${l1RefCode
  ? `✅ 联动用户：查找微信中 L1编号 ${l1RefCode} 对应的联系人，手机尾号 ${phoneSuffix} 核验，发送报告。${plaData ? '\n   ℹ️  报告已融合该用户PLA数据，包含双维度交叉分析。' : '\n   ⚠️  未能获取PLA详情，报告为标准CBA分析。'}`
  : `🆕 独立用户：等待对方添加微信（手机尾号 ${phoneSuffix}），接受好友后发送报告。`}
============================`;
}

// ─── DeepSeek 文本 API 调用 ───────────────────────────────────────────────────
function callDeepSeek(key, prompt, maxTokens) {
  const reqBody = JSON.stringify({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens, temperature: 0.7,
  });
  return callDeepSeekRaw(key, reqBody).then(body => JSON.parse(body).choices[0].message.content);
}

// [CHANGE 2026-05-31] 新增：带 system message 的 DeepSeek 调用（用于注入临床推理框架）
function callDeepSeekWithReasoning(key, systemContent, userPrompt, maxTokens) {
  const reqBody = JSON.stringify({
    model: 'deepseek-chat',
    messages: [
      { role: 'system', content: systemContent },
      { role: 'user',   content: userPrompt },
    ],
    max_tokens: maxTokens, temperature: 0.7,
  });
  return callDeepSeekRaw(key, reqBody).then(body => JSON.parse(body).choices[0].message.content);
}

function callDeepSeekRaw(key, reqBody) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key, 'Content-Length': Buffer.byteLength(reqBody) },
    }, res => {
      let body = '';
      res.on('data', c => body += c);
      res.on('end', () => resolve(body));
    });
    req.on('error', reject);
    req.write(reqBody); req.end();
  });
}

// ─── 163 SMTP 直连发送邮件 ────────────────────────────────────────────────────
function sendSmtpEmail163(fromEmail, authCode, toEmail, subject, textBody) {
  return new Promise((resolve, reject) => {
    const b64 = s => Buffer.from(s, 'utf8').toString('base64');
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
        if (line.length < 3 || line[3] === '-') continue;
        const code = parseInt(line.substring(0, 3));
        if (code >= 400) { finish(new Error(`SMTP ${code}: ${line}`)); return; }
        switch (state) {
          case 'GREETING':  if (code === 220) { socket.write('EHLO bioage-cba\r\n'); state = 'EHLO'; } break;
          case 'EHLO':      if (code === 250) { socket.write('AUTH LOGIN\r\n'); state = 'AUTH_INIT'; } break;
          case 'AUTH_INIT': if (code === 334) { socket.write(b64(fromEmail)+'\r\n'); state = 'AUTH_USER'; } break;
          case 'AUTH_USER': if (code === 334) { socket.write(b64(authCode)+'\r\n'); state = 'AUTH_PASS'; } break;
          case 'AUTH_PASS':
            if (code === 235) { socket.write(`MAIL FROM:<${fromEmail}>\r\n`); state = 'MAIL_FROM'; }
            else finish(new Error('Auth failed: ' + line));
            break;
          case 'MAIL_FROM': if (code === 250) { socket.write(`RCPT TO:<${toEmail}>\r\n`); state = 'RCPT_TO'; } break;
          case 'RCPT_TO':   if (code === 250) { socket.write('DATA\r\n'); state = 'DATA_CMD'; } break;
          case 'DATA_CMD':
            if (code === 354) {
              const msg =
                `From: BioAge CBA <${fromEmail}>\r\n` +
                `To: ${toEmail}\r\n` +
                `Subject: =?utf-8?B?${b64(subject)}?=\r\n` +
                `MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n` +
                textBody.replace(/\r\n\.\r\n/g, '\r\n..\r\n') + '\r\n.';
              socket.write(msg + '\r\n'); state = 'DATA_SENT';
            }
            break;
          case 'DATA_SENT': if (code === 250) { socket.write('QUIT\r\n'); state = 'QUIT'; } break;
          case 'QUIT':      finish(null); break;
        }
      }
    });
    socket.on('error', finish);
    socket.on('close', () => finish(null));
    setTimeout(() => finish(new Error('SMTP timeout')), 25000);
  });
}

// ─── 响应辅助 ─────────────────────────────────────────────────────────────────
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const okResp  = d => ({ statusCode: 200, headers, body: JSON.stringify({ code: 0, ...d }) });
const errResp = m => ({ statusCode: 200, headers, body: JSON.stringify({ code: -1, message: m }) });
