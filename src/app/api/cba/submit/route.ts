// [CHANGE 2026-03-23] 原因：CBA 提交 API 路由，保存到 CloudBase + fire-and-forget 报告生成 | 影响范围：src/app/api/cba/submit/route.ts（新建）
// [CHANGE 2026-03-28] 原因：透传 l1PlaData（PLA评估数据），供云函数直接使用无需DB查询 | 影响范围：src/app/api/cba/submit/route.ts
import { NextRequest, NextResponse } from "next/server";

const CLOUDBASE_URL =
  "https://bioage-compass-prod-9chaf35e573d-1405252881.ap-shanghai.app.tcloudbase.com/analyzeCBA";

export async function POST(req: NextRequest) {
  let body: {
    assessmentCode?:  string;
    l1RefCode?:       string | null;
    l1PlaData?:       { assessmentCode: string; bioAge: number; age: number; score: number; dimensionScores: Record<string, number>; agingRate?: number; peerPercentile?: number; name?: string | null } | null;
    name?:            string;
    phoneSuffix?:     string;
    actualAge?:       number;
    gender?:          string;
    phenoAge?:        number;
    organAges?:       Record<string, number>;
    biomarkers?:      Record<string, number>;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const {
    assessmentCode, l1RefCode, l1PlaData, name, phoneSuffix,
    actualAge, gender, phenoAge, organAges, biomarkers,
  } = body;

  if (!assessmentCode || !phoneSuffix || actualAge === undefined || !gender || phenoAge === undefined) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const cloudbasePayload = {
    mode:           "cba_submit",
    assessmentCode,
    l1RefCode:      l1RefCode ?? null,
    l1PlaData:      l1PlaData ?? null,
    name:           name ?? null,
    phoneSuffix,
    actualAge,
    gender,
    phenoAge,
    organAges:      organAges ?? {},
    biomarkers:     biomarkers ?? {},
    submittedAt:    new Date().toISOString(),
  };

  // Fire-and-forget — CloudBase 处理 DB 保存 + DeepSeek 报告生成 + 邮件通知
  // 不 await，避免 Vercel 10s 超时
  fetch(CLOUDBASE_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(cloudbasePayload),
  }).catch((err) => console.error("[cba/submit] CloudBase call failed:", err));

  return NextResponse.json({ ok: true, assessmentCode });
}
