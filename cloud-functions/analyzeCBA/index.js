// [CHANGE 2026-03-23] 原因：CBA 云函数，负责 AI 指标提取 + 报告生成 + 邮件通知 | 影响范围：cloud-functions/analyzeCBA/index.js（新建）
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

  // ── 模式2：提交处理（保存 DB + 生成报告 + 邮件通知）───────────────────────
  if (mode === 'cba_submit') {
    const {
      assessmentCode, l1RefCode, name, phoneSuffix,
      actualAge, gender, phenoAge, organAges, biomarkers, submittedAt
    } = data;

    // 1. 保存到 cba_submissions 集合
    let dbSaved = false;
    try {
      const tcb = (() => { try { return require('@cloudbase/node-sdk'); } catch(e) { return null; } })();
      if (tcb) {
        const app = tcb.init({ env: ENV_ID });
        await app.database().collection('cba_submissions').add({
          assessmentCode, l1RefCode: l1RefCode || null,
          name: name || null, phoneSuffix,
          actualAge, gender, phenoAge,
          organAges: organAges || {}, biomarkers: biomarkers || {},
          paymentStatus: 'pending_verification',
          reportGenerated: false,
          createdAt: submittedAt || new Date().toISOString(),
        });
        dbSaved = true;
      }
    } catch(e) { console.log('DB save error:', e.message); }

    // 2. 生成 DeepSeek 完整报告（若提交时同步触发）
    let report = '';
    try {
      report = await generateCBAReport(DEEPSEEK_KEY, {
        assessmentCode, l1RefCode, name, actualAge, gender,
        phenoAge, organAges, biomarkers
      });
    } catch(e) { console.log('Report gen error:', e.message); report = '（报告生成失败，请管理员手动触发）'; }

    // 3. 发送邮件通知管理员（fire-and-forget）
    if (EMAIL_AUTH_CODE) {
      const subject = buildEmailSubject({ name, phoneSuffix, l1RefCode, assessmentCode, phenoAge, actualAge });
      const body    = buildEmailBody({ assessmentCode, l1RefCode, name, phoneSuffix, actualAge, gender, phenoAge, organAges, biomarkers, report });
      sendSmtpEmail163(ADMIN_EMAIL, EMAIL_AUTH_CODE, ADMIN_EMAIL, subject, body)
        .then(() => console.log('Email sent OK'))
        .catch(e => console.log('Email failed:', e.message));
    }

    return okResp({ ok: true, dbSaved, hasReport: !!report });
  }

  return errResp('Unknown mode: ' + mode);
};

// ─── DeepSeek Vision：从 base64 图片提取生化指标 ─────────────────────────────
async function extractBiomarkersWithAI(key, files) {
  // 构建多图提示
  const imageContents = files.slice(0, 10).map(f => ({
    type:      'image_url',
    image_url: { url: `data:${f.type};base64,${f.data}` },
  }));

  const textPrompt = {
    type: 'text',
    text: `请从以下体检报告图片中提取生化指标数值，以 JSON 格式返回。

需要提取的指标（使用中国临床单位）：
- albumin: 白蛋白 (g/L)
- creatinine: 肌酐 (μmol/L)
- glucose: 空腹血糖 (mmol/L)
- crp: 超敏C反应蛋白 (mg/L)
- lymphPct: 淋巴细胞百分比 (%)
- mcv: 红细胞平均体积 MCV (fL)
- rdw: 红细胞分布宽度 RDW (%)
- alp: 碱性磷酸酶 ALP (U/L)
- wbc: 白细胞计数 (×10⁹/L)
- hemoglobin: 血红蛋白 (g/L) [选填]
- platelets: 血小板 (×10⁹/L) [选填]
- alt: 谷丙转氨酶 ALT (U/L) [选填]
- ast: 谷草转氨酶 AST (U/L) [选填]
- ggt: 谷氨酰转肽酶 GGT (U/L) [选填]
- hba1c: 糖化血红蛋白 (%) [选填]
- triglycerides: 甘油三酯 (mmol/L) [选填]
- totalCholesterol: 总胆固醇 (mmol/L) [选填]
- ldl: 低密度脂蛋白 LDL (mmol/L) [选填]
- hdl: 高密度脂蛋白 HDL (mmol/L) [选填]
- uricAcid: 尿酸 (μmol/L) [选填]
- bun: 尿素氮 BUN (mmol/L) [选填]

规则：
1. 只返回纯 JSON，无其他文字
2. 找不到的字段填 null
3. 数值保留原始报告精度
4. 注意单位换算：若报告单位与上述不同请转换后输出

JSON 格式示例：
{"albumin":42,"creatinine":85,"glucose":5.2,"crp":1.2,"lymphPct":32,"mcv":88,"rdw":13.5,"alp":65,"wbc":5.8}`
  };

  const reqBody = JSON.stringify({
    model:      'deepseek-chat',
    messages: [{ role: 'user', content: [textPrompt, ...imageContents] }],
    max_tokens: 800,
    temperature: 0.1,
  });

  try {
    const response = await callDeepSeekRaw(key, reqBody);
    const content  = JSON.parse(response).choices[0].message.content;
    // 提取 JSON（可能有 markdown 包裹）
    const match = content.match(/\{[\s\S]*\}/);
    if (!match) return null;
    const parsed = JSON.parse(match[0]);
    // 过滤掉 null 值
    const result = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (v !== null && v !== undefined && !isNaN(Number(v))) {
        result[k] = Number(v);
      }
    }
    return result;
  } catch(e) {
    console.log('Vision extract failed:', e.message);
    return null;
  }
}

