"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAssessment } from "@/context/AssessmentContext";
import { AssessmentHeader } from "@/components/AssessmentHeader";
import { CTAButton } from "@/components/CTAButton";
import { CheckCircle2, FileText, Phone, User } from "lucide-react";
import Image from "next/image";

const BENEFITS = [
  "完整的7维深度分析报告（PDF格式）",
  "3/6/12个月个性化行动计划",
  "有机会获得与专业医生1对1咨询",
];

type Stage = "form" | "success";

export default function ReportPage() {
  const router  = useRouter();
  const { results } = useAssessment();

  // Resolve assessment data: prefer live context, fall back to sessionStorage
  // This handles the case where user navigates directly to /report or refreshes
  const resolvedResults = results ?? (() => {
    try {
      const saved = typeof window !== "undefined"
        ? sessionStorage.getItem("nanoviga_results")
        : null;
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  })();

  const [stage,   setStage]   = useState<Stage>("form");
  const [name,    setName]    = useState(resolvedResults?.profile?.name ?? "");
  const [phone,   setPhone]   = useState("");
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim())  return setError("请输入您的姓名。");
    if (!phone.trim()) return setError("请输入您的手机号码。");
    if (!/^1[3-9]\d{9}$/.test(phone.replace(/\s/g, "")))
      return setError("请输入有效的中国大陆手机号码。");

    setError("");
    setLoading(true);

    // Use resolvedResults (context or sessionStorage) for assessment data
    const payload = {
      name:            name.trim(),
      age:             resolvedResults?.actualAge,
      gender:          resolvedResults?.profile?.gender,
      bioAge:          resolvedResults?.bioAge,
      score:           Math.round(resolvedResults?.totalScore ?? 50),
      dimensionScores: resolvedResults?.dimensionScores ?? {},
      contact:         phone.trim(),
      phone:           phone.trim(),
      assessmentCode:  resolvedResults?.assessmentCode,
    };

    try {
      const res = await fetch("/api/generate-report", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setStage("success");
    } catch {
      setError("提交失败，请检查网络后重试。");
    } finally {
      setLoading(false);
    }
  }

  const fieldClass =
    "w-full h-10 px-3 rounded-xl border border-clinical-border bg-white text-sm text-clinical-navy placeholder:text-clinical-muted focus:outline-none focus:ring-2 focus:ring-clinical-jade/40 transition";

  // ── 成功页面：显示微信二维码 ────────────────────────────────────────────
  if (stage === "success") {
    return (
      <div className="min-h-screen bg-clinical-bg flex flex-col">
        <AssessmentHeader hideRight />
        <main className="flex-1 flex flex-col items-center justify-center px-5 text-center pb-12">
          <div className="animate-fade-up max-w-sm w-full">

            {/* 成功图标 */}
            <div className="w-14 h-14 rounded-full bg-clinical-jade-lt flex items-center justify-center mx-auto mb-5">
              <CheckCircle2 className="w-7 h-7 text-clinical-jade" strokeWidth={1.5} />
            </div>

            <h2 className="font-display text-2xl text-clinical-navy mb-2">
              信息已收到
            </h2>
            <p className="text-sm text-clinical-secondary leading-relaxed mb-2">
              感谢您，<strong className="text-clinical-navy">{name}</strong>
            </p>
            <p className="text-sm text-clinical-secondary leading-relaxed mb-5">
              请扫描下方微信二维码，陆大夫将通过微信与您1对1发送完整报告。
            </p>

            {/* 评估编号卡片 */}
            {resolvedResults?.assessmentCode && (
              <div className="bg-clinical-surface border border-clinical-jade/30 rounded-2xl px-4 py-3 mb-6">
                <p className="text-[9px] tracking-[3px] uppercase text-clinical-jade font-medium mb-1">
                  您的评估编号
                </p>
                <p className="font-display text-xl text-clinical-navy tracking-widest">
                  {resolvedResults.assessmentCode}
                </p>
                <p className="text-[10px] text-clinical-muted mt-1">
                  添加微信时请备注此编号，方便精准匹配您的报告
                </p>
              </div>
            )}

            {/* 微信二维码卡片 */}
            <div className="clinical-card p-6 mb-6">
              <p className="text-[9px] tracking-[4px] uppercase text-clinical-muted mb-4">
                扫码添加微信 · 1对1报告发送
              </p>

              {/* 二维码图片 */}
              <div className="flex justify-center mb-4">
                <div className="w-56 relative rounded-2xl overflow-hidden border border-clinical-border bg-white">
                  <Image
                    src="/wechat-qr.jpg"
                    alt="陆大夫逆龄管理 微信二维码"
                    width={672}
                    height={596}
                    className="w-full h-auto"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = "none";
                    }}
                  />
                </div>
              </div>

              <p className="text-xs text-clinical-secondary font-medium mb-1">
                陆大夫逆龄管理
              </p>
              <p className="text-[11px] text-clinical-muted leading-relaxed">
                扫一扫上面的二维码，加我为朋友
              </p>
            </div>

            {/* 提示说明 */}
            <div className="bg-clinical-surface border border-clinical-border rounded-2xl px-4 py-3 mb-6 text-left">
              <p className="text-[10px] text-clinical-muted leading-relaxed">
                <span className="text-clinical-jade font-medium">· </span>添加后请备注：<strong className="text-clinical-secondary">姓名 + 手机后4位 + 评估编号</strong><br />
                <span className="text-clinical-jade font-medium">· </span>报告将在工作日24小时内发送<br />
                <span className="text-clinical-jade font-medium">· </span>如有问题可直接微信咨询
              </p>
            </div>

            <CTAButton
              variant="secondary"
              fullWidth
              onClick={() => router.push("/results")}
            >
              ← 返回评估结果
            </CTAButton>
          </div>
        </main>
      </div>
    );
  }

  // ── 留资表单 ─────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-clinical-bg flex flex-col">
      <AssessmentHeader hideRight />

      <main className="flex-1 flex flex-col items-center px-5 pt-20 pb-16">
        <div className="max-w-sm w-full animate-fade-up">

          {/* 头部文案 */}
          <p className="text-[10px] tracking-[5px] uppercase text-clinical-jade font-medium mb-4">
            深度报告申请
          </p>
          <h2 className="font-display text-2xl text-clinical-navy mb-1">
            获取您的完整分析报告
          </h2>
          <p className="text-sm text-clinical-secondary mb-3 leading-relaxed">
            填写以下信息，专业医生将通过微信向您1对1发送完整深度分析报告及个性化干预计划。
          </p>
          {/* 限时免费标注 */}
          <div className="inline-flex items-center gap-2 bg-clinical-jade/10 border border-clinical-jade/30 rounded-full px-3 py-1.5 mb-5">
            <span className="w-1.5 h-1.5 rounded-full bg-clinical-jade animate-pulse" />
            <span className="text-[11px] text-clinical-jade font-medium">限时免费体验 · 通常价值 ¥399</span>
          </div>

          {/* 报告内容清单 */}
          <div className="clinical-card mb-6 p-4 space-y-2.5">
            <p className="text-[9px] uppercase tracking-[3px] text-clinical-muted mb-3">
              报告包含内容
            </p>
            {BENEFITS.map((b) => (
              <div key={b} className="flex items-start gap-2.5">
                <CheckCircle2 className="w-3.5 h-3.5 text-clinical-jade mt-0.5 shrink-0" strokeWidth={1.5} />
                <span className="text-xs text-clinical-secondary leading-snug">{b}</span>
              </div>
            ))}
          </div>

          {/* 生物年龄摘要 */}
          {resolvedResults && (
            <div className="flex items-center justify-between bg-clinical-surface border border-clinical-border rounded-2xl px-4 py-3 mb-6">
              <div>
                <p className="text-[9px] uppercase tracking-widest text-clinical-muted">您的PAI评估结果</p>
                <p className="font-display text-lg text-clinical-navy mt-0.5">
                  生物年龄 <strong className="text-clinical-jade">{resolvedResults.bioAge}</strong>
                  <span className="text-clinical-muted text-sm font-normal"> / 实际 {resolvedResults.actualAge} 岁</span>
                </p>
              </div>
              <FileText className="w-5 h-5 text-clinical-muted shrink-0" strokeWidth={1.5} />
            </div>
          )}

          {/* 留资表单 */}
          <form onSubmit={handleSubmit} className="space-y-3">

            {/* 姓名（必填）*/}
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-clinical-muted mb-1.5">
                姓名 *
              </label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-clinical-muted pointer-events-none" strokeWidth={1.5} />
                <input
                  className={fieldClass + " pl-8"}
                  placeholder="请输入您的姓名"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
            </div>

            {/* 手机号（必填）*/}
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-clinical-muted mb-1.5">
                手机号码 *
              </label>
              <div className="relative">
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-clinical-muted pointer-events-none" strokeWidth={1.5} />
                <input
                  className={fieldClass + " pl-8"}
                  type="tel"
                  placeholder="请输入您的手机号码"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                />
              </div>
              <p className="text-[10px] text-clinical-muted mt-1.5 leading-relaxed">
                此信息为准确发送报告的确认依据，仅用于报告推送，不做其他用途。
              </p>
            </div>

            {error && (
              <p className="text-clinical-danger text-xs bg-clinical-danger-lt border border-clinical-danger/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <CTAButton
              type="submit"
              fullWidth
              size="lg"
              loading={loading}
              className="mt-1"
            >
              {loading ? "提交中…" : "申请深度报告 →"}
            </CTAButton>

            <p className="text-[10px] text-clinical-muted text-center leading-relaxed pt-1">
              您的信息依据临床隐私标准处理，不与第三方共享。
            </p>
          </form>
        </div>
      </main>
    </div>
  );
}
