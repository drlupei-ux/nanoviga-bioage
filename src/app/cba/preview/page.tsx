"use client";
// [CHANGE 2026-03-23] 原因：CBA 预览页+双模式支付弹窗（联动/独立），器官年龄模糊预览+解锁门控 | 影响范围：src/app/cba/preview/page.tsx（新建）
// [CHANGE 2026-03-24] 原因：价格¥399→¥199、QR码路径更新、text-xs/[10px]→text-xs适配45+ | 影响范围：src/app/cba/preview/page.tsx
// [CHANGE 2026-03-28] 原因：联动提交时从sessionStorage读取PLA数据随payload发送，避免云函数DB查询失败 | 影响范围：src/app/cba/preview/page.tsx

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useCBA } from "@/context/CBAContext";
import { AssessmentHeader } from "@/components/AssessmentHeader";
import { CTAButton } from "@/components/CTAButton";
import { CBA_ORGAN_DIMENSIONS, getOrganRiskLevel, ORGAN_RISK_LABELS, ORGAN_RISK_HEX } from "@/types/cba";
import type { CBAResults } from "@/types/cba";
import { Lock, Unlock, AlertCircle, QrCode, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RadarChart, PolarGrid, PolarAngleAxis, Radar,
  ResponsiveContainer
} from "recharts";

// ── 支付弹窗内的阶段 ──────────────────────────────────────────────────────────
type PaymentStage = "qr" | "confirm";