// ─── DeepSeek 完整 CBA 报告生成 ──────────────────────────────────────────────
async function generateCBAReport(key, { assessmentCode, l1RefCode, name, actualAge, gender, phenoAge, organAges, biomarkers }) {
  const genderStr  = gender === 'male' ? '男' : '女';
  const ageDiff    = actualAge - phenoAge;
  const diffStr    = ageDiff > 0 ? `比实际年龄年轻 ${ageDiff.toFixed(1)} 岁` : ageDiff < 0 ? `比实际年龄偏大 ${Math.abs(ageDiff).toFixed(1)} 岁` : '与实际年龄相当';
  const organLines = organAges
    ? Object.entries(organAges).map(([dim, age]) => `${dim}: 器官年龄 ${age} 岁（差值 ${Number(age) - actualAge > 0 ? '+' : ''}${Number(age) - actualAge} 岁）`).join('\n')
    : '';
  const bioLines   = biomarkers
    ? Object.entries(biomarkers).filter(([,v]) => v !== null).map(([k, v]) => `${k}: ${v}`).join('  |  ')
    : '';
  const linkedNote = l1RefCode ? `\n注：此用户已完成 L1 PLA 评估（编号 ${l1RefCode}），请在报告中结合生活方式因素进行综合解读。` : '';

  const prompt =
    `你是一位专业的抗衰老临床医生。请根据以下 CBA（临床生化生物年龄）评估数据，为用户生成一份完整的器官级生物年龄分析报告（约700字）。${linkedNote}\n\n` +
    `用户信息：${name || '用户'}，${actualAge}岁，${genderStr}\n` +
    `PhenoAge 生物年龄：${phenoAge}岁（${diffStr}）\n` +
    `6维器官年龄：\n${organLines}\n` +
    `关键生化指标：${bioLines}\n\n` +
    `报告必须包含以下5个部分，每部分使用加粗标题：\n\n` +
    `1. **核心发现**：PhenoAge 生物年龄与实际年龄的差距解读，整体衰老状态评级\n\n` +
    `2. **6维器官年龄深度分析**：逐一解读每个维度器官年龄，分析关键指标的临床意义，指出最需关注和最具优势的维度\n\n` +
    `3. **衰老速度与同龄排名**：将用户与同龄人群对比，用通俗语言表达百分位排名意义\n\n` +
    `4. **优先干预路径**（按 ROI 从高到低排列）：选出3个干预效果最显著的维度，每个维度给出2条具体可执行的改善建议\n\n` +
    `5. **3/6/12个月复查计划**：建议分阶段复查的指标和评估节点\n\n` +
    `语言：简体中文，专业权威，温暖可读，不超过750字。避免使用"AI"、"算法"等词。`;

  const report = await callDeepSeek(key, prompt, 1800);
  return report;
}

// ─── 邮件内容构建 ─────────────────────────────────────────────────────────────
function buildEmailSubject({ name, phoneSuffix, l1RefCode, assessmentCode, phenoAge, actualAge }) {
  const tag = l1RefCode ? `[联动 ${l1RefCode}]` : '[独立CBA]';
  return `【CBA报告】${name || '新用户'} | 尾号${phoneSuffix} | ${tag} | 生物年龄${phenoAge}岁 vs ${actualAge}岁`.slice(0, 70);
}

