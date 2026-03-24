"use client";
// [CHANGE 2026-03-24] 原因：落地页统一改版 — 5维展示、45+字号适配、CBA联动引导 | 影响范围：src/app/page.tsx

import { useRouter } from "next/navigation";
import { AssessmentHeader } from "@/components/AssessmentHeader";
import { CTAButton } from "@/components/CTAButton";
import { Shield, Clock, Activity, Brain, Flame, CheckCircle2, ArrowRight } from "lucide-react";

const TRUST_PILLS = [
  { icon: Shield,   text: "临床验证方案" },
  { icon: Clock,    text: "约8分钟完成" },
  { icon: Activity, text: "5维深度分析" },
];

// 展示层5维（内部仍为7维问卷，此处为统一品牌叙事）
const DOMAIN_PREVIEW = [
  "代谢活力",
  "炎症免疫",
  "心血管韧性",
  "神经睡眠",
  "器官储备",
];

const VALUE_CARDS = [
  {
    icon: Activity,
    title: "生物年龄精算",
    desc: "比实际年龄年轻，还是偏老？精确到年",
  },
  {
    icon: Brain,
    title: "5维健康雷达",
    desc: "定位最薄弱的健康环节，有的放矢",
  },
  {
    icon: Flame,
    title: "精准干预建议",
    desc: "知道从哪里改变，改变最高效",
  },
];

const REPORT_ITEMS = [
  "生物年龄估算（与实际年龄差值分析）",
  "5维健康雷达图（代谢 · 炎症 · 心血管 · 睡眠 · 器官）",
  "最高优先级干预维度 + 改善建议",
  "同龄人群对比参考",
  "3 / 6 / 12 个月行动计划",
  "临床洞察与关键发现报告",
];

