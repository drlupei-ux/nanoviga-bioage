// [CHANGE 2026-03-23] 原因：新增 L2 CBA 临床生化年龄评估全部类型定义 | 影响范围：src/types/cba.ts（新建）

// ─── 6维器官维度（严格基于血液指标，不含感官衰老）────────────────────────────────
export type CBAOrganDimension =
  | "代谢健康"
  | "炎症状态"
  | "肾脏功能"
  | "肝脏功能"
  | "心血管健康"
  | "血液健康";

export const CBA_ORGAN_DIMENSIONS: CBAOrganDimension[] = [
  "代谢健康",
  "炎症状态",
  "肾脏功能",
  "肝脏功能",
  "心血管健康",
  "血液健康",
];

// ─── 生物标志物输入（用户填写，中国临床单位）─────────────────────────────────────
// PhenoAge 核心 9 项（必填）
export interface PhenoAgeBiomarkers {
  albumin:    number;   // 白蛋白 g/L   → 算法内部转换为 g/dL
  creatinine: number;   // 肌酐 μmol/L  → 算法内部转换为 mg/dL
  glucose:    number;   // 空腹血糖 mmol/L → 算法内部转换为 mg/dL
  crp:        number;   // 超敏C反应蛋白 mg/L → 算法内部转换为 mg/dL 后取 ln
  lymphPct:   number;   // 淋巴细胞百分比 %
  mcv:        number;   // 红细胞平均体积 fL
  rdw:        number;   // 红细胞分布宽度 %
  alp:        number;   // 碱性磷酸酶 U/L
  wbc:        number;   // 白细胞计数 ×10⁹/L
}

// 扩展指标（用于6维器官年龄；可选）
export interface ExtendedBiomarkers {
  hba1c?:            number;  // 糖化血红蛋白 %
  triglycerides?:    number;  // 甘油三酯 mmol/L
  hdl?:              number;  // 高密度脂蛋白 mmol/L
  uricAcid?:         number;  // 尿酸 μmol/L
  bun?:              number;  // 尿素氮 mmol/L
  alt?:              number;  // 谷丙转氨酶 U/L
  ast?:              number;  // 谷草转氨酶 U/L
  ggt?:              number;  // 谷氨酰转肽酶 U/L
  totalCholesterol?: number;  // 总胆固醇 mmol/L
  ldl?:              number;  // 低密度脂蛋白 mmol/L
  hemoglobin?:       number;  // 血红蛋白 g/L
  platelets?:        number;  // 血小板 ×10⁹/L
}

export type CBABiomarkers = PhenoAgeBiomarkers & ExtendedBiomarkers;

// ─── 表单字段配置（驱动上传页面渲染）────────────────────────────────────────────
export interface BiomarkerField {
  key:       keyof CBABiomarkers;
  label:     string;
  unit:      string;
  required:  boolean;
  hint:      string;      // 参考范围提示
  min:       number;
  max:       number;
  step:      number;
  group:     "core" | "extended";
}

