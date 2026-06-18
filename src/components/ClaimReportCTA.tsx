"use client";
// [CHANGE 2026-06-18] 原因：转化优化——结果页主转化卡（领取码 + 领取完整医生报告），替代直给微信号 | 影响范围：results 主CTA
import { CTAButton } from "@/components/CTAButton";

const REPORT_INCLUDES = [
  "风险排序：哪些指标在推高你的身体年龄",
  "衰老机制分析：风险如何形成",
  "90 天改善路线图",
  "医生个性化复核意见",
];

export function ClaimReportCTA({
  bioAge, actualAge, claimCode, onClaim,
}: { bioAge: number; actualAge: number; claimCode: string; onClaim: () => void }) {
  return (
    <section id="claim-report" className="clinical-card mb-6 border-clinical-jade/30 animate-fade-up delay-300">
      <div className="text-center">
        <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-clinical-jade/10 text-clinical-jade text-xs font-medium">
          ✓ 基础评估已完成
        </div>
        <p className="text-sm text-clinical-muted mt-3">您的生物年龄</p>
        <p className="font-display text-3xl text-clinical-navy mt-0.5 tabular-nums">
          {bioAge}<span className="text-base text-clinical-muted"> 岁</span>
        </p>
        <p className="text-xs text-clinical-muted mt-0.5">实际年龄 {actualAge} 岁</p>
      </div>

      <div className="mt-4 rounded-xl bg-clinical-bg p-4">
        <p className="text-sm font-semibold text-clinical-navy">完整《医生报告》待领取，包含：</p>
        <ul className="mt-2 space-y-1.5 text-sm text-clinical-secondary">
          {REPORT_INCLUDES.map((r, i) => (
            <li key={i} className="flex gap-2"><span className="text-clinical-jade">✓</span><span>{r}</span></li>
          ))}
        </ul>
      </div>

      <div className="mt-4 flex items-center justify-between rounded-xl border border-dashed border-clinical-jade bg-clinical-jade/5 px-4 py-3">
        <span className="text-xs tracking-[2px] uppercase text-clinical-muted">领取码</span>
        <span className="font-display text-2xl text-clinical-navy tracking-[0.25em]">{claimCode}</span>
      </div>

      <div className="mt-4">
        <CTAButton fullWidth size="lg" onClick={onClaim}>领取我的完整医生报告 →</CTAButton>
      </div>
      <p className="text-xs text-clinical-muted text-center mt-2">
        点击后自动复制领取码，并显示陆大夫微信二维码
      </p>
    </section>
  );
}
