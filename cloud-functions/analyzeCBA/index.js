// [CHANGE 2026-03-23] 原因：CBA 云函数，负责 AI 指标提取 + 报告生成 + 邮件通知 | 影响范围：cloud-functions/analyzeCBA/index.js（新建）
// [CHANGE 2026-03-27] 原因：await SMTP 修复邮件静默丢失 | 影响范围：cloud-functions/analyzeCBA/index.js
// [CHANGE 2026-03-27] 原因：融合 PLA 数据实现双维度交叉分析 | 影响范围：cloud-functions/analyzeCBA/index.js
// [CHANGE 2026-03-28] 原因：PLA 维度统一使用5维品牌展示层（7D内部→5D映射），修复DB保存逻辑 | 影响范围：cloud-functions/analyzeCBA/index.js
// [CHANGE 2026-03-28] 原因：修复PLA数据查询——去除显式凭证覆盖、改用command.eq()、增加report_submissions回退 | 影响范围：cloud-functions/analyzeCBA/index.js
// Node.js 18 · 部署于 CloudBase 环境 bioage-compass-prod-9chaf35e573d
const https = require('https');
const tls   = require('tls');

const ADMIN_EMAIL = '13816746212@163.com';
const ENV_ID      = 'bioage-compass-prod-9chaf35e573d';

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
      assessmentCode, l1RefCode, l1PlaData, name, phoneSuffix,
      actualAge, gender, phenoAge, organAges, biomarkers, submittedAt
    } = data;

    // 初始化 TCB SDK（云函数内置身份，不传显式凭证避免覆盖）
    let tcbApp = null;
    try {
      const tcb = require('@cloudbase/node-sdk');
      tcbApp = tcb.init({ env: ENV_ID });
      console.log('TCB SDK initialized OK');
    } catch(e) { console.log('TCB SDK not available:', e.message); }

    // 1. 保存到 cba_submissions 集合（SDK → HTTP fallback）
    let dbSaved = false;
    const cbaRecord = {
      assessmentCode, l1RefCode: l1RefCode || null,
      name: name || null, phoneSuffix,
      actualAge, gender, phenoAge,
      organAges: organAges || {}, biomarkers: biomarkers || {},
      paymentStatus: 'pending_verification',
      reportGenerated: false,
      createdAt: submittedAt || new Date().toISOString(),
    };
    if (tcbApp) {
      try {
        await tcbApp.database().collection('cba_submissions').add(cbaRecord);
        dbSaved = true;
        console.log('CBA saved to DB via SDK');
      } catch(e) { console.log('SDK DB save error:', e.message); }
    }
    // HTTP fallback（与 generateReport 降级策略一致）
    if (!dbSaved) {
      try {
        const fbBody = JSON.stringify({ _type: 'cba_submit', _collection: 'cba_submissions', ...cbaRecord });
        await new Promise((res, rej) => {
          const req = https.request({
            hostname: `${ENV_ID}-1405252881.ap-shanghai.app.tcloudbase.com`,
            path: '/saveAssessment', method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(fbBody) },
          }, r => { let d=''; r.on('data',c=>d+=c); r.on('end',()=>res(d)); });
          req.on('error', rej); req.write(fbBody); req.end();
        });
        dbSaved = true;
        console.log('CBA saved via HTTP fallback');
      } catch(e) { console.log('HTTP fallback DB error:', e.message); }
    }

    // 2. 获取关联 PLA 数据
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

    // 3. 生成 DeepSeek 完整报告（融合 PLA 数据）
    let report = '';
    try {
      report = await generateCBAReport(DEEPSEEK_KEY, {
        assessmentCode, l1RefCode, name, actualAge, gender,
        phenoAge, organAges, biomarkers, plaData
      });
    } catch(e) { console.log('Report gen error:', e.message); report = '（报告生成失败，请管理员手动触发）'; }

    // 4. 发送邮件通知（await 确保发送完成后再返回）
    let emailResult = 'skipped';
    if (EMAIL_AUTH_CODE) {
      const subject = buildEmailSubject({ name, phoneSuffix, l1RefCode, assessmentCode, phenoAge, actualAge });
      const body    = buildEmailBody({ assessmentCode, l1RefCode, name, phoneSuffix, actualAge, gender, phenoAge, organAges, biomarkers, report, plaData });
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

// ─── DeepSeek Vision：从 base64 图片提取生化指标 ─────────────────────────────
async function extractBiomarkersWithAI(key, files) {
  const imageContents = files.slice(0, 10).map(f => ({
    type: 'image_url',
    image_url: { url: `data:${f.type};base64,${f.data}` },
  }));
  const textPrompt = {
    type: 'text',
    text: `请从以下体检报告图片中提取生化指标数值，以 JSON 格式返回。\n需要提取：albumin(g/L), creatinine(μmol/L), glucose(mmol/L), crp(mg/L), lymphPct(%), mcv(fL), rdw(%), alp(U/L), wbc(×10⁹/L), hemoglobin(g/L), platelets(×10⁹/L), alt(U/L), ast(U/L), ggt(U/L), hba1c(%), triglycerides(mmol/L), totalCholesterol(mmol/L), ldl(mmol/L), hdl(mmol/L), uricAcid(μmol/L), bun(mmol/L)\n规则：只返回纯 JSON，找不到的填 null，数值保留原始精度。\nJSON示例：{"albumin":42,"creatinine":85,"glucose":5.2}`
  };
  const reqBody = JSON.stringify({
    model: 'deepseek-chat',
    messages: [{ role: 'user', content: [textPrompt, ...imageContents] }],
    max_tokens: 800, temperature: 0.1,
  });
  try {
    const response = await callDeepSeekRaw(key, reqBody);
    const content  = JSON.parse(response).choices[0].message.content;
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    const result = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== null && v !== undefined && !isNaN(Number(v))) result[k] = Number(v);
    }
    return result;
  } catch(e) { console.log('Vision extract failed:', e.message); return null; }
}

