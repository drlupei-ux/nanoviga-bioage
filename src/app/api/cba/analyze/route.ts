// [CHANGE 2026-03-23] 原因：CBA AI 提取代理路由，将文件上传转发至 CloudBase analyzeCBA 云函数 | 影响范围：src/app/api/cba/analyze/route.ts（新建）
import { NextRequest, NextResponse } from "next/server";

const CLOUDBASE_URL =
  "https://bioage-compass-prod-9chaf35e573d-1405252881.ap-shanghai.app.tcloudbase.com/analyzeCBA";

export async function POST(req: NextRequest) {
  try {
    // 将 multipart formData 直接转发给 CloudBase（云函数处理文件 + DeepSeek Vision）
    const formData = await req.formData();

    // 收集文件列表，转为 base64 + metadata 的 JSON 发送（CloudBase HTTP 函数不支持原始 multipart）
    const files: Array<{ name: string; type: string; data: string }> = [];
    for (const [, value] of formData.entries()) {
      if (value instanceof Blob) {
        const buf    = await value.arrayBuffer();
        const base64 = Buffer.from(buf).toString("base64");
        files.push({
          name: (value as File).name ?? "file",
          type: value.type,
          data: base64,
        });
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ ok: false, error: "No files provided" }, { status: 400 });
    }

    const res = await fetch(CLOUDBASE_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ mode: "extract", files }),
    });

    const json = await res.json();
    return NextResponse.json(json);
  } catch (err) {
    console.error("[cba/analyze] Error:", err);
    // 降级：返回空结果，前端回退到手动填写
    return NextResponse.json({ ok: false, biomarkers: null, error: "AI extract unavailable" });
  }
}

// Vercel App Router route segment config（Next.js 14 方式）
export const maxDuration = 30;  // 秒，AI提取可能需要一定时间
