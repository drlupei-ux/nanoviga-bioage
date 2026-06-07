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

    // [CHANGE 2026-06-07] 原因：CloudBase HTTP 访问请求体上限约 100KB，原"整包多图 base64"会触发 413 EXCEED_MAX_PAYLOAD_SIZE，云函数从未执行 → OCR 实测失效；改为"逐张转发（并发）+ 合并指标"，使单次请求稳定在限额内。配合前端压缩（每张 <~60KB）保证单图请求不超限。 | 影响范围：src/app/api/cba/analyze/route.ts（转发策略：整包 → 逐张并发 + 合并）
    // [CHANGE 2026-06-07] 原因：analyzeCBA 成功返回 {code:0,biomarkers}，无 ok 字段；统一整形为文档约定的 {ok,biomarkers} 契约 | 影响范围：成功响应
    const results = await Promise.all(
      files.map(async (f) => {
        try {
          const res = await fetch(CLOUDBASE_URL, {
            method:  "POST",
            headers: { "Content-Type": "application/json" },
            body:    JSON.stringify({ mode: "extract", files: [f] }),
          });
          return await res.json();
        } catch {
          return null;
        }
      })
    );

    // 合并各图提取结果：按指标名取首个非空值（避免后图空值覆盖前图有效值）
    const merged: Record<string, number> = {};
    let anyOk = false;
    for (const json of results) {
      if (json && json.code === 0) {
        anyOk = true;
        if (json.biomarkers && typeof json.biomarkers === "object") {
          for (const [k, v] of Object.entries(json.biomarkers)) {
            if (v !== null && v !== undefined && merged[k] === undefined) {
              merged[k] = v as number;
            }
          }
        }
      }
    }

    const biomarkers = Object.keys(merged).length > 0 ? merged : null;
    return NextResponse.json({ ok: anyOk, biomarkers });
  } catch (err) {
    console.error("[cba/analyze] Error:", err);
    // 降级：返回空结果，前端回退到手动填写
    return NextResponse.json({ ok: false, biomarkers: null, error: "AI extract unavailable" });
  }
}

// Vercel App Router route segment config（Next.js 14 方式）
export const maxDuration = 30;  // 秒，AI提取可能需要一定时间
