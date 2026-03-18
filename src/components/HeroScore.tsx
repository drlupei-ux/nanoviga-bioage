"use client";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  bioAge:          number;
  actualAge:       number;
  assessmentCode?: string;
  className?:      string;
}

export function HeroScore({ bioAge, actualAge, assessmentCode, className }: Props) {
  const [displayed, setDisplayed] = useState(actualAge);
  const diff = actualAge - bioAge;

  // 数字从实际年龄动画至生物年龄
  useEffect(() => {
    const frames = 40;
    const step   = (bioAge - actualAge) / frames;
    let frame    = 0;
    const id = setInterval(() => {
      frame++;
      if (frame >= frames) { setDisplayed(bioAge); clearInterval(id); return; }
      setDisplayed(Math.round(actualAge + step * frame));
    }, 35);
    return () => clearInterval(id);
  }, [bioAge, actualAge]);

  // 年龄对比徽章
  type BadgeType = "younger" | "older" | "neutral";
  let badgeType: BadgeType = "neutral";
  let badgeText = "生物年龄与实际年龄相符";
  if (diff >= 3)  { badgeType = "younger"; badgeText = `↓ 比实际年龄年轻 ${diff} 岁`; }
  if (diff <= -3) { badgeType = "older";   badgeText = `↑ 比实际年龄偏大 ${Math.abs(diff)} 岁`; }

  const badgeStyles: Record<BadgeType, string> = {
    younger: "bg-clinical-jade-lt text-clinical-jade border-clinical-jade/25",
    older:   "bg-clinical-danger-lt text-clinical-danger border-clinical-danger/25",
    neutral: "bg-clinical-amber-lt text-clinical-amber border-clinical-amber/25",
  };

  // 解读谱带标记位置（0%=最优，100%=高风险）
  const markerPct = Math.max(2, Math.min(98, 50 - diff * 3));

  return (
    <div className={cn("text-center animate-fade-up", className)}>

      {/* 顶部标签 */}
      <p className="text-[10px] tracking-[5px] uppercase text-clinical-jade font-medium mb-5">
        表型年龄指数
      </p>

      {/* 大数字 */}
      <div className="mb-3">
        <span className="font-display text-[80px] sm:text-[96px] leading-none text-clinical-navy tabular-nums">
          {displayed}
        </span>
        <span className="text-clinical-muted text-lg ml-1 font-light">岁</span>
      </div>

      {/* 对比徽章 */}
      <div className="flex justify-center mb-6">
        <span className={cn(
          "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium border",
          badgeStyles[badgeType]
        )}>
          {badgeText}
        </span>
      </div>

      {/* 解读谱带 */}
      <div className="max-w-sm mx-auto px-4">
        <div className="relative h-1.5 rounded-full bg-gradient-to-r from-clinical-jade via-clinical-amber to-clinical-danger mb-2">
          <div
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 flex flex-col items-center"
            style={{ left: `${markerPct}%` }}
          >
            <div className="w-0.5 h-5 bg-clinical-primary -mt-2" />
            <span className="text-[10px] text-clinical-primary mt-0.5">▼</span>
          </div>
        </div>
        <div className="flex justify-between text-[9px] text-clinical-muted tracking-wide">
          <span>最优状态</span>
          <span>正常范围</span>
          <span>需要关注</span>
        </div>
      </div>

      {/* 说明注释 */}
      <p className="text-[11px] text-clinical-muted mt-4 max-w-xs mx-auto leading-relaxed">
        基于7大健康维度生活方式指标综合评估。
        实际年龄：<strong className="text-clinical-secondary">{actualAge}</strong> 岁 ·
        评估编号：<strong className="text-clinical-secondary">{assessmentCode ?? "—"}</strong>
      </p>
    </div>
  );
}
