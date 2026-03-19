import { NextRequest, NextResponse } from "next/server";

// Server-side proxy — avoids browser CORS restriction on saveAssessment endpoint
const CLOUDBASE_URL =
  "https://bioage-compass-prod-9chaf35e573d-1405252881.ap-shanghai.app.tcloudbase.com/saveAssessment";

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const res = await fetch(CLOUDBASE_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify(body),
    });
    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("[save-assessment] CloudBase call failed:", err);
    return NextResponse.json({ error: "upstream_failed" }, { status: 502 });
  }
}
