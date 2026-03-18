import { NextRequest, NextResponse } from "next/server";

const DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions";
const DEEPSEEK_MODEL   = "deepseek-chat";

function buildPrompt(data: {
  name: string;
  age: number;
  gender: string;
  bioAge: number;
  score: number;
  dimensionScores: Record<string, number>;
  assessmentCode?: string;
}): string {
  const { name, age, gender, bioAge, score, dimensionScores, assessmentCode } = data;
  const genderLabel = gender === "female" ? "女性" : "男性";
  const diff = age - bioAge;
  const agingLabel =
    diff >= 8  ? "生物年龄显著低于实际年龄，表型衰老速度处于最优区间" :
    diff >= 3  ? "生物年龄低于实际年龄，整体衰老速度优于同龄人" :
    diff >= -2 ? "生物年龄与实际年龄基本吻合，处于正常衰老轨迹" :
                 "生物年龄高于实际年龄，衰老速度有待干预";

  const dimensionBlock = Object.entries(dimensionScores)
    .map(([dim, sc]) => `  - ${dim}：${(sc as number).toFixed(1)}/10`)
    .join("\n");

  return `你是一位专注于抗衰老与长寿医学的临床评估专家。请根据以下受评者的七维生活方式评估数据，撰写一份专业、个性化的深度健康分析报告。

【受评者基本信息】
- 姓名：${name}
- 性别：${genderLabel}
- 实际年龄：${age} 岁
- 生物年龄（PAI）：${bioAge} 岁
- 综合评分：${score}/100
- 衰老状态：${agingLabel}
${assessmentCode ? `- 评估编号：${assessmentCode}` : ""}

【七维度得分】
${dimensionBlock}

请按以下五个章节撰写报告，每个章节不少于120字，使用专业临床语言，语气沉稳权威，避免使用AI、模型、算法、生成等词汇：

**第一章：七维健康深度解析**
逐维分析各维度得分，指出优势与薄弱环节，说明各维度之间的关联影响。

**第二章：可逆性分析与优先干预**
识别最具改善潜力的1-2个维度，说明干预的生物学原理及预期收益，给出优先级排序。

**第三章：阶段性行动计划**
制定3个月、6个月、12个月的具体干预目标和行动步骤，内容可操作、可落地。

**第四章：同龄群体对标分析**
将受评者与同性别、同年龄段人群的平均衰老轨迹进行对比，指出相对优势与风险点。

**第五章：未来趋势预测**
基于当前数据，预测3-5年内的健康轨迹走向，说明若持续现有生活方式vs积极干预后的两种情景。

报告结尾附上：医生建议下一步行动（1-2句话），并注明本报告依据临床生活方式数据生成，建议结合专业医疗评估使用。`;
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "API key not configured" }, { status: 500 });
  }

  let body: {
    name?: string;
    age?: number;
    gender?: string;
    bioAge?: number;
    score?: number;
    dimensionScores?: Record<string, number>;
    assessmentCode?: string;
    phone?: string;
    contact?: string;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, age, gender, bioAge, score, dimensionScores, assessmentCode } = body;

  if (!name || !age || !gender || bioAge === undefined || score === undefined || !dimensionScores) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const prompt = buildPrompt({ name, age, gender, bioAge, score, dimensionScores, assessmentCode });

  try {
    const dsRes = await fetch(DEEPSEEK_API_URL, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:      DEEPSEEK_MODEL,
        messages:   [{ role: "user", content: prompt }],
        max_tokens: 1500,
        temperature: 0.7,
      }),
    });

    if (!dsRes.ok) {
      const err = await dsRes.text();
      console.error("DeepSeek error:", err);
      return NextResponse.json({ error: "Report generation failed" }, { status: 502 });
    }

    const dsData = await dsRes.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const report = dsData.choices?.[0]?.message?.content ?? "";

    return NextResponse.json({ ok: true, report });
  } catch (err) {
    console.error("Generate report error:", err);
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
