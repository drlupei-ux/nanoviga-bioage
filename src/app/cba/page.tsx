"use client";
// [CHANGE 2026-03-23] 原因：L2 CBA 落地页，简短有诱惑力的介绍驱动付费 | 影响范围：src/app/cba/page.tsx（新建）
// [CHANGE 2026-03-24] 原因：价格¥399→¥199、45+字号适配（text-[9px]→text-xs、grid-cols-3→grid-cols-2）| 影响范围：src/app/cba/page.tsx

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useCBA } from "@/context/CBAContext";
import { AssessmentHeader } from "@/components/AssessmentHeader";
import { CTAButton } from "@/components/CTAButton";
import { CheckCircle2, FlaskConical, Heart, Target, Microscope } from "lucide-react";

const REPORT_ITEMS = [
  "PhenoAge 生物年龄（精确到0.1岁，误差±1.5年）",
  "5维健康雷达图（代谢活力 · 炎症免疫 · 心血管韧性 · 神经睡眠 · 器官储备）",
  "衰老最快的器官系统 + 可逆性深度分析",
  "同龄排名百分位（您超过了多少同龄人）",
  "3 / 6 / 12 个月精准干预计划",
  "陆大夫 1对1 微信解读",
];

const VALUE_CARDS = [
  {
    icon: FlaskConical,
    title: "5维器官年龄",
    desc:  "代谢 · 炎症 · 心血管\n睡眠 · 器官储备",
  },
  {
    icon: Heart,
    title: "衰老速度评级",
    desc:  "与同龄人群均值\n精准对比",
  },
  {
    icon: Target,
    title: "同龄排名",
    desc:  "您领先多少\n同龄人",
  },
];

export default function CBALandingPage() {
  const router      = useRouter();
  const { setL1RefCode } = useCBA();

  // 读取 URL ?ref=BCA-XXXX 并存入 Context（mounted 后执行，避免 SSR 不一致）
  useEffect(() => {
    const params  = new URLSearchParams(window.location.search);
    const ref     = params.get("ref");
    setL1RefCode(ref);
  }, [setL1RefCode]);

  function handleStart() {
    // 保留 ref 参数传递到 upload 页
    const params  = new URLSearchParams(window.location.search);
    const ref     = params.get("ref");
    router.push(ref ? `/cba/upload?ref=${encodeURIComponent(ref)}` : "/cba/upload");
  }

  return (
    <div className="min-h-screen bg-clinical-bg flex flex-col">
      <AssessmentHeader hideRight />

      <main className="flex-1 flex flex-col items-center px-5 pt-20 pb-16">
        <div className="max-w-sm w-full">

          {/* ── Hero ──────────────────────────────────────────────────────── */}
          <div className="animate-fade-up text-center mb-8">
            <div className="inline-flex items-center gap-2 bg-clinical-jade/10 border border-clinical-jade/30 rounded-full px-3 py-1.5 mb-5">
              <Microscope className="w-3 h-3 text-clinical-jade" strokeWidth={1.5} />
              <span className="text-sm text-clinical-jade font-medium tracking-wide">
                临床生化生物年龄评估 · L2 精准层
              </span>
            </div>

            <h1 className="font-display text-3xl text-clinical-navy leading-tight mb-4">
              体检报告背后<br />
              <span className="text-clinical-jade italic">藏着衰老密码</span>
            </h1>

            <p className="text-base text-clinical-secondary leading-loose mb-2">
              您的血常规不只是"正常 / 异常"
            </p>
            <p className="text-base text-clinical-secondary leading-loose mb-6">
              它精确记录了 <strong className="text-clinical-navy">5 个健康维度</strong>的生物年龄。<br />
              哪个器官正在悄悄老化？哪个还有逆转余地？
            </p>

            <CTAButton size="lg" fullWidth onClick={handleStart}>
              上传体检报告，解锁器官级生物年龄 &nbsp;¥199
            </CTAButton>

            <p className="text-xs text-clinical-muted mt-3">
              无需额外抽血 · 使用您现有体检报告 · 24小时内微信发送报告
            </p>
          </div>

          {/* ── 3 价值卡片（2列，45+友好） ───────────────────────────────── */}
          <div className="animate-fade-up2 grid grid-cols-2 gap-3 mb-8">
            {VALUE_CARDS.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="clinical-card p-4 text-center flex flex-col items-center gap-2"
              >
                <div className="w-9 h-9 rounded-full bg-clinical-jade-lt flex items-center justify-center">
                  <Icon className="w-4 h-4 text-clinical-jade" strokeWidth={1.5} />
                </div>
                <p className="text-sm font-semibold text-clinical-navy leading-tight">{title}</p>
                <p className="text-xs text-clinical-muted leading-snug whitespace-pre-line">{desc}</p>
              </div>
            ))}
          </div>

          {/* ── 科学背书 ───────────────────────────────────────────────────── */}
          <div className="animate-fade-up2 bg-clinical-surface border border-clinical-border rounded-2xl px-4 py-4 mb-6 text-center">
            <p className="text-xs tracking-[3px] uppercase text-clinical-muted mb-2">科学基础</p>
            <p className="text-sm text-clinical-secondary leading-relaxed">
              基于 <strong className="text-clinical-navy">PhenoAge 算法</strong>（Levine 2018 · Nature Aging）<br />
              被引用 <strong className="text-clinical-navy">4,000+</strong> 次 · 预测精准度 ±1.5 岁
            </p>
          </div>

          {/* ── 报告包含内容 ──────────────────────────────────────────────── */}
          <div className="animate-fade-up3 clinical-card p-4 mb-6">
            <p className="text-xs uppercase tracking-[3px] text-clinical-muted mb-3">
              完整报告包含
            </p>
            <div className="space-y-3">
              {REPORT_ITEMS.map((item) => (
                <div key={item} className="flex items-start gap-2.5">
                  <CheckCircle2
                    className="w-4 h-4 text-clinical-jade mt-0.5 shrink-0"
                    strokeWidth={1.5}
                  />
                  <span className="text-sm text-clinical-secondary leading-snug">{item}</span>
                </div>
              ))}
            </div>
          </div>

          {/* ── 底部 CTA ─────────────────────────────────────────────────── */}
          <div className="animate-fade-up3">
            <CTAButton size="lg" fullWidth onClick={handleStart} className="mb-3">
              开始评估 &nbsp;¥199
            </CTAButton>
            <p className="text-xs text-clinical-muted text-center leading-relaxed">
              支付后通过微信接收完整报告 · 基于医学文献，非医疗诊断
            </p>
          </div>

        </div>
      </main>
    </div>
  );
}