// ─── DeepSeek 完整 CBA 报告生成（融合 PLA 数据）─────────────────────────────
async function generateCBAReport(key, { assessmentCode, l1RefCode, name, actualAge, gender, phenoAge, organAges, biomarkers, plaData }) {
  const genderStr  = gender === 'male' ? '男' : '女';
  const ageDiff    = actualAge - phenoAge;
  const diffStr    = ageDiff > 0 ? `比实际年龄年轻 ${ageDiff.toFixed(1)} 岁` : ageDiff < 0 ? `比实际年龄偏大 ${Math.abs(ageDiff).toFixed(1)} 岁` : '与实际年龄相当';
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
    `6维器官年龄：\n${organLines}\n` +
    `关键生化指标：${bioLines}\n\n` +
    `报告必须包含以下5个部分，每部分使用加粗标题：\n\n` +
    `1. **核心发现**：PhenoAge 与实际年龄差距解读，整体衰老状态评级\n\n` +
    `2. **6维器官年龄深度分析**：逐一解读每个维度，分析关键指标临床意义\n\n` +
    `3. **衰老速度与同龄排名**：与同龄人群对比，通俗表达百分位意义\n\n` +
    `4. **优先干预路径**（ROI从高到低）：3个干预维度，每个给出2条具体建议${plaData ? '；若PLA数据印证了某项风险，需明确说明' : ''}\n\n` +
    `5. **3/6/12个月复查计划**：分阶段复查指标与节点${plaData ? '\n\n6. **PLA×CBA 双维度交叉洞察**：基于两套数据得出的综合结论，说明互相印证或反差之处，以及比单独评估更精准的具体发现' : ''}\n\n` +
    `语言：简体中文，专业权威，温暖可读，避免使用"AI"、"算法"等词。`;

  return await callDeepSeek(key, prompt, 2000);
}

// ─── 邮件主题构建 ─────────────────────────────────────────────────────────────
function buildEmailSubject({ name, phoneSuffix, l1RefCode, assessmentCode, phenoAge, actualAge }) {
  const tag = l1RefCode ? `[联动 ${l1RefCode}]` : '[独立CBA]';
  return `【CBA报告】${name || '新用户'} | 尾号${phoneSuffix} | ${tag} | 生物年龄${phenoAge}岁 vs ${actualAge}岁`.slice(0, 70);
}

// ─── 邮件内容构建（含 PLA 融合摘要）────────────────────────────────────────────
function buildEmailBody({ assessmentCode, l1RefCode, name, phoneSuffix, actualAge, gender, phenoAge, organAges, biomarkers, report, plaData }) {
  const genderStr  = gender === 'male' ? '男' : '女';
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

6维器官年龄：
${organLines}

关键生化指标：
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
