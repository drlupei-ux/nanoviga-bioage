"use client";
// [CHANGE 2026-03-24] 原因：展示层5维统一 — 各维度评估结果、干预建议、编号复制 | 影响范围：src/app/results/page.tsx
// [CHANGE 2026-04-07] 原因：转化优化v1.1，首屏标题+风险时间轴+锁定洞察模块 | 影响范围：src/app/results/page.tsx
// [CHANGE 2026-06-07] 原因：L1/L2 分离——结果页精简为「生物年龄差距+同龄人+五维雷达+微信引导」，移除各维度评估/优先干预建议/趋势预测/待解锁/L2 升级 CTA；新增加微信引导卡片 + L1 完成自动邮件通知陆大夫 | 影响范围：src/app/results/page.tsx
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAssessment } from "@/context/AssessmentContext";
import { mapL1ToFivePillars } from "@/lib/dimensionMapping";
import { AssessmentHeader } from "@/components/AssessmentHeader";
import { HeroScore } from "@/components/HeroScore";
import { RadarHealth } from "@/components/RadarHealth";
import { CTAButton } from "@/components/CTAButton";
import { WeChatAddCard } from "@/components/WeChatAddCard";

const SAVE_URL   = "/api/save-assessment";   // proxied to avoid browser CORS
const REPORT_URL = "/api/generate-report";   // L1 完成自动把结果+编号邮件给陆大夫（复用 generateReport）