export const BIOMARKER_FIELDS: BiomarkerField[] = [
  // ── PhenoAge 核心（必填）
  { key: "albumin",          label: "白蛋白",              unit: "g/L",     required: true,  hint: "正常 35–55",          min: 15,   max: 70,   step: 0.1,  group: "core" },
  { key: "creatinine",       label: "肌酐",                unit: "μmol/L",  required: true,  hint: "男44–133，女44–106",  min: 20,   max: 800,  step: 1,    group: "core" },
  { key: "glucose",          label: "空腹血糖",             unit: "mmol/L",  required: true,  hint: "正常 3.9–6.1",        min: 2,    max: 30,   step: 0.1,  group: "core" },
  { key: "crp",              label: "超敏C反应蛋白",        unit: "mg/L",    required: true,  hint: "<3.0 正常",           min: 0.01, max: 100,  step: 0.01, group: "core" },
  { key: "lymphPct",         label: "淋巴细胞百分比",       unit: "%",       required: true,  hint: "正常 20–40",          min: 1,    max: 80,   step: 0.1,  group: "core" },
  { key: "mcv",              label: "红细胞平均体积 (MCV)", unit: "fL",      required: true,  hint: "正常 80–100",         min: 50,   max: 130,  step: 0.1,  group: "core" },
  { key: "rdw",              label: "红细胞分布宽度 (RDW)", unit: "%",       required: true,  hint: "正常 11.5–14.5",      min: 8,    max: 30,   step: 0.1,  group: "core" },
  { key: "alp",              label: "碱性磷酸酶 (ALP)",     unit: "U/L",     required: true,  hint: "正常 45–135",         min: 10,   max: 1000, step: 1,    group: "core" },
  { key: "wbc",              label: "白细胞计数",           unit: "×10⁹/L", required: true,  hint: "正常 3.5–9.5",        min: 0.5,  max: 30,   step: 0.01, group: "core" },
  // ── 扩展（选填，提升6维精度）
  { key: "hemoglobin",       label: "血红蛋白",             unit: "g/L",     required: false, hint: "男130–175，女115–150",min: 50,   max: 200,  step: 1,    group: "extended" },
  { key: "platelets",        label: "血小板",               unit: "×10⁹/L", required: false, hint: "正常 100–400",        min: 30,   max: 1000, step: 1,    group: "extended" },
  { key: "alt",              label: "谷丙转氨酶 (ALT)",     unit: "U/L",     required: false, hint: "男<50，女<40",        min: 1,    max: 500,  step: 1,    group: "extended" },
  { key: "ast",              label: "谷草转氨酶 (AST)",     unit: "U/L",     required: false, hint: "<40",                 min: 1,    max: 500,  step: 1,    group: "extended" },
  { key: "ggt",              label: "谷氨酰转肽酶 (GGT)",   unit: "U/L",     required: false, hint: "男<50，女<35",        min: 1,    max: 500,  step: 1,    group: "extended" },
  { key: "hba1c",            label: "糖化血红蛋白 (HbA1c)", unit: "%",       required: false, hint: "<5.7% 正常",          min: 3,    max: 15,   step: 0.1,  group: "extended" },
  { key: "triglycerides",    label: "甘油三酯",             unit: "mmol/L",  required: false, hint: "<1.7 正常",           min: 0.1,  max: 30,   step: 0.01, group: "extended" },
  { key: "totalCholesterol", label: "总胆固醇",             unit: "mmol/L",  required: false, hint: "<5.2 合适",           min: 1,    max: 15,   step: 0.01, group: "extended" },
  { key: "ldl",              label: "低密度脂蛋白 (LDL)",   unit: "mmol/L",  required: false, hint: "<3.4 正常",           min: 0.5,  max: 10,   step: 0.01, group: "extended" },
  { key: "hdl",              label: "高密度脂蛋白 (HDL)",   unit: "mmol/L",  required: false, hint: "男≥1.0，女≥1.3",     min: 0.2,  max: 4,    step: 0.01, group: "extended" },
  { key: "uricAcid",         label: "尿酸",                 unit: "μmol/L",  required: false, hint: "男<420，女<360",      min: 100,  max: 900,  step: 1,    group: "extended" },
  { key: "bun",              label: "尿素氮 (BUN)",         unit: "mmol/L",  required: false, hint: "正常 2.5–7.5",        min: 0.5,  max: 40,   step: 0.1,  group: "extended" },
];

// ─── CBA 评估结果 ─────────────────────────────────────────────────────────────
export interface CBAOrganAges {
  "代谢健康":   number;
  "炎症状态":   number;
  "肾脏功能":   number;
  "肝脏功能":   number;
  "心血管健康": number;
  "血液健康":   number;
}

export interface CBAResults {
  actualAge:      number;
  gender:         "male" | "female";
  phenoAge:       number;         // Levine 2018 PhenoAge，精确到0.1岁
  agingRate:      number;         // phenoAge / actualAge
  peerPercentile: number;         // 同龄排名百分位 1–99
  organAges:      CBAOrganAges;
  biomarkers:     CBABiomarkers;
  assessmentCode: string;         // "CBA-XXXX"
  l1RefCode?:     string;         // L1 PLA 绑定编号（URL ?ref=BCA-XXXX）
  completedAt:    string;
}

// ─── 风险等级 ─────────────────────────────────────────────────────────────────
export type OrganRiskLevel = "optimal" | "normal" | "elevated" | "high";

export function getOrganRiskLevel(delta: number): OrganRiskLevel {
  if (delta <= -2) return "optimal";
  if (delta <= 2)  return "normal";
  if (delta <= 6)  return "elevated";
  return "high";
}

export const ORGAN_RISK_LABELS: Record<OrganRiskLevel, string> = {
  optimal:  "优秀",
  normal:   "正常",
  elevated: "偏高",
  high:     "需关注",
};

export const ORGAN_RISK_HEX: Record<OrganRiskLevel, string> = {
  optimal:  "#0D7A5F",
  normal:   "#B8860B",
  elevated: "#B8860B",
  high:     "#9B2335",
};

// ─── 提交 payload ─────────────────────────────────────────────────────────────
export interface CBASubmitPayload {
  assessmentCode:  string;
  l1RefCode?:      string;
  name?:           string;         // 仅模式B（独立用户）需要
  phoneSuffix:     string;         // 手机后4位
  actualAge:       number;
  gender:          "male" | "female";
  phenoAge:        number;
  organAges:       CBAOrganAges;
  biomarkers:      CBABiomarkers;
}
