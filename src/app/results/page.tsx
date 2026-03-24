"use client";
// [CHANGE 2026-03-24] 原因：展示层5维统一 — 各维度评估结果、干预建议、编号复制 | 影响范围：src/app/results/page.tsx
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useAssessment } from "@/context/AssessmentContext";
import { DOMAIN_LABELS, getScoreRange } from "@/types/assessment";
import { mapL1ToFivePillars } from "@/lib/dimensionMapping";
import { AssessmentHeader } from "@/components/AssessmentHeader";
import { HeroScore } from "@/components/HeroScore";
import { RadarHealth } from "@/components/RadarHealth";
import { FindingCard } from "@/components/FindingCard";
import { RecommendationCard } from "@/components/RecommendationCard";
import { CTAButton } from "@/components/CTAButton";

const SAVE_URL = "/api/save-assessment"; // proxied to avoid browser CORS

// ── 根据5维得分生成优先干预建议 ────────────────────────────────────────────
function buildRecommendations(scores: Record<string, number>) {
  const RECS: Record<string, {
    title:       string;
    description: string;
    timeframe:   string;
  }[]> = {
    "代谢活力": [
      {
        title: "抗炎饮食模式调整",
        description:
          "采用以全食、植物为主、富含omega-3的饮食模式，降低与加速衰老相关的系统性炎症标志物，改善细胞能量代谢。",
        timeframe: "生物标志物改善：3个月",
      },
    ],
    "炎症免疫": [
      {
        title: "结构化压力恢复训练",
        description:
          "每天10分钟正念冥想或腹式呼吸练习。长期压力升高皮质醇，加速端粒缩短与免疫性衰老，建议同步减少环境毒素暴露。",
        timeframe: "心率变异度（HRV）可测改善：6～8周",
      },
    ],
    "心血管韧性": [
      {
        title: "结构化有氧训练方案",
        description:
          "建立渐进式有氧运动计划——每周≥150分钟中等强度有氧活动。心肺耐力是预测寿命最强的独立指标之一。",
        timeframe: "目标：4周内建立规律运动习惯",
      },
      {
        title: "抗阻力量训练方案",
        description:
          "每周安排2次抗阻训练。骨骼肌量与代谢性衰老及全因死亡率呈负相关，是高ROI干预项目。",
        timeframe: "可观察改善：8～12周",
      },
    ],
    "神经睡眠": [
      {
        title: "睡眠结构优化",
        description:
          "建立固定睡眠与起床时间（每日偏差≤30分钟）。睡眠是神经胶质淋巴系统清除与细胞修复的核心驱动力，任何补剂都无法替代。",
        timeframe: "昼夜节律重建：2～3周",
      },
    ],
    "器官储备": [
      {
        title: "强化预防性筛查",
        description:
          "启动每年一次的全面代谢与心血管指标检测。早期发现可显著改变遗传风险轨迹，建议同步评估感官功能。",
        timeframe: "建议30天内安排检查",
      },
    ],
  };

  type Rec = { domain: string; title: string; description: string; timeframe: string; impact: "High" | "Moderate" | "Supporting" };

  const ranked: Rec[] = [];
  const sorted = Object.entries(scores).sort(([, a], [, b]) => a - b);

  sorted.forEach(([dim, score]) => {
    const range = getScoreRange(score);
    const impact: "High" | "Moderate" | "Supporting" =
      range === "attention" ? "High" : range === "average" ? "Moderate" : "Supporting";
    const recs = RECS[dim] ?? [];
    recs.forEach((r) => {
      ranked.push({ domain: dim, impact, ...r });
    });
  });

  return ranked.slice(0, 5);
}

