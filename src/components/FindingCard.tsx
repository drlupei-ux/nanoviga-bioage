"use client";
// [CHANGE 2026-03-24] 原因：展示层5维统一 — FindingCard支持5维品牌维度 | 影响范围：src/components/FindingCard.tsx
import {
  Activity,
  Brain,
  Leaf,
  Moon,
  Dna,
  Wind,
  Eye,
  Shield,
  Heart,
  LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getScoreRange,
  RANGE_LABELS,
} from "@/types/assessment";

const ICON_MAP: Record<string, LucideIcon> = {
  // 7维（内部）
  "运动能力": Activity,
  "身心平衡": Brain,
  "营养代谢": Leaf,
  "睡眠质量": Moon,
  "遗传因素": Dna,
  "环境因素": Wind,
  "感官衰老": Eye,
  // 5维（展示层）
  "代谢活力":   Leaf,
  "炎症免疫":   Shield,
  "心血管韧性": Heart,
  "神经睡眠":   Moon,
  "器官储备":   Dna,
};

const FINDING_COPY: Record<string, Record<"optimal" | "average" | "attention", string>> = {
  "运动能力": {
    optimal:   "心肺耐力与肌肉骨骼功能维护良好，整体运动表现优秀。",
    average:   "日常活动量基本达标，进一步强化运动训练有助于提升长寿指标。",
    attention: "检测到久坐或体力活动不足。建议制定规律运动方案，优先改善。",
  },
  "身心平衡": {
    optimal:   "压力应对系统调节良好，心理韧性强，情绪稳定。",
    average:   "偶有压力标志物升高，建议增加正念练习与恢复性活动。",
    attention: "慢性应激负荷偏高，可能加速衰老进程，建议开展压力管理干预。",
  },
  "营养代谢": {
    optimal:   "饮食质量和代谢指标均处于最优营养状态，整体良好。",
    average:   "饮食结构基本合理，进一步优化微量营养素密度有助于改善衰老标志物。",
    attention: "饮食模式可能导致代谢效率下降，建议进行营养评估和膳食调整。",
  },
  "睡眠质量": {
    optimal:   "睡眠结构支持有效的细胞修复和认知恢复，睡眠质量优秀。",
    average:   "睡眠时长和质量在正常范围内，优化昼夜节律可进一步提升恢复效果。",
    attention: "检测到睡眠紊乱模式，建议进行睡眠障碍临床评估，及时干预。",
  },
  "遗传因素": {
    optimal:   "家族健康史未显示明显遗传风险因素，整体遗传背景良好。",
    average:   "存在部分遗传指标，建议定期进行预防性筛查以降低风险。",
    attention: "检测到较明显的家族遗传风险因素，建议加强定期临床监测。",
  },
  "环境因素": {
    optimal:   "环境暴露管理得当，有助于维护细胞健康和减少氧化应激。",
    average:   "存在中度环境暴露，建议采取针对性减少暴露的防护措施。",
    attention: "检测到显著的环境应激因素，建议积极减少有害暴露，改善生活环境。",
  },
  "感官衰老": {
    optimal:   "感觉功能保存良好，与健康生物衰老轨迹一致。",
    average:   "轻微感觉变化，属实际年龄正常范围，建议保持定期检查。",
    attention: "感觉灵敏度出现明显变化，建议安排眼科和听力专科评估。",
  },
  // 5维展示层文案
  "代谢活力": {
    optimal:   "代谢功能处于最优状态，饮食质量与营养摄入支持良好的细胞能量代谢。",
    average:   "代谢指标基本正常，优化饮食结构与微量营养素密度可进一步改善。",
    attention: "检测到代谢效率下降信号，建议进行营养评估与饮食调整，优先干预。",
  },
  "炎症免疫": {
    optimal:   "免疫调节与应激管理均处于良好水平，全身性炎症负荷低。",
    average:   "存在轻度炎症信号，建议增加抗炎食物摄入并关注压力管理。",
    attention: "检测到慢性低度炎症风险，可能加速组织老化，建议积极干预。",
  },
  "心血管韧性": {
    optimal:   "心肺耐力与循环功能维护良好，是预测健康寿命最强的生理指标之一。",
    average:   "心血管功能处于正常范围，规律有氧训练可显著提升长寿指标。",
    attention: "检测到心肺功能不足或体力活动缺乏，建议制定渐进式有氧运动方案。",
  },
  "神经睡眠": {
    optimal:   "睡眠结构支持有效的神经修复与认知恢复，神经系统功能优秀。",
    average:   "睡眠和认知功能在正常范围，优化昼夜节律可进一步提升恢复质量。",
    attention: "检测到睡眠紊乱或感觉退化信号，建议进行专科评估，及时干预。",
  },
  "器官储备": {
    optimal:   "家族健康史与遗传背景未显示明显风险因素，器官储备功能良好。",
    average:   "存在部分遗传风险指标，建议定期进行预防性筛查以降低风险。",
    attention: "检测到较明显的遗传风险因素，建议加强定期临床监测与预防干预。",
  },
};

interface Props {
  dimension: string;
  score:     number;
  className?: string;
}

const RANGE_STYLES = {
  optimal:   { bar: "bg-clinical-jade", badge: "bg-clinical-jade-lt text-clinical-jade border-clinical-jade/25" },
  average:   { bar: "bg-clinical-amber", badge: "bg-clinical-amber-lt text-clinical-amber border-clinical-amber/25" },
  attention: { bar: "bg-clinical-danger", badge: "bg-clinical-danger-lt text-clinical-danger border-clinical-danger/25" },
};

export function FindingCard({ dimension, score, className }: Props) {
  const range   = getScoreRange(score);
  const Icon    = ICON_MAP[dimension] ?? Activity;
  const finding = FINDING_COPY[dimension]?.[range] ?? "";
  const styles  = RANGE_STYLES[range];
  const pct     = Math.round((score / 10) * 100);

  return (
    <div className={cn(
      "bg-white rounded-2xl border border-clinical-border p-5 shadow-card",
      className
    )}>
      {/* 卡片头部 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-clinical-surface flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-clinical-navy" strokeWidth={1.5} />
          </div>
          <p className="font-semibold text-clinical-navy text-base leading-tight">{dimension}</p>
        </div>
        <span className={cn(
          "inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border shrink-0",
          styles.badge
        )}>
          {RANGE_LABELS[range]}
        </span>
      </div>

      {/* 得分进度条 */}
      <div className="mb-3">
        <div className="flex justify-between items-baseline mb-1.5">
          <span className="text-xs text-clinical-secondary font-medium">维度得分</span>
          <span className="font-bold text-clinical-navy text-base tabular-nums">
            {score.toFixed(1)}<span className="text-clinical-muted font-normal text-sm"> / 10</span>
          </span>
        </div>
        <div className="h-1.5 bg-clinical-border rounded-full overflow-hidden">
          <div
            className={cn("h-full rounded-full transition-all duration-700", styles.bar)}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* 评估说明 */}
      <p className="text-sm text-clinical-primary leading-relaxed">
        {finding}
      </p>
    </div>
  );
}
