// [CHANGE 2026-03-24] 原因：展示层5维统一 — L1 7D内部分→5维品牌维度映射（算法不变）| 影响范围：src/lib/dimensionMapping.ts（新建）

/**
 * 将 L1 PLA 内部7维得分映射为展示层5维统一维度。
 * 算法层（scoring.ts）完全不变，仅用于雷达图展示。
 */
export function mapL1ToFivePillars(s: Record<string, number>): Record<string, number> {
  return {
    "代谢活力":   s["营养代谢"] ?? 5,
    "炎症免疫":   ((s["身心平衡"] ?? 5) * 0.6 + (s["环境因素"] ?? 5) * 0.4),
    "心血管韧性": s["运动能力"] ?? 5,
    "神经睡眠":   ((s["睡眠质量"] ?? 5) * 0.7 + (s["感官衰老"] ?? 5) * 0.3),
    "器官储备":   s["遗传因素"] ?? 5,
  };
}
