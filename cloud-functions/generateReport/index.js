const https = require('https');
const tls   = require('tls');

const ENDPOINT = 'https://bioage-compass-prod-9chaf35e573d-1405252881.ap-shanghai.app.tcloudbase.com';
const ADMIN_EMAIL = '13816746212@163.com';

exports.main = async (event, context) => {
  let data = {};
  try {
    let bodyStr = event.body || '';
    if (event.isBase64Encoded && bodyStr)
      bodyStr = Buffer.from(bodyStr, 'base64').toString('utf8');
    if (bodyStr) data = JSON.parse(bodyStr);
  } catch(e) {}

  const { name, age, gender, bioAge, score, dimensionScores, mode, contact } = data;
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
     #`生物年龄：${bioAge}岁，PLA评分：${score}分\n维度得分：${dimText}\n\n` +
      `要求：\n` +
     #`第1-2句：核心结论（生物年龄与实际年龄对比、整体状态）\n` +
      `第3句：最关键的优势或待改善点（具体维度）\n` +
      `第4句：推荐进行CBA（精准生物年龄）深度评估，说明其与PLA互补的价值\n` +
      `格式：纯文字，温暖专业，无标题，无换行符。`;

    const summary = await callDeepSeek(DEEPSEEK_KEY, prompt, 350);
    return okResp({ summary });
  }

  // ─── 模式2：完整报告 + 保存DB + 发邮件通知 ────────────────────────────────
  const prompt =
    `你是一位专业的抗衰老健康顾问。请根据以下PLA评估数据，为用户生成一份完整PLA逆龄密码报告（约700字）。\n\n` +
    `用户信息：\n- 姓名：${name||'用户'}\n- 年龄：${age}岁\n` +
    `- 性别：${gender==='male'?'男':'女'}\n- 生物年龄：${bioAge}岁\n` +
    `- PLA评分：${score}分\n- 各维度得分：${dimText}\n\n` +
    `报告必须包含以下5个部分：\n` +
    `1. **深度六维分析**：逐一解读六个维度（运动能力、身心平衡、营养代谢、睡眠质量、遗传因素、环境因素）的得分含义及各自具体改善路径\n` +
    `2. **可逆性分析**：指出哪些维度的投入产出比最高（即最容易通过干预获得改善的维度），给出优先级排序与原因\n` +
    `3. **3/6/12个月行动计划**：分三个阶段列出可执行的具体行动，每阶段2-3条，循序渐进\n` +
    `4. **对标分析**：基于同龄人群健康数据，说明用户在各核心维度上的相对位置（领先/持平/待改善），帮助用户了解自己所处的健康层级\n` +
    `5. **趋势预测**：基于当前各维度状态，推演若保持现状与积极干预两种情景下未来3-5年的健康轨迹，给出明确建议\n\n` +
    `报告要专业、温暖、具体，语言流畅自然，每部分使用加粗标题。`;

  const report = await callDeepSeek(DEEPSEEK_KEY, prompt, 1500);

  // 保存到 CloudBase 数据库
  try {
    const tcb = require('@cloudbase/node-sdk');
    const app = tcb.init({ env: process.env.TCB_ENV_ID || 'bioage-compass-prod-9chaf35e573d' });
    await app.database().collection('report_submissions').add({
      name: name||'', age: age||0, gender: gender||'',
      bioAge: bioAge||0, score: score||0,
      dimensionScores: dimensionScores||{},
      contact: contact||'', report,
      createdAt: new Date().toISOString(), status: 'pending'
    });
    console.log('Saved to DB');
  } catch(e) { console.log('DB error:', e.message); }

  // 发邮件通知（异步，不阻塞响应）
  if (EMAIL_AUTH_CODE) {
    const ageDiff = age - bioAge;
    const diffStr = ageDiff > 0 ? `年轻${ageDiff}岁 🎉` : ageDiff < 0 ? `偏大${Math.abs(ageDiff)}岁` : '相当';
    const subject = `【新报告请求】${name||'新客户'} | ${contact||'未留联系'} | PLA ${score}分`;
    const body =
`============================
【BioAge Compass】新客户报告请求
============================

📋 客户信息
-----------
姓名：${name||'未知'}
年龄：${age}岁
性别：${gender==='male'?'男':'女'}
联系方式：${contact||'未留联系方式'}
提交时间：${new Date().toLocaleString('zh-CN',{timeZone:'Asia/Shanghai'})}

📊 PLA评估结果
--------------
实际年龄：${age}岁
生物年龄：${bioAge}岁（${diffStr}）
PLA总分：${score}分
各维度：${dimText}

📄 AI完整评估报告
-----------------
${report}

============================
⚡ 请通过微信1V1发送完整报告给该客户
============================`;

    sendSmtpEmail163(ADMIN_EMAIL, EMAIL_AUTH_CODE, ADMIN_EMAIL, subject, body)
      .then(() => console.log('Email sent OK'))
      .catch(e => console.log('Email failed:', e.message));
  } else {
    console.log('EMAIL_163_AUTH_CODE not set, skipping email');
  }

  return okResp({ report, saved: true });
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

// ─── 163 SMTP 直连（无需 npm） ─────────────────────────────────────────────────
function sendSmtpEmail163(fromEmail, authCode, toEmail, subject, textBody) {
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
              const msg =
                `From: BioAge Compass <${fromEmail}>\r\n` +
                `To: ${toEmail}\r\n` +
                `Subject: =?utf-8?B?${b64(subject)}?=\r\n` +
                `MIME-Version: 1.0\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n` +
                textBody.replace(/\r\n\.\r\n/g,'\r\n..\r\n') + '\r\n.';
              socket.write(msg + '\r\n');
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
    setTimeout(() => { console.log('SMTP timeout'); finish(null); }, 25000);
  });
}

// ─── 响应辅助 ─────────────────────────────────────────────────────────────────
const headers = { 'Content-Type':'application/json','Access-Control-Allow-Origin':'*' };
const okResp  = d => ({ statusCode:200, headers, body: JSON.stringify({code:0,...d}) });
const errResp = m => ({ statusCode:200, headers, body: JSON.stringify({code:-1,message:m}) });
