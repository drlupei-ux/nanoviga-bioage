// ─── Clinical Domain Mapping ─────────────────────────────────────────────────
export const DOMAIN_LABELS: Record<string, string> = {
  "运动能力": "运动能力",
  "身心平衡": "身心平衡",
  "营养代谢": "营养代谢",
  "睡眠质量": "睡眠质量",
  "遗传因素": "遗传因素",
  "环境因素": "环境因素",
  "感官衰老": "感官衰老",
};

export const DOMAIN_LABELS_EN: Record<string, string> = {
  "运动能力": "Physical Capacity",
  "身心平衡": "Psychosocial Health",
  "营养代谢": "Metabolic Nutrition",
  "睡眠质量": "Sleep Architecture",
  "遗传因素": "Hereditary Indicators",
  "环境因素": "Environmental Exposure",
  "感官衰老": "Sensory Acuity",
};

export const DOMAIN_ICONS: Record<string, string> = {
  "运动能力": "Activity",
  "身心平衡": "Brain",
  "营养代谢": "Leaf",
  "睡眠质量": "Moon",
  "遗传因素": "Dna",
  "环境因素": "Wind",
  "感官衰老": "Eye",
};

export type ScoreRange = "optimal" | "average" | "attention";

export function getScoreRange(score: number): ScoreRange {
  if (score >= 8.0) return "optimal";
  if (score >= 6.0) return "average";
  return "attention";
}

// [CHANGE 2026-04-07] 原因：转化优化v1.1，禁用"优秀"等正面标签，改为张力叙事 | 影响范围：FindingCard.tsx
export const RANGE_LABELS: Record<ScoreRange, string> = {
  optimal:   "当前稳定，但已接近下降阈值",
  average:   "目前正常，但存在潜在波动风险",
  attention: "暂无明显异常，但恢复能力开始下降",
};

export const RANGE_COLORS: Record<ScoreRange, string> = {
  optimal:   "clinical-jade",
  average:   "clinical-amber",
  attention: "clinical-danger",
};

// ─── Assessment Question ─────────────────────────────────────────────────────
export interface Option {
  text:  string;
  score: number;
}

export interface Question {
  dimension: string;
  text:      string;
  options:   Option[];
}

// ─── User Profile ─────────────────────────────────────────────────────────────
export interface UserProfile {
  name?:       string;
  birthYear:   number;
  birthMonth:  number;
  gender:      "male" | "female";
  height:      number;
  weight:      number;
}

// ─── Results ─────────────────────────────────────────────────────────────────
export interface AssessmentResults {
  profile:          UserProfile;
  dimensionScores:  Record<string, number>;
  totalScore:       number;
  bioAge:           number;
  actualAge:        number;
  agingRate:        number;
  peerPercentile:   number;
  agingStatus:      AgingStatus;
  assessmentCode:   string;
  completedAt:      string;
}

export interface AgingStatus {
  label: string;
  color: string;
  desc:  string;
}

export function getAgingStatus(diff: number): AgingStatus {
  if (diff >= 8)  return { label: "生物年龄显著更年轻", color: "#0D7A5F", desc: "明显低于实际年龄" };
  if (diff >= 3)  return { label: "生物年龄较年轻", color: "#C8A96E", desc: "低于平均衰老速度" };
  if (diff >= -2) return { label: "生物年龄与实际相符", color: "#475569", desc: "与实际年龄基本一致" };
  // [CHANGE 2026-06-07] 原因：品牌文案"健康管理"→"逆龄管理"，与"陆大夫逆龄管理"叙事统一 | 影响范围：results 状态标签 desc
  return               { label: "生物年龄偏高", color: "#9B2335", desc: "建议关注逆龄管理" };
}