// ── 结果页面 ───────────────────────────────────────────────────────────────────
export default function ResultsPage() {
  const router  = useRouter();
  const { results, setResults } = useAssessment();
  const savedRef      = useRef(false); // prevent double-fire in React StrictMode
  const reportSentRef = useRef(false); // 自动邮件只发一次

  // Guard: if context is empty (React race condition or page refresh),
  // try sessionStorage before redirecting home
  useEffect(() => {
    if (!results) {
      try {
        const saved = sessionStorage.getItem("nanoviga_results");
        if (saved) {
          setResults(JSON.parse(saved));
          return; // wait for re-render with restored results
        }
      } catch {}
      router.replace("/");
    }
  }, [results, router, setResults]);

  // ── Fire-and-forget: persist assessment to CloudBase on first render ──
  useEffect(() => {
    if (!results || savedRef.current) return;
    savedRef.current = true;
    fetch(SAVE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:            results.profile?.name ?? "",
        age:             results.actualAge,
        gender:          results.profile?.gender ?? "",
        bioAge:          results.bioAge,
        score:           Math.round(results.totalScore),
        dimensionScores: results.dimensionScores,
        assessmentCode:  results.assessmentCode,
        agingRate:       results.agingRate,
        peerPercentile:  results.peerPercentile,
        agingStatus:     results.agingStatus?.label ?? "",
        version:         "PLA-v3-next",
        createdAt:       results.completedAt ?? new Date().toISOString(),
      }),
    }).catch(() => {}); // silent fail — data is always in sessionStorage
  }, [results]);

  // [CHANGE 2026-06-08] 原因：L1 通知邮件改由「用户点击加微信」触发（见 notifyDoctor + WeChatAddCard.onEngage），不再每个匿名 L1 自动发——大幅降低 163 SMTP 发信量，规避 550 限频导致邮件静默丢失；L1 数据仍在页面加载时存入 DB（上方 save-assessment），不丢线索 | 影响范围：results 通知邮件触发时机（自动 useEffect → 加微信引擎）

  const [copied, setCopied] = useState(false);

  if (!results) return null;

  const {
    bioAge,
    actualAge,
    totalScore,
    peerPercentile,
    agingRate,
    agingStatus,
    assessmentCode,
    dimensionScores,
    profile,
    completedAt,
  } = results;

  const fivePillarScores = mapL1ToFivePillars(dimensionScores);

  function copyCode() {
    navigator.clipboard.writeText(assessmentCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  // [CHANGE 2026-06-08] 原因：用户点击「加微信」= 真实线索，此时才把结果+编号邮件通知陆大夫（替代每个匿名 L1 自动发，降低 163 限频）；编号级 sessionStorage 去重，多次点击只发一封；fire-and-forget 失败不影响用户 | 影响范围：results 加微信触发通知
  function notifyDoctor() {
    if (reportSentRef.current) return;
    const sentKey = `nanoviga_report_sent_${assessmentCode}`;
    try {
      if (sessionStorage.getItem(sentKey)) { reportSentRef.current = true; return; }
    } catch {}
    reportSentRef.current = true;
    try { sessionStorage.setItem(sentKey, "1"); } catch {}
    fetch(REPORT_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name:            profile?.name || "自助L1用户",
        age:             actualAge,
        gender:          profile?.gender || "",
        bioAge,
        score:           Math.round(totalScore),
        dimensionScores,
        assessmentCode,
        agingPace:       agingRate,
        peerPercentile,
        contact:         `见微信备注编号 ${assessmentCode}`,
      }),
    }).catch(() => {});
  }
  const formattedDate   = new Date(completedAt).toLocaleDateString("zh-CN", {
    year: "numeric", month: "long", day: "numeric",
  });

  const statItems = [
    { label: "健康总评分",   value: `${Math.round(totalScore)}`, unit: "/ 100" },
    { label: "衰老速率",     value: `${(agingRate * 100).toFixed(0)}%`, unit: "对比实际年龄" },
    { label: "同龄人百分位", value: `${peerPercentile}th`, unit: "百分位" },
  ];

  return (
    <div className="min-h-screen bg-clinical-bg">
      <AssessmentHeader hideRight />

      {/* ── 手机端固定底部CTA ── 用户不需要滚到底才能行动 ── */}
      <div className="fixed bottom-0 left-0 right-0 z-40 sm:hidden bg-white/95 backdrop-blur-sm border-t border-clinical-border px-4 pt-3 pb-safe-4">
        {/* [CHANGE 2026-06-07] 原因：L1/L2 分离——底部 CTA 由跳转 /report 改为滚动至加微信引导卡片 | 影响范围：results 固定底部 CTA */}
        <CTAButton
          fullWidth
          size="lg"
          onClick={() =>
            document.getElementById("wechat-add")?.scrollIntoView({ behavior: "smooth", block: "center" })
          }
        >
          添加陆大夫微信 · 获取完整报告 →
        </CTAButton>
      </div>

      <main className="max-w-xl mx-auto px-4 pt-20 pb-28 sm:pb-20">

        {/* ── 生物年龄核心展示 ──────────────────────── */}
        <section className="pt-10 pb-8 animate-fade-up">
          <HeroScore bioAge={bioAge} actualAge={actualAge} assessmentCode={assessmentCode} />
        </section>

        {/* ── 状态标签 ──────────────────────────────── */}
        <section className="flex items-center justify-center gap-3 mb-10 animate-fade-up delay-100">
          <div
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-medium"
            style={{
              background: agingStatus.color + "18",
              borderColor: agingStatus.color + "40",
              color: agingStatus.color,
            }}
          >
            <span className="w-1.5 h-1.5 rounded-full" style={{ background: agingStatus.color }} />
            {agingStatus.label} · {agingStatus.desc}
          </div>
        </section>

        {/* ── 核心指标 ──────────────────────────────── */}
        <section className="grid grid-cols-3 gap-3 mb-6 animate-fade-up delay-200">
          {statItems.map(({ label, value, unit }) => (
            <div key={label} className="clinical-card text-center p-4">
              <p className="font-display text-xl text-clinical-navy tabular-nums">{value}</p>
              <p className="text-xs text-clinical-muted uppercase tracking-wide mt-0.5">{unit}</p>
              <p className="text-xs text-clinical-secondary mt-1 font-medium">{label}</p>
            </div>
          ))}
        </section>

        {/* ── 雷达图 ────────────────────────────────── */}
        <section className="clinical-card mb-6 animate-fade-up delay-200">
          <p className="clinical-section-label">五维健康档案</p>
          <RadarHealth dimensionScores={fivePillarScores} />
        </section>

        {/* ── 加微信引导（详细报告 / 团队沟通 / L2 由陆大夫人工发放）── */}
        <WeChatAddCard assessmentCode={assessmentCode} onEngage={notifyDoctor} />

        {/* ── 页脚信息 ──────────────────────────────── */}
        <div className="mt-10 text-center">
          <p className="text-xs text-clinical-muted leading-loose">
            评估完成：{formattedDate}
            {profile?.name && ` · ${profile.name}`}
            <br />
            实际年龄：<strong className="text-clinical-secondary">{actualAge} 岁</strong>
          </p>

          {/* 评估编号 — 可点击复制 */}
          <button
            type="button"
            onClick={copyCode}
            className="mt-3 inline-flex flex-col items-center gap-1 bg-clinical-surface border border-clinical-border rounded-2xl px-5 py-3 cursor-pointer hover:border-clinical-jade/40 transition-colors"
          >
            <span className="text-xs tracking-[3px] uppercase text-clinical-muted">您的评估编号</span>
            <span className="font-display text-lg text-clinical-navy tracking-widest">{assessmentCode}</span>
            <span className="text-xs text-clinical-jade font-medium">
              {copied ? "✓ 已复制" : "点击复制 — 添加微信时请备注此编号"}
            </span>
          </button>

          <p className="text-xs text-clinical-muted mt-4 max-w-xs mx-auto leading-relaxed">
            本报告基于自述生活方式指标生成，不构成医疗诊断。
            如需专业健康建议，请咨询有资质的临床医师。
          </p>
          <p className="text-xs text-clinical-muted mt-4 tracking-[3px] font-medium">
            生命罗盘 · 陆大夫抗衰管理
          </p>
        </div>
      </main>
    </div>
  );
}
