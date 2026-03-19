"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAssessment } from "@/context/AssessmentContext";
import { DOMAIN_LABELS, getScoreRange } from "@/types/assessment";
import { AssessmentHeader } from "@/components/AssessmentHeader";
import { HeroScore } from "@/components/HeroScore";
import { RadarHealth } from "@/components/RadarHealth";
import { FindingCard } from "@/components/FindingCard";
import { RecommendationCard } from "@/components/RecommendationCard";
import { CTAButton } from "@/components/CTAButton";

// ── 根据各维度分数生成优先干预建议 ────────────────────────────────────────────
function buildRecommendations(scores: Record<string, number>) {
  const RECS: Record<string, {
    title:       string;
    description: string;
    timeframe:   string;
  }[]> = {
    "运动能力": [
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
    "身心平衡": [
      {
        title: "结构化压力恢复训练",
        description:
          "每天10分钟正念冥想或腹式呼吸练习。长期压力升高皮质醇，加速端粒缩短与免疫性衰老。",
        timeframe: "心率变异度（HRV）可测改善：6～8周",
      },
    ],
    "营养代谢": [
      {
        title: "抗炎饮食模式调整",
        description:
          "采用以全食、植物为主、富含omega-3的饮食模式，降低与加速衰老相关的系统性炎症标志物。",
        timeframe: "生物标志物改善：3个月",
      },
    ],
    "睡眠质量": [
      {
        title: "睡眠结构优化",
        description:
          "建立固定睡眠与起床时间（每日偏差≤30分钟）。睡眠是神经胶质淋巴系统清除与细胞修复的核心驱动力，任何补剂都无法替代。",
        timeframe: "昼夜节律重建：2～3周",
      },
    ],
    "遗传因素": [
      {
        title: "强化预防性筛查",
        description:
          "启动每年一次的全面代谢与心血管指标检测。早期发现可显著改变遗传风险轨迹。",
        timeframe: "建议30天内安排检查",
      },
    ],
    "环境因素": [
      {
        title: "环境毒素暴露管理",
        description:
          "评估并减少空气污染物、内分泌干扰物和紫外线暴露。这些是氧化应激负荷的可干预因素。",
        timeframe: "可立即启动防护措施",
      },
    ],
    "感官衰老": [
      {
        title: "感官健康综合检查",
        description:
          "安排眼科与听力评估。未经干预的感官退化与认知加速衰老密切相关，建议尽早筛查。",
        timeframe: "建议60天内预约",
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
      ranked.push({ domain: DOMAIN_LABELS[dim] ?? dim, impact, ...r });
    });
  });

  return ranked.slice(0, 5);
}

// ── 结果页面 ───────────────────────────────────────────────────────────────────
export default function ResultsPage() {
  const router  = useRouter();
  const { results, setResults } = useAssessment();

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

  const recommendations = buildRecommendations(dimensionScores);
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

      <main className="max-w-xl mx-auto px-4 pt-20 pb-20">

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
          <p className="clinical-section-label">七维健康档案</p>
          <RadarHealth dimensionScores={dimensionScores} />
        </section>

        {/* ── 各维度评估 ────────────────────────────── */}
        <section className="mb-6 animate-fade-up delay-300">
          <p className="clinical-section-label">各维度评估结果</p>
          <div className="space-y-3">
            {Object.entries(dimensionScores).map(([dim, score]) => (
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
        <section className="clinical-card text-center animate-fade-up delay-500">
          <p className="text-[10px] tracking-[4px] uppercase text-clinical-jade font-medium mb-2">
            深度分析报告
          </p>
          <h3 className="font-display text-xl text-clinical-navy mb-2">
            器官年龄评估
          </h3>
          <p className="text-[12px] text-clinical-secondary leading-relaxed mb-5 max-w-xs mx-auto">
            通过体检报告结合 PhenoAge 算法，以及专业医生判断，精确量化您的生物学器官年龄。
          </p>
          <CTAButton
            fullWidth
            size="lg"
            onClick={() => router.push("/report")}
          >
            获取深度分析报告 →
          </CTAButton>
          <p className="text-[10px] text-clinical-muted mt-3">
            限时免费 · 专业医生将在24小时内通过微信与您联系。
          </p>
        </section>

        {/* ── 页脚信息 ──────────────────────────────── */}
        <div className="mt-10 text-center">
          <p className="text-[10px] text-clinical-muted leading-loose">
            评估完成：{formattedDate}
            {profile?.name && ` · ${profile.name}`}
            <br />
            评估编号：<strong className="text-clinical-secondary">{assessmentCode}</strong>
            {" "}· 实际年龄：<strong className="text-clinical-secondary">{actualAge} 岁</strong>
          </p>
          <p className="text-[9px] text-clinical-muted mt-3 max-w-xs mx-auto leading-relaxed">
            本报告基于自述生活方式指标生成，不构成医疗诊断。
            如需专业健康建议，请咨询有资质的临床医师。
          </p>
        </div>
      </main>
    </div>
  );
}
