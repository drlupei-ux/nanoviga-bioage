"use client";
import { cn } from "@/lib/utils";

interface Props {
  rank:        number;
  domain:      string;
  title:       string;
  description: string;
  impact:      "High" | "Moderate" | "Supporting";
  timeframe:   string;
  className?:  string;
}

const IMPACT_LABELS: Record<"High" | "Moderate" | "Supporting", string> = {
  High:       "重点改善",
  Moderate:   "建议改善",
  Supporting: "辅助维护",
};

const IMPACT_STYLES: Record<"High" | "Moderate" | "Supporting", string> = {
  High:       "bg-clinical-jade-lt text-clinical-jade border-clinical-jade/25",
  Moderate:   "bg-clinical-amber-lt text-clinical-amber border-clinical-amber/25",
  Supporting: "bg-clinical-surface text-clinical-secondary border-clinical-border",
};

export function RecommendationCard({
  rank,
  domain,
  title,
  description,
  impact,
  timeframe,
  className,
}: Props) {
  return (
    <div className={cn(
      "bg-white rounded-2xl border border-clinical-border p-5 shadow-card flex gap-4",
      className
    )}>
      {/* 排名标记 */}
      <div className="shrink-0 flex flex-col items-center pt-0.5">
        <div className="w-7 h-7 rounded-full bg-clinical-surface flex items-center justify-center border border-clinical-border">
          <span className="text-sm font-bold text-clinical-navy tabular-nums">
            {rank}
          </span>
        </div>
        {rank < 3 && (
          <div className="w-px flex-1 bg-clinical-border mt-2 min-h-[20px]" />
        )}
      </div>

      {/* 内容 */}
      <div className="flex-1 min-w-0">
        {/* 维度 + 优先级 */}
        <div className="flex items-center gap-2 mb-2 flex-wrap">
          <span className="text-xs font-semibold text-clinical-secondary">
            {domain}
          </span>
          <span className={cn(
            "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border",
            IMPACT_STYLES[impact]
          )}>
            {IMPACT_LABELS[impact]}
          </span>
        </div>

        <h4 className="font-semibold text-clinical-navy text-base leading-snug mb-2">
          {title}
        </h4>

        <p className="text-sm text-clinical-primary leading-relaxed mb-3">
          {description}
        </p>

        {/* 时间框架 */}
        <div className="flex items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-clinical-jade" />
          <span className="text-xs text-clinical-secondary font-medium">{timeframe}</span>
        </div>
      </div>
    </div>
  );
}
