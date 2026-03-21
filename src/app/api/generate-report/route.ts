import { NextRequest, NextResponse } from "next/server";

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

  fetch(CLOUDBASE_URL, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(cloudbasePayload),
  }).catch((err) => console.error("[generate-report] CloudBase call failed:", err));

  // Return immediately — lead is accepted, doctor will follow up via WeChat
  return NextResponse.json({ ok: true });
}