export default function LandingPage() {
  const router = useRouter();
  const handleStart = () => router.push("/assessment");

  return (
    <div className="min-h-screen bg-clinical-bg flex flex-col">
      <AssessmentHeader hideRight />

      <main className="flex-1 flex flex-col items-center px-5 pt-20 pb-16">
        <div className="max-w-sm w-full">

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <div className="animate-fade-up text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-clinical-jade/10 border border-clinical-jade/30 rounded-full px-3 py-1.5 mb-5">
              <Shield className="w-3 h-3 text-clinical-jade" strokeWidth={1.5} />
              <span className="text-xs text-clinical-jade font-medium tracking-wide">
                生活方式生物年龄评估 · L1 免费
              </span>
            </div>

            <h1 className="font-display text-[38px] sm:text-[44px] leading-[1.1] text-clinical-navy mb-4">
              您的身体，
              <br />
              <em className="not-italic text-clinical-gold">实际几岁？</em>
            </h1>

            <p className="text-base text-clinical-secondary leading-loose mb-2">
              5大健康维度 · 29项临床指标
            </p>
            <p className="text-base text-clinical-secondary leading-loose mb-6">
              科学估算您真实的<strong className="text-clinical-navy">生物学年龄</strong>
            </p>

            {/* Trust pills */}
            <div className="flex flex-wrap justify-center gap-2 mb-6">
              {TRUST_PILLS.map(({ icon: Icon, text }) => (
                <div
                  key={text}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-clinical-border text-sm text-clinical-secondary shadow-sm"
                >
                  <Icon className="w-3.5 h-3.5 text-clinical-jade" strokeWidth={1.5} />
                  {text}
                </div>
              ))}
            </div>

            <CTAButton
              size="lg"
              fullWidth
              onClick={handleStart}
              className="mb-3"
            >
              开始免费评估
            </CTAButton>
            <p className="text-xs text-clinical-muted">
              无需注册账号 · 评估结果即时呈现
            </p>
          </div>

          {/* ── 3 价值卡片 ─────────────────────────────────────────────────── */}
          <div className="animate-fade-up2 grid grid-cols-3 gap-2.5 mb-8">
            {VALUE_CARDS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="clinical-card p-3 text-center flex flex-col items-center gap-2"
              >
                <div className="w-8 h-8 rounded-full bg-clinical-jade-lt flex items-center justify-center">
                  <Icon className="w-4 h-4 text-clinical-jade" strokeWidth={1.5} />
                </div>
                <p className="text-xs font-semibold text-clinical-navy leading-tight">{title}</p>
                <p className="text-[11px] text-clinical-muted leading-snug">{desc}</p>
              </div>
            ))}
          </div>

          {/* ── 科学背书 ───────────────────────────────────────────────────── */}
          <div className="animate-fade-up2 bg-clinical-surface border border-clinical-border rounded-2xl px-4 py-3 mb-6 text-center">
            <p className="text-xs tracking-[3px] uppercase text-clinical-muted mb-1">科学基础</p>
            <p className="text-sm text-clinical-secondary leading-relaxed">
              基于 <strong className="text-clinical-navy">Klemera-Doubal 生物年龄框架</strong><br />
              涵盖 <strong className="text-clinical-navy">5大衰老决定因素</strong> · 29项临床验证指标
            </p>
          </div>

          {/* ── 报告包含内容 ──────────────────────────────────────────────── */}
          <div className="animate-fade-up3 clinical-card p-4 mb-6">
            <p className="text-xs uppercase tracking-[3px] text-clinical-muted mb-3">
              评估报告包含
            </p>
            <div className="space-y-2.5">
              {REPORT_ITEMS.map((item) => (
                <div key={item} className="flex items-start gap-2.5">
                  <CheckCircle2
                    className="w-3.5 h-3.5 text-clinical-jade mt-0.5 shrink-0"
                    strokeWidth={1.5}
                  />
                  <span className="text-sm text-clinical-secondary leading-snug">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── 评估维度 pills ─────────────────────────────────────────────── */}
          <div className="animate-fade-up3 mb-8">
            <p className="text-xs tracking-[4px] uppercase text-clinical-muted text-center mb-3">
              评估维度
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {DOMAIN_PREVIEW.map((d) => (
                <span
                  key={d}
                  className="px-3 py-1.5 rounded-full text-sm text-clinical-secondary bg-white border border-clinical-border"
                >
                  {d}
                </span>
              ))}
            </div>
          </div>

          {/* ── CBA 升级引导卡 ─────────────────────────────────────────────── */}
          <div className="animate-fade-up3 mb-8">
            <button
              type="button"
              className="w-full text-left rounded-2xl border border-clinical-jade/30 bg-gradient-to-br from-clinical-jade/5 to-clinical-jade/10 px-4 py-4"
              onClick={() => router.push("/cba")}
            >
              <p className="text-xs tracking-[3px] uppercase text-clinical-jade font-medium mb-2">
                L2 精密评估
              </p>
              <p className="text-base font-semibold text-clinical-navy mb-1">
                想知道血液里的衰老信号？
              </p>
              <p className="text-sm text-clinical-secondary leading-relaxed mb-3">
                上传体检报告 → PhenoAge 生化生物年龄 + 5维器官精准评估
              </p>
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-clinical-jade">CBA 临床生化评估 ¥199</span>
                <ArrowRight className="w-4 h-4 text-clinical-jade" strokeWidth={1.5} />
              </div>
            </button>
          </div>

          {/* ── 底部 CTA ──────────────────────────────────────────────────── */}
          <div className="animate-fade-up3 mb-3">
            <CTAButton size="lg" fullWidth onClick={handleStart}>
              开始免费评估
            </CTAButton>
          </div>
          <div className="animate-fade-up3 mb-6">
            <button
              type="button"
              className="w-full h-12 rounded-2xl border border-clinical-jade/40 text-clinical-jade text-sm font-medium hover:bg-clinical-jade/5 transition-colors"
              onClick={() => router.push("/cba")}
            >
              已有体检报告？解锁器官级生物年龄 ¥199 →
            </button>
          </div>

          {/* Disclaimer */}
          <p className="text-xs text-clinical-muted text-center leading-relaxed">
            本评估仅供参考，不构成医疗诊断或医疗建议。如有健康问题，请咨询专业医师。
          </p>

        </div>
      </main>
    </div>
  );
}