// ── 结果页面 ───────────────────────────────────────────────────────────────────
export default function ResultsPage() {
  const router  = useRouter();
  const { results, setResults } = useAssessment();
  const savedRef = useRef(false); // prevent double-fire in React StrictMode

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
  const recommendations  = buildRecommendations(fivePillarScores);
  const weakestPillar    = Object.entries(fivePillarScores).sort(([, a], [, b]) => a - b)[0][0];

  function copyCode() {
    navigator.clipboard.writeText(assessmentCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
        <CTAButton fullWidth size="lg" onClick={() => router.push("/report")}>
          获取深度分析报告 →
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
              <p className="text-[9px] text-clinical-muted uppercase tracking-wide mt-0.5">{unit}</p>
              <p className="text-[10px] text-clinical-secondary mt-1 font-medium">{label}</p>
            </div>
          ))}
        </section>

        {/* ── 雷达图 ────────────────────────────────── */}
        <section className="clinical-card mb-6 animate-fade-up delay-200">
          <p className="clinical-section-label">五维健康档案</p>
          <RadarHealth dimensionScores={mapL1ToFivePillars(dimensionScores)} />
        </section>

        {/* ── 各维度评估 ────────────────────────────── */}
        <section className="mb-6 animate-fade-up delay-300">
          <p className="clinical-section-label">各维度评估结果</p>
          <div className="space-y-3">
            {Object.entries(fivePillarScores).map(([dim, score]) => (
              <FindingCard key={dim} dimension={dim} score={score} />
            ))}
          </div>
        </section>

        {/* ── 优先干预建议 ──────────────────────────── */}
        <section className="mb-8 animate-fade-up delay-400">
          <p className="clinical-section-label">优先干预建议</p>
          <div className="space-y-3">
            {recommendations.map((rec, i) => (
              <RecommendationCard
                key={i}
                rank={i + 1}
                domain={rec.domain}
                title={rec.title}
                description={rec.description}
                impact={rec.impact}
                timeframe={rec.timeframe}
              />
            ))}
          </div>
        </section>

        {/* ── 升级CTA ───────────────────────────────── */}
        <section className="clinical-card animate-fade-up delay-500">
          <p className="text-xs tracking-[4px] uppercase text-clinical-jade font-medium mb-3">
            下一步 · L2 精密评估
          </p>
          <h3 className="font-display text-xl text-clinical-navy mb-3">
            用血液数据验证您的评估结论
          </h3>

          {/* 动态弱项说明 */}
          <div className="bg-clinical-surface border border-clinical-border rounded-xl px-4 py-3 mb-4">
            <p className="text-sm text-clinical-secondary leading-relaxed">
              您的评估显示{" "}
              <strong className="text-clinical-navy">{weakestPillar}</strong>{" "}
              是当前最需关注的维度。
              CBA 将从血液生化层面交叉验证这一发现，精确量化 5 个器官系统的生物年龄。
            </p>
          </div>

          {/* 关联编号提示 */}
          <div className="flex items-center gap-2 mb-4">
            <div className="flex-1 h-px bg-clinical-border" />
            <span className="text-[10px] text-clinical-muted tracking-wider shrink-0">
              将与评估编号 {assessmentCode} 关联
            </span>
            <div className="flex-1 h-px bg-clinical-border" />
          </div>

          <CTAButton
            fullWidth
            size="lg"
            onClick={() => router.push(`/cba?ref=${assessmentCode}`)}
          >
            解锁器官级生物年龄 ¥199 →
          </CTAButton>
          <p className="text-xs text-clinical-muted mt-3 text-center">
            无需额外抽血 · 使用您现有体检报告 · 24小时内报告送达
          </p>
        </section>

        {/* ── 页脚信息 ──────────────────────────────── */}
        <div className="mt-10 text-center">
          <p className="text-[10px] text-clinical-muted leading-loose">
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
            <span className="text-[9px] tracking-[3px] uppercase text-clinical-muted">您的评估编号</span>
            <span className="font-display text-lg text-clinical-navy tracking-widest">{assessmentCode}</span>
            <span className="text-[10px] text-clinical-jade font-medium">
              {copied ? "✓ 已复制" : "点击复制 — 添加微信时请备注此编号"}
            </span>
          </button>

          <p className="text-[9px] text-clinical-muted mt-4 max-w-xs mx-auto leading-relaxed">
            本报告基于自述生活方式指标生成，不构成医疗诊断。
            如需专业健康建议，请咨询有资质的临床医师。
          </p>
          <p className="text-[9px] text-clinical-muted mt-4 tracking-[3px] font-medium">
            生命罗盘 · 陆大夫抗衰管理
          </p>
        </div>
      </main>
    </div>
  );
}
