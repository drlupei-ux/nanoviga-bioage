// [CHANGE 2026-06-08] 原因：未 await 的 fetch 在 Vercel 函数返回后被冻结/终止，发往 CloudBase 的请求被静默丢弃 → L1 完成后邮件不发送；改用 waitUntil 保活函数直至 fetch 完成 | 影响范围：src/app/api/generate-report/route.ts
import { NextRequest, NextResponse } from "next/server";
import { waitUntil } from "@vercel/functions";

export const maxDuration = 60;

const CLOUDBASE_URL =
  "https://bioage-compass-prod-9chaf35e573d-1405252881.ap-shanghai.app.tcloudbase.com/generateReport";

export async function POST(req: NextRequest) {
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
    agingPace?: number;
    peerPercentile?: number;
  };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, age, gender, bioAge, score, dimensionScores, assessmentCode, phone, contact, agingPace, peerPercentile } = body;

  if (!name || !age || !gender || bioAge === undefined || score === undefined || !dimensionScores) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  // Fire-and-forget: call CloudBase which handles DeepSeek report generation + email to doctor.
  // We do NOT await — return success immediately so the user sees the confirmation screen
  // without waiting for the 30-60s AI generation.
  const cloudbasePayload = {
    mode:            "full",
    name,
    age,
    gender,
    bioAge,
    score,
    dimensionScores,
    contact:         phone ?? contact ?? "",
    assessmentCode:  assessmentCode ?? "",
    agingPace,
    peerPercentile,
  };

  // waitUntil: 函数会保活到 fetch 完成，但不阻塞用户响应（避免未 await 时请求被丢弃）
  waitUntil(
    fetch(CLOUDBASE_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(cloudbasePayload),
    }).catch((err) => console.error("[generate-report] CloudBase call failed:", err))
  );

  // Return immediately — lead is accepted, doctor will follow up via WeChat
  return NextResponse.json({ ok: true });
}