function buildEmailBody({ assessmentCode, l1RefCode, name, phoneSuffix, actualAge, gender, phenoAge, organAges, biomarkers, report }) {
  const genderStr = gender === 'male' ? '男' : '女';
  const organLines = organAges
    ? Object.entries(organAges).map(([dim, age]) => `  ${dim}：${age}岁（${Number(age) - actualAge > 0 ? '+' : ''}${Number(age) - actualAge}岁）`).join('\n')
    : '  （无数据）';
  const bioLines = biomarkers
    ? Object.entries(biomarkers).filter(([,v]) => v !== null)
        .map(([k, v]) => `  ${k}: ${v}`).join('\n')
    : '  （无数据）';

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

📄 AI 完整 CBA 报告
-------------------
${report}

============================
⚡ 操作指引
${l1RefCode
  ? `✅ 联动用户：查找微信中 L1编号 ${l1RefCode} 对应的联系人，手机尾号 ${phoneSuffix} 核验，发送报告。`
  : `🆕 独立用户：等待对方添加微信（手机尾号 ${phoneSuffix}），接受好友后发送报告。`}
============================`;
}

// ─── DeepSeek 文本 API 调用 ───────────────────────────────────────────────────
function callDeepSeek(key, prompt, maxTokens) {
  const reqBody = JSON.stringify({
    model:    'deepseek-chat',
    messages: [{ role: 'user', content: prompt }],
    max_tokens: maxTokens, temperature: 0.7,
  });
  return callDeepSeekRaw(key, reqBody).then(body => {
    const parsed = JSON.parse(body);
    return parsed.choices[0].message.content;
  });
}

function callDeepSeekRaw(key, reqBody) {
  return new Promise((resolve, reject) => {
    const req = https.request({
      hostname: 'api.deepseek.com', path: '/chat/completions', method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
        'Content-Length': Buffer.byteLength(reqBody),
      },
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
          case 'GREETING':   if (code === 220) { socket.write('EHLO bioage-cba\r\n'); state = 'EHLO'; } break;
          case 'EHLO':       if (code === 250) { socket.write('AUTH LOGIN\r\n'); state = 'AUTH_INIT'; } break;
          case 'AUTH_INIT':  if (code === 334) { socket.write(b64(fromEmail)+'\r\n'); state = 'AUTH_USER'; } break;
          case 'AUTH_USER':  if (code === 334) { socket.write(b64(authCode)+'\r\n'); state = 'AUTH_PASS'; } break;
          case 'AUTH_PASS':
            if (code === 235) { socket.write(`MAIL FROM:<${fromEmail}>\r\n`); state = 'MAIL_FROM'; }
            else finish(new Error('Auth failed: ' + line));
            break;
          case 'MAIL_FROM':  if (code === 250) { socket.write(`RCPT TO:<${toEmail}>\r\n`); state = 'RCPT_TO'; } break;
          case 'RCPT_TO':    if (code === 250) { socket.write('DATA\r\n'); state = 'DATA_CMD'; } break;
          case 'DATA_CMD':
            if (code === 354) {
              const msg =
                `From: BioAge CBA <${fromEmail}>\r\n` +
                `To: ${toEmail}\r\n` +
                `Subject: =?utf-8?B?${b64(subject)}?=\r\n` +
                `MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n` +
                textBody.replace(/\r\n\.\r\n/g, '\r\n..\r\n') + '\r\n.';
              socket.write(msg + '\r\n');
              state = 'DATA_SENT';
            }
            break;
          case 'DATA_SENT':  if (code === 250) { socket.write('QUIT\r\n'); state = 'QUIT'; } break;
          case 'QUIT':       finish(null); break;
        }
      }
    });

    socket.on('error', finish);
    socket.on('close', () => finish(null));
    setTimeout(() => { console.log('SMTP timeout'); finish(null); }, 25000);
  });
}

// ─── 响应辅助 ─────────────────────────────────────────────────────────────────
const headers = { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' };
const okResp  = d => ({ statusCode: 200, headers, body: JSON.stringify({ code: 0, ...d }) });
const errResp = m => ({ statusCode: 200, headers, body: JSON.stringify({ code: -1, message: m }) });
