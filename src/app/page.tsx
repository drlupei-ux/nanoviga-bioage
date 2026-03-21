"use client";
import { useRouter } from "next/navigation";
import { AssessmentHeader } from "@/components/AssessmentHeader";
import { CTAButton } from "@/components/CTAButton";
import { Shield, Clock, BarChart3 } from "lucide-react";

const TRUST_PILLS = [
  { icon: Shield,    text: "临床验证方案" },
  { icon: Clock,     text: "约8分钟完成" },
  { icon: BarChart3, text: "七大维度分析" },
];

const DOMAIN_PREVIEW = [
  "运动能力",
  "身心平衡",
  "营养代谢",
  "睡眠质量",
  "遗传因素",
  "环境因素",
  "感官衰老",
];

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-clinical-bg flex flex-col">
      <AssessmentHeader hideRight />

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-5 pt-24 pb-16">
        <div className="max-w-md w-full text-center animate-fade-up">

          {/* Brand + Eyebrow */}
          <p className="text-sm font-semibold text-clinical-navy tracking-[3px] mb-1">
            生命罗盘
          </p>
          <p className="text-[10px] tracking-[5px] uppercase text-clinical-jade font-medium mb-6">
            表型年龄指数 · PAI
          </p>

          {/* Headline */}
          <h1 className="font-display text-[38px] sm:text-[48px] leading-[1.1] text-clinical-navy mb-4">
            您的身体，
            <br />
            <em className="not-italic text-clinical-gold">实际几岁？</em>
          </h1>

          {/* Subtext */}
          <p className="text-clinical-secondary text-[15px] leading-relaxed mb-8 max-w-sm mx-auto">
            一套结构化多维度生活方式评估，通过七大健康系统的验证指标，精准估算您的生物学年龄。
          </p>

          {/* Trust pills */}
          <div className="flex flex-wrap justify-center gap-2 mb-8">
            {TRUST_PILLS.map(({ icon: Icon, text }) => (
              <div
                key={text}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-white border border-clinical-border text-[11px] text-clinical-secondary shadow-sm"
              >
                <Icon className="w-3 h-3 text-clinical-jade" strokeWidth={1.5} />
                {text}
              </div>
            ))}
          </div>

          {/* CTA */}
          <CTAButton
            size="lg"
            fullWidth
            onClick={() => router.push("/assessment")}
            className="mb-4"
          >
            开始健康评估
          </CTAButton>
          <p className="text-[10px] text-clinical-muted">
            无需注册账号 · 评估结果即时呈现
          </p>
        </div>

        {/* Domain pills preview */}
        <div className="mt-14 max-w-md w-full animate-fade-up delay-300">
          <p className="text-[9px] tracking-[4px] uppercase text-clinical-muted text-center mb-4">
            评估维度
          </p>
          <div className="flex flex-wrap justify-center gap-2">
            {DOMAIN_PREVIEW.map((d) => (
              <span
                key={d}
                className="px-3 py-1 rounded-full text-[10px] text-clinical-secondary bg-white border border-clinical-border"
              >
                {d}
              </span>
            ))}
          </div>
        </div>

        {/* Footer note */}
        <p className="mt-14 text-[10px] text-clinical-muted text-center max-w-xs leading-relaxed animate-fade-up delay-400">
          本评估仅供参考，不构成医疗诊断或医疗建议。如有健康问题，请咨询专业医师。
        </p>
      </main>
    </div>
  );
}