export default function CBAPreviewPage() {
  const router = useRouter();
  const { results, l1RefCode } = useCBA();

  // 从 sessionStorage 恢复（防止刷新丢失）
  const [resolved, setResolved] = useState<CBAResults | null>(null);
  useEffect(() => {
    if (results) { setResolved(results); return; }
    try {
      const saved = sessionStorage.getItem("nanoviga_cba_results");
      if (saved) setResolved(JSON.parse(saved));
    } catch {}
  }, [results]);

  // 无结果时重定向
  useEffect(() => {
    if (resolved === null) {
      const t = setTimeout(() => router.push("/cba"), 500);
      return () => clearTimeout(t);
    }
  }, [resolved, router]);

  // ── 支付弹窗状态 ─────────────────────────────────────────────────────────
  const [showModal,      setShowModal]      = useState(false);
  const [paymentStage,   setPaymentStage]   = useState<PaymentStage>("qr");
  const [phoneSuffix,    setPhoneSuffix]    = useState("");
  const [name,           setName]           = useState("");
  const [submitting,     setSubmitting]     = useState(false);
  const [submitError,    setSubmitError]    = useState("");

  // 联动模式（有 l1RefCode）
  const isLinked = !!l1RefCode;

  // ── 支付后提交 ────────────────────────────────────────────────────────────
  async function handleConfirmSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!resolved) return;

    if (phoneSuffix.length !== 4 || !/^\d{4}$/.test(phoneSuffix)) {
      setSubmitError("请输入手机号后 4 位数字。"); return;
    }
    if (!isLinked && !name.trim()) {
      setSubmitError("请输入您的姓名。"); return;
    }

    setSubmitting(true);
    setSubmitError("");

    // 联动时从 sessionStorage 读取 PLA 数据，随 payload 一起发送给云函数
    // 避免云函数内部 DB 查询可能遭遇的权限/时序问题
    // effectiveRef: 优先用 CBAResults 内嵌的 l1RefCode（刷新后也能恢复），
    //               降级用 CBAContext 的 l1RefCode（正常导航时）
    const effectiveRef = resolved.l1RefCode ?? l1RefCode;
    let l1PlaData: {
      assessmentCode: string; bioAge: number; age: number; score: number;
      dimensionScores: Record<string, number>; agingRate?: number; peerPercentile?: number;
      name?: string | null;
    } | null = null;
    if (effectiveRef) {
      try {
        const saved = sessionStorage.getItem("nanoviga_results");
        if (saved) {
          const pla = JSON.parse(saved);
          // 严格匹配 assessmentCode，防止使用过期 PLA 数据
          if (pla?.assessmentCode === effectiveRef) {
            l1PlaData = {
              assessmentCode:  pla.assessmentCode,
              bioAge:          pla.bioAge,
              age:             pla.actualAge,
              score:           Math.round(pla.totalScore),
              dimensionScores: pla.dimensionScores,
              agingRate:       pla.agingRate,
              peerPercentile:  pla.peerPercentile,
              name:            pla.profile?.name ?? null,  // 联动用户姓名（preview不单独收集）
            };
          }
        }
      } catch { /* sessionStorage 不可用时静默跳过 */ }
    }

    const payload = {
      assessmentCode: resolved.assessmentCode,
      l1RefCode:      effectiveRef ?? null,
      l1PlaData:      l1PlaData ?? undefined,
      name:           isLinked ? undefined : name.trim(),
      phoneSuffix,
      actualAge:      resolved.actualAge,
      gender:         resolved.gender,
      phenoAge:       resolved.phenoAge,
      organAges:      resolved.organAges,
      biomarkers:     resolved.biomarkers,
    };

    try {
      const res = await fetch("/api/cba/submit", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const params = new URLSearchParams(window.location.search);
      const ref    = params.get("ref");
      router.push(ref ? `/cba/success?ref=${encodeURIComponent(ref)}` : "/cba/success");
    } catch {
      setSubmitError("提交失败，请检查网络后重试。");
      setSubmitting(false);
    }
  }

  // ── 雷达图数据 ────────────────────────────────────────────────────────────
  const radarData = resolved
    ? CBA_ORGAN_DIMENSIONS.map(dim => ({
        dim,
        value: Math.max(0, 20 - (resolved.organAges[dim] - resolved.actualAge + 10)),
      }))
    : [];

  const fieldClass =
    "w-full h-12 px-3 rounded-xl border border-clinical-border bg-white text-base " +
    "text-clinical-navy placeholder:text-clinical-muted focus:outline-none " +
    "focus:ring-2 focus:ring-clinical-jade/40 transition";

  if (!resolved) return null;

  return (
    <div className="min-h-screen bg-clinical-bg flex flex-col">
      <AssessmentHeader hideRight />

      <main className="flex-1 flex flex-col items-center px-5 pt-20 pb-16">
        <div className="max-w-sm w-full animate-fade-up">

          {/* ── 页头 ─────────────────────────────────────────────────────── */}
          <p className="text-xs tracking-[5px] uppercase text-clinical-jade font-medium mb-4">
            评估预览
          </p>
          <h2 className="font-display text-2xl text-clinical-navy mb-1">
            您的器官生物年龄
          </h2>
          <p className="text-sm text-clinical-secondary mb-5 leading-relaxed">
            以下为基础预览。解锁完整报告后获取精确数值、深度分析及干预计划。
          </p>

          {/* ── PhenoAge 模糊展示 ─────────────────────────────────────────── */}
          <div className="clinical-card p-5 mb-4 text-center relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center bg-white/70 backdrop-blur-sm z-10 rounded-2xl">
              <div className="flex flex-col items-center gap-2">
                <Lock className="w-5 h-5 text-clinical-jade" strokeWidth={1.5} />
                <p className="text-xs text-clinical-navy font-medium">解锁后查看精确数值</p>
              </div>
            </div>
            <p className="text-xs uppercase tracking-[3px] text-clinical-muted mb-1">生物年龄区间</p>
            <p className="font-display text-4xl text-clinical-navy mb-1 blur-sm select-none">
              {Math.floor(resolved.phenoAge - 1.5)}–{Math.ceil(resolved.phenoAge + 1.5)} 岁
            </p>
            <p className="text-xs text-clinical-muted blur-sm select-none">
              实际年龄 {resolved.actualAge} 岁 · 衰老速度 {resolved.agingRate}x
            </p>
          </div>

          {/* ── 6维雷达图（模糊）────────────────────────────────────────── */}
          <div className="clinical-card p-4 mb-4 relative overflow-hidden">
            <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-sm z-10 rounded-2xl">
              <div className="flex flex-col items-center gap-2">
                <Lock className="w-5 h-5 text-clinical-jade" strokeWidth={1.5} />
                <p className="text-xs text-clinical-navy font-medium">解锁后查看器官雷达图</p>
              </div>
            </div>
            <p className="text-xs uppercase tracking-[3px] text-clinical-muted mb-3">6维器官年龄雷达</p>
            <div className="h-44 blur-sm pointer-events-none select-none">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius={60}>
                  <PolarGrid stroke="#E2E6ED" />
                  <PolarAngleAxis
                    dataKey="dim"
                    tick={{ fontSize: 9, fill: "#64748B" }}
                  />
                  <Radar
                    name="器官年龄"
                    dataKey="value"
                    stroke="#0D7A5F"
                    fill="#0D7A5F"
                    fillOpacity={0.25}
                    strokeWidth={1.5}
                  />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* ── 器官维度预览列表（只显示风险等级，不显示具体岁数）──────── */}
          <div className="clinical-card p-4 mb-6">
            <p className="text-xs uppercase tracking-[3px] text-clinical-muted mb-3">
              器官维度风险概览
            </p>
            <div className="space-y-2">
              {CBA_ORGAN_DIMENSIONS.map(dim => {
                const delta     = resolved.organAges[dim] - resolved.actualAge;
                const riskLevel = getOrganRiskLevel(delta);
                return (
                  <div key={dim} className="flex items-center justify-between">
                    <span className="text-sm text-clinical-navy">{dim}</span>
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xs font-medium"
                        style={{ color: ORGAN_RISK_HEX[riskLevel] }}
                      >
                        {ORGAN_RISK_LABELS[riskLevel]}
                      </span>
                      <div className="flex items-center gap-1">
                        <Lock className="w-3 h-3 text-clinical-muted" strokeWidth={1.5} />
                        <span className="text-xs text-clinical-muted">具体年龄已锁定</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ── 解锁 CTA ──────────────────────────────────────────────────── */}
          <CTAButton size="lg" fullWidth onClick={() => setShowModal(true)} className="mb-2">
            <Unlock className="w-4 h-4 shrink-0" strokeWidth={1.5} />
            解锁完整评估报告 &nbsp;¥199
          </CTAButton>
          <p className="text-xs text-clinical-muted text-center leading-relaxed mb-6">
            支付后 24 小时内通过微信发送完整报告
          </p>

          <CTAButton
            variant="ghost"
            fullWidth
            onClick={() => router.push("/cba/upload")}
          >
            ← 返回修改指标
          </CTAButton>

        </div>
      </main>

      {/* ── 支付弹窗 ───────────────────────────────────────────────────────── */}
      {showModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40"
          onClick={e => { if (e.target === e.currentTarget) setShowModal(false); }}
        >
          <div className="w-full max-w-sm bg-white rounded-t-3xl px-5 pt-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] animate-fade-up">

            {/* 弹窗头部 */}
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg text-clinical-navy">
                {paymentStage === "qr" ? "微信扫码支付 ¥199" : "✓ 确认支付"}
              </h3>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="text-clinical-muted hover:text-clinical-navy transition"
              >
                <X className="w-5 h-5" strokeWidth={1.5} />
              </button>
            </div>

            {/* ── 阶段1：展示收款二维码 ────────────────────────────────── */}
            {paymentStage === "qr" && (
              <div className="text-center">
                <p className="text-sm text-clinical-secondary mb-4 leading-relaxed">
                  请使用微信扫描下方二维码完成支付。<br />
                  <strong className="text-clinical-navy">备注：CBA评估</strong>
                </p>

                {/* 微信收款二维码 */}
                <div className="flex justify-center mb-4">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/wechat-pay-199.png"
                    alt="微信收款码 ¥199"
                    className="w-52 h-auto rounded-2xl border border-clinical-border bg-white"
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = "none";
                      const placeholder = document.getElementById("pay-qr-placeholder");
                      if (placeholder) placeholder.style.display = "flex";
                    }}
                  />
                  {/* 占位符（图片未就绪时显示）*/}
                  <div
                    id="pay-qr-placeholder"
                    className="hidden w-52 h-52 rounded-2xl border-2 border-dashed border-clinical-border flex-col items-center justify-center gap-2"
                  >
                    <QrCode className="w-10 h-10 text-clinical-muted" strokeWidth={1} />
                    <p className="text-xs text-clinical-muted text-center leading-relaxed px-2">
                      微信收款二维码<br />（待管理员上传）
                    </p>
                  </div>
                </div>

                <p className="text-xs text-clinical-muted mb-4">
                  ¥199 · 微信支付 · 支付成功后点击下方按钮
                </p>

                <CTAButton
                  fullWidth size="lg"
                  onClick={() => setPaymentStage("confirm")}
                >
                  我已完成支付 →
                </CTAButton>
              </div>
            )}

            {/* ── 阶段2：留资确认表单（双模式）────────────────────────── */}
            {paymentStage === "confirm" && (
              <form onSubmit={handleConfirmSubmit} className="space-y-4">

                {/* 模式 A：联动（有 l1RefCode）—— 只展示编号 + 手机后4位 */}
                {isLinked && (
                  <div className="bg-clinical-jade-lt border border-clinical-jade/30 rounded-2xl px-4 py-3">
                    <p className="text-xs tracking-[3px] uppercase text-clinical-jade font-medium mb-1">
                      您的 L1 评估编号
                    </p>
                    <p className="font-display text-xl text-clinical-navy tracking-widest">
                      {resolved.l1RefCode}
                    </p>
                    <p className="text-xs text-clinical-muted mt-1">
                      此编号将与生化报告绑定，陆大夫直接通过微信发送综合报告
                    </p>
                  </div>
                )}

                {/* 模式 B：独立 —— 姓名 + 微信提示 */}
                {!isLinked && (
                  <>
                    <div>
                      <label className="block text-xs uppercase tracking-widest text-clinical-muted mb-1.5">
                        姓名 *
                      </label>
                      <input
                        className={fieldClass}
                        placeholder="请输入您的姓名"
                        value={name}
                        onChange={e => setName(e.target.value)}
                      />
                    </div>

                    <div className="bg-clinical-amber-lt border border-clinical-amber/20 rounded-2xl px-3 py-2.5">
                      <p className="text-xs text-clinical-amber font-medium mb-1">
                        请先添加陆大夫微信，再提交
                      </p>
                      <p className="text-xs text-clinical-secondary leading-relaxed">
                        报告将通过微信 1对1 发送，请确保已添加好友。
                      </p>
                      <div className="flex justify-center mt-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src="/wechat-qr.jpg"
                          alt="陆大夫微信二维码"
                          className="w-28 h-auto rounded-xl border border-clinical-border bg-white"
                          onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* 手机后4位（两种模式都需要）*/}
                <div>
                  <label className="block text-xs uppercase tracking-widest text-clinical-muted mb-1.5">
                    手机号后 4 位 *
                  </label>
                  <input
                    className={fieldClass}
                    type="tel"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="例：3456"
                    value={phoneSuffix}
                    onChange={e => setPhoneSuffix(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  />
                  <p className="text-xs text-clinical-muted mt-1 leading-relaxed">
                    {isLinked
                      ? "管理员将通过 L1 编号匹配您的微信联系人，手机后4位用于核验支付身份。"
                      : "管理员通过微信收款记录（显示手机尾号）核验支付，与报告精准匹配。"}
                  </p>
                </div>

                {submitError && (
                  <div className="flex items-start gap-2 bg-clinical-danger-lt border border-clinical-danger/20 rounded-xl px-3 py-2">
                    <AlertCircle className="w-3.5 h-3.5 text-clinical-danger mt-0.5 shrink-0" strokeWidth={1.5} />
                    <p className="text-xs text-clinical-danger">{submitError}</p>
                  </div>
                )}

                <CTAButton
                  type="submit"
                  fullWidth size="lg"
                  loading={submitting}
                >
                  {submitting ? "提交中…" : "提交，开始生成报告 →"}
                </CTAButton>

                <button
                  type="button"
                  className="w-full text-xs text-clinical-muted underline underline-offset-2 py-1"
                  onClick={() => setPaymentStage("qr")}
                >
                  ← 返回查看收款二维码
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
