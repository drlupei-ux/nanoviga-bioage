// [CHANGE 2026-03-23] 原因：实现 L2 CBA PhenoAge 算法（Levine 2018）+ 6维器官年龄计算 | 影响范围：src/lib/phenoage.ts（新建）

import type { CBABiomarkers, CBAOrganAges, CBAResults } from "@/types/cba";

// ─── 随机4位评估码 ──────────────────────────────────────────────────────────────
function genCBACode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "CBA-";
  for (let i = 0; i < 4; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ─── PhenoAge 算法（Levine 2018, Nature Aging）────────────────────────────────
// 输入单位：中国临床单位（g/L, μmol/L, mmol/L, mg/L, %, fL, U/L, ×10⁹/L）
// 内部转换为论文使用的美制单位再计算

export function calcPhenoAge(b: CBABiomarkers): number {
  // 单位转换
  const albumin_gdL    = b.albumin    / 10;          // g/L  → g/dL
  const creatinine_mgdL= b.creatinine / 88.4;        // μmol/L → mg/dL
  const glucose_mgdL   = b.glucose    * 18.016;       // mmol/L → mg/dL
  const crp_mgdL       = b.crp        / 10;           // mg/L → mg/dL
  const lnCRP          = Math.log(Math.max(crp_mgdL, 0.001));

  const xb =
    -19.9067
    - 0.0336  * albumin_gdL
    + 0.0095  * creatinine_mgdL
    + 0.1953  * glucose_mgdL
    + 0.0954  * lnCRP
    - 0.0120  * b.lymphPct
    + 0.0268  * b.mcv
    + 0.3306  * b.rdw
    + 0.00188 * b.alp
    + 0.0554  * b.wbc;

  const gamma = 0.0076927;
  const mortalityScore = 1 - Math.exp(-Math.exp(xb) * (Math.exp(120 * gamma) - 1) / gamma);

  // 防止数学溢出（mortalityScore 极接近 0 或 1 时）
  const safeMS = clamp(mortalityScore, 1e-6, 1 - 1e-6);
  const phenoAge = 141.50 + Math.log(-0.00553 * Math.log(1 - safeMS)) / 0.09165;

  return Math.round(clamp(phenoAge, 10, 120) * 10) / 10;
}

// ─── 器官维度风险评分辅助 ─────────────────────────────────────────────────────
// 返回 0–4 风险单位：0=优秀, 1=正常偏好, 2=正常偏差, 3=轻度异常, 4=显著异常
// higher=worse 参数：true=值越高越危险（如LDL）, false=值越低越危险（如HDL）

function riskUnitsRange(
  value: number,
  optLow: number, optHigh: number,   // 最优区间
  normalLow: number, normalHigh: number  // 参考范围边界
): number {
  if (value >= optLow && value <= optHigh) return 0;
  const belowOpt = value < optLow ? (optLow - value) / (optLow - normalLow + 1e-9) : 0;
  const aboveOpt = value > optHigh ? (value - optHigh) / (normalHigh - optHigh + 1e-9) : 0;
  const deviation = Math.max(belowOpt, aboveOpt);
  return clamp(deviation * 3, 0, 4);
}

function riskUnitsHigh(value: number, optMax: number, dangerThreshold: number): number {
  if (value <= optMax) return 0;
  return clamp((value - optMax) / (dangerThreshold - optMax + 1e-9) * 3, 0, 4);
}

function riskUnitsLow(value: number, optMin: number, dangerThreshold: number): number {
  if (value >= optMin) return 0;
  return clamp((optMin - value) / (optMin - dangerThreshold + 1e-9) * 3, 0, 4);
}

// ─── 6维器官年龄计算 ───────────────────────────────────────────────────────────

function calcOrganAge(actualAge: number, meanRisk: number): number {
  // meanRisk 0 → 优秀（年轻2岁），1 → 正常（相当），2 → 偏高（老3岁），3+ → 高风险
  const ageFactor = actualAge < 35 ? 0.8 : actualAge < 45 ? 1.0 : actualAge < 55 ? 1.2 : 1.5;
  const delta = (meanRisk - 0.6) * 3.5 * ageFactor;
  return Math.round(clamp(actualAge + delta, actualAge - 12, actualAge + 20));
}

function metabolicAge(b: CBABiomarkers, actualAge: number): number {
  const risks: number[] = [];
  // 血糖
  risks.push(riskUnitsHigh(b.glucose, 5.6, 10));
  // HbA1c（若有）
  if (b.hba1c != null)         risks.push(riskUnitsHigh(b.hba1c, 5.7, 9));
  // 甘油三酯（若有）
  if (b.triglycerides != null) risks.push(riskUnitsHigh(b.triglycerides, 1.7, 5.6));
  // HDL（若有）—— 低则高风险
  if (b.hdl != null)           risks.push(riskUnitsLow(b.hdl, 1.0, 0.5));
  const mean = risks.reduce((a, v) => a + v, 0) / risks.length;
  return calcOrganAge(actualAge, mean);
}

function inflammationAge(b: CBABiomarkers, actualAge: number): number {
  const risks: number[] = [
    riskUnitsHigh(b.crp, 1.0, 10),
    riskUnitsRange(b.wbc, 4.0, 7.0, 3.5, 9.5),
    riskUnitsRange(b.lymphPct, 25, 35, 20, 40),
  ];
  const mean = risks.reduce((a, v) => a + v, 0) / risks.length;
  return calcOrganAge(actualAge, mean);
}

function renalAge(b: CBABiomarkers, actualAge: number, gender: "male" | "female"): number {
  const risks: number[] = [];
  // 肌酐（与性别相关上限）
  const creatMax = gender === "male" ? 115 : 97;
  risks.push(riskUnitsHigh(b.creatinine, creatMax * 0.85, creatMax * 1.3));
  // 尿酸（若有）
  if (b.uricAcid != null) {
    const uaMax = gender === "male" ? 360 : 300;
    risks.push(riskUnitsHigh(b.uricAcid, uaMax, uaMax * 1.3));
  }
  // 尿素氮（若有）
  if (b.bun != null) risks.push(riskUnitsHigh(b.bun, 7.5, 20));
  const mean = risks.reduce((a, v) => a + v, 0) / risks.length;
  return calcOrganAge(actualAge, mean);
}

function hepaticAge(b: CBABiomarkers, actualAge: number, gender: "male" | "female"): number {
  const risks: number[] = [
    riskUnitsLow(b.albumin, 40, 30),   // 白蛋白过低是风险
  ];
  if (b.alt != null) {
    const altMax = gender === "male" ? 50 : 40;
    risks.push(riskUnitsHigh(b.alt, altMax, altMax * 3));
  }
  if (b.ast != null) risks.push(riskUnitsHigh(b.ast, 40, 120));
  if (b.ggt != null) {
    const ggtMax = gender === "male" ? 50 : 35;
    risks.push(riskUnitsHigh(b.ggt, ggtMax, ggtMax * 3));
  }
  const mean = risks.reduce((a, v) => a + v, 0) / risks.length;
  return calcOrganAge(actualAge, mean);
}

function cardiovascularAge(b: CBABiomarkers, actualAge: number): number {
  const risks: number[] = [];
  if (b.totalCholesterol != null) risks.push(riskUnitsHigh(b.totalCholesterol, 5.2, 7.5));
  if (b.ldl != null)              risks.push(riskUnitsHigh(b.ldl, 3.4, 5.0));
  if (b.hdl != null)              risks.push(riskUnitsLow(b.hdl, 1.0, 0.5));
  if (b.triglycerides != null)    risks.push(riskUnitsHigh(b.triglycerides, 1.7, 5.6));
  // 若心血管指标均无，使用血糖作为代理
  if (risks.length === 0)         risks.push(riskUnitsHigh(b.glucose, 5.6, 10));
  const mean = risks.reduce((a, v) => a + v, 0) / risks.length;
  return calcOrganAge(actualAge, mean);
}

function hematologicalAge(b: CBABiomarkers, actualAge: number, gender: "male" | "female"): number {
  const risks: number[] = [
    riskUnitsRange(b.mcv, 82, 92, 80, 100),
    riskUnitsHigh(b.rdw, 13.5, 17),
  ];
  if (b.hemoglobin != null) {
    const hgbMin = gender === "male" ? 130 : 115;
    risks.push(riskUnitsLow(b.hemoglobin, hgbMin, hgbMin - 30));
  }
  if (b.platelets != null) risks.push(riskUnitsRange(b.platelets, 150, 350, 100, 400));
  const mean = risks.reduce((a, v) => a + v, 0) / risks.length;
  return calcOrganAge(actualAge, mean);
}

// ─── 主计算函数 ─────────────────────────────────────────────────────────────────

export interface CalcCBAInput {
  biomarkers:  CBABiomarkers;
  actualAge:   number;
  gender:      "male" | "female";
  l1RefCode?:  string;
}

export function calculateCBAResults(input: CalcCBAInput): CBAResults {
  const { biomarkers, actualAge, gender, l1RefCode } = input;

  const phenoAge = calcPhenoAge(biomarkers);

  const organAges: CBAOrganAges = {
    "代谢健康":   metabolicAge(biomarkers, actualAge),
    "炎症状态":   inflammationAge(biomarkers, actualAge),
    "肾脏功能":   renalAge(biomarkers, actualAge, gender),
    "肝脏功能":   hepaticAge(biomarkers, actualAge, gender),
    "心血管健康": cardiovascularAge(biomarkers, actualAge),
    "血液健康":   hematologicalAge(biomarkers, actualAge, gender),
  };

  const agingRate      = Math.round((phenoAge / actualAge) * 100) / 100;
  const ageDiff        = actualAge - phenoAge;
  const peerPercentile = clamp(Math.round(50 - ageDiff * 3.5), 1, 99);

  return {
    actualAge,
    gender,
    phenoAge,
    agingRate,
    peerPercentile,
    organAges,
    biomarkers,
    assessmentCode: genCBACode(),
    l1RefCode,
    completedAt: new Date().toISOString(),
  };
}
