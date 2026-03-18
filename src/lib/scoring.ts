import type { AssessmentResults, UserProfile } from "@/types/assessment";
import { getAgingStatus } from "@/types/assessment";
import { questions } from "./questions";

export function computeAge(birthYear: number, birthMonth: number): number {
  const now = new Date();
  let age = now.getFullYear() - birthYear;
  if (now.getMonth() + 1 < birthMonth) age -= 1;
  return Math.max(18, Math.min(80, age));
}

export function computeBMIAdjustment(height: number, weight: number): number {
  const bmi = weight / ((height / 100) ** 2);
  if (bmi < 18.5) return 1.0;
  if (bmi < 23.0) return -1.5;
  if (bmi < 25.0) return 0;
  if (bmi < 27.5) return 1.0;
  if (bmi < 30.0) return 2.5;
  return 4.0;
}

function getAgeFactor(age: number): number {
  if (age < 35) return 0.8;
  if (age < 45) return 1.0;
  if (age < 55) return 1.2;
  return 1.5;
}

export function calculateResults(
  profile: UserProfile,
  answers: number[]
): AssessmentResults {
  const actualAge = computeAge(profile.birthYear, profile.birthMonth);
  const dims = [...new Set(questions.map((q) => q.dimension))];

  const dimensionScores: Record<string, number> = {};
  dims.forEach((dim) => {
    const dimQs = questions.reduce<number[]>((acc, q, i) => {
      if (q.dimension === dim) acc.push(answers[i] ?? 0);
      return acc;
    }, []);
    const avg = dimQs.reduce((a, b) => a + b, 0) / dimQs.length;
    dimensionScores[dim] = Math.round(avg * 10) / 10;
  });

  const totalScore =
    Object.values(dimensionScores).reduce((a, b) => a + b, 0) /
    dims.length *
    10;

  const ageFactor = getAgeFactor(actualAge);
  const delta = ((totalScore - 50) / 5) * ageFactor;
  const genScore = dimensionScores["遗传因素"] ?? 5;
  const geneticPenalty = genScore < 5 ? (5 - genScore) * 0.3 : 0;
  const bmiAdj = computeBMIAdjustment(profile.height, profile.weight);

  const bioAge = Math.max(
    actualAge - 15,
    Math.min(actualAge + 18, Math.round(actualAge - delta + geneticPenalty + bmiAdj * 0.3))
  );

  const agingRate = actualAge > 0 ? parseFloat((bioAge / actualAge).toFixed(2)) : 1.0;
  const diff = actualAge - bioAge;
  const peerPercentile = Math.max(1, Math.min(99, Math.round(50 - diff * 3.5)));
  const agingStatus = getAgingStatus(diff);
  const assessmentCode =
    "BCA-" + Math.random().toString(36).substr(2, 4).toUpperCase();

  return {
    profile,
    dimensionScores,
    totalScore,
    bioAge,
    actualAge,
    agingRate,
    peerPercentile,
    agingStatus,
    assessmentCode,
    completedAt: new Date().toISOString(),
  };
}
