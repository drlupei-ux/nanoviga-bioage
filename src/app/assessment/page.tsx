"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAssessment } from "@/context/AssessmentContext";
import { questions } from "@/lib/questions";
import { calculateResults } from "@/lib/scoring";
import { DOMAIN_LABELS } from "@/types/assessment";
import { AssessmentHeader } from "@/components/AssessmentHeader";
import { CTAButton } from "@/components/CTAButton";
import { cn } from "@/lib/utils";
import { ChevronLeft } from "lucide-react";

// ── 基本信息表单 ───────────────────────────────────────────────────────────────
function ProfileForm({ onDone }: { onDone: (p: Parameters<ReturnType<typeof useAssessment>["setProfile"]>[0]) => void }) {
  const currentYear = new Date().getFullYear();

  const [name,       setName]       = useState("");
  const [birthYear,  setBirthYear]  = useState("");
  const [birthMonth, setBirthMonth] = useState("");
  const [gender,     setGender]     = useState<"male" | "female" | "">("");
  const [height,     setHeight]     = useState("");
  const [weight,     setWeight]     = useState("");
  const [error,      setError]      = useState("");

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const by = parseInt(birthYear);
    const bm = parseInt(birthMonth);
    const h  = parseFloat(height);
    const w  = parseFloat(weight);

    if (!by || by < 1920 || by > currentYear - 18)
      return setError("请输入有效的出生年份（需年满18周岁）。");
    if (!bm || bm < 1 || bm > 12)
      return setError("请输入有效的出生月份（1～12）。");
    if (!gender)
      return setError("请选择生理性别。");
    if (!h || h < 100 || h > 250)
      return setError("请输入有效身高（单位：厘米）。");
    if (!w || w < 30 || w > 250)
      return setError("请输入有效体重（单位：公斤）。");

    setError("");
    onDone({
      name:       name.trim() || undefined,
      birthYear:  by,
      birthMonth: bm,
      gender:     gender as "male" | "female",
      height:     h,
      weight:     w,
    });
  }

  const fieldClass = "w-full h-10 px-3 rounded-xl border border-clinical-border bg-white text-sm text-clinical-navy placeholder:text-clinical-muted focus:outline-none focus:ring-2 focus:ring-clinical-jade/40 transition";

  return (
    <div className="min-h-screen bg-clinical-bg flex flex-col">
      <AssessmentHeader />

      <main className="flex-1 flex flex-col items-center justify-center px-5 pt-20 pb-12">
        <div className="max-w-sm w-full animate-fade-up">
          <p className="text-[10px] tracking-[5px] uppercase text-clinical-jade font-medium mb-4">
            基本信息
          </p>
          <h2 className="font-display text-2xl text-clinical-navy mb-1">
            建立您的健康档案
          </h2>
          <p className="text-sm text-clinical-secondary mb-8 leading-relaxed">
            以下信息用于校准您的表型年龄指数，所有数据仅存储在本设备。
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 姓名 — 选填 */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-clinical-muted mb-1.5">
                姓名 <span className="normal-case text-clinical-muted/70">（选填）</span>
              </label>
              <input
                className={fieldClass}
                placeholder="请输入您的姓名"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>

            {/* 出生年份 + 月份 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-clinical-muted mb-1.5">
                  出生年份 *
                </label>
                <input
                  className={fieldClass}
                  placeholder="1980"
                  type="number"
                  min={1920}
                  max={currentYear - 18}
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-clinical-muted mb-1.5">
                  出生月份 *
                </label>
                <input
                  className={fieldClass}
                  placeholder="1～12"
                  type="number"
                  min={1}
                  max={12}
                  value={birthMonth}
                  onChange={(e) => setBirthMonth(e.target.value)}
                />
              </div>
            </div>

            {/* 生理性别 */}
            <div>
              <label className="block text-[10px] uppercase tracking-widest text-clinical-muted mb-2">
                生理性别 *
              </label>
              <div className="grid grid-cols-2 gap-3">
                {(["male", "female"] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setGender(s)}
                    className={cn(
                      "h-10 rounded-xl border text-sm font-medium transition-all",
                      gender === s
                        ? "bg-clinical-jade text-white border-clinical-jade"
                        : "bg-white border-clinical-border text-clinical-secondary hover:bg-clinical-surface"
                    )}
                  >
                    {s === "male" ? "男" : "女"}
                  </button>
                ))}
              </div>
            </div>

            {/* 身高 + 体重 */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-clinical-muted mb-1.5">
                  身高（厘米）*
                </label>
                <input
                  className={fieldClass}
                  placeholder="170"
                  type="number"
                  min={100}
                  max={250}
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-[10px] uppercase tracking-widest text-clinical-muted mb-1.5">
                  体重（公斤）*
                </label>
                <input
                  className={fieldClass}
                  placeholder="70"
                  type="number"
                  min={30}
                  max={250}
                  value={weight}
                  onChange={(e) => setWeight(e.target.value)}
                />
              </div>
            </div>

            {error && (
              <p className="text-clinical-danger text-xs bg-clinical-danger-lt border border-clinical-danger/20 rounded-xl px-3 py-2">
                {error}
              </p>
            )}

            <CTAButton type="submit" fullWidth size="lg" className="mt-2">
              开始评估 →
            </CTAButton>
          </form>
        </div>
      </main>
    </div>
  );
}

// ── 问题卡片 ───────────────────────────────────────────────────────────────────
function QuestionCard({
  index,
  total,
  question,
  selected,
  onSelect,
}: {
  index:    number;
  total:    number;
  question: (typeof questions)[number];
  selected: number | undefined;
  onSelect: (score: number) => void;
}) {
  const progress  = Math.round(((index + 1) / total) * 100);
  const dimLabel  = DOMAIN_LABELS[question.dimension] ?? question.dimension;

  return (
    <div className="min-h-screen bg-clinical-bg flex flex-col">
      <AssessmentHeader
        progress={progress}
        stepLabel={`第 ${index + 1} / ${total} 题`}
      />

      <main className="flex-1 flex flex-col items-center px-5 pt-24 pb-12">
        <div className="max-w-md w-full animate-fade-up">
          {/* 维度标签 */}
          <p className="text-[9px] tracking-[4px] uppercase text-clinical-muted font-medium mb-3">
            {dimLabel}
          </p>

          {/* 题目 */}
          <p className="text-clinical-navy text-[15px] sm:text-base font-medium leading-relaxed mb-7">
            {question.text}
          </p>

          {/* 选项 */}
          <div className="space-y-2.5">
            {question.options.map((opt, oi) => (
              <button
                key={oi}
                onClick={() => onSelect(opt.score)}
                className={cn(
                  "w-full text-left px-4 py-3.5 rounded-2xl border transition-all duration-150",
                  "flex items-start gap-3 group",
                  selected === opt.score
                    ? "bg-clinical-jade text-white border-clinical-jade shadow-sm"
                    : "bg-white border-clinical-border text-clinical-secondary hover:border-clinical-jade/40 hover:bg-clinical-surface"
                )}
              >
                {/* 单选圆圈 */}
                <span className={cn(
                  "mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
                  selected === opt.score
                    ? "border-white"
                    : "border-clinical-border group-hover:border-clinical-jade/50"
                )}>
                  {selected === opt.score && (
                    <span className="w-1.5 h-1.5 rounded-full bg-white" />
                  )}
                </span>
                <span className="text-sm leading-relaxed">{opt.text}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}

// ── 主页面 ─────────────────────────────────────────────────────────────────────
export default function AssessmentPage() {
  const router = useRouter();
  const { profile, answers, setProfile, setAnswer, setResults } = useAssessment();

  const [step, setStep] = useState<"profile" | number>("profile");

  if (step === "profile") {
    return (
      <ProfileForm
        onDone={(p) => {
          setProfile(p);
          setStep(0);
        }}
      />
    );
  }

  const qIndex   = step as number;
  const question = questions[qIndex];

  function handleSelect(score: number) {
    setAnswer(qIndex, score);
    const next = qIndex + 1;
    if (next >= questions.length) {
      const res = calculateResults(profile!, [...answers.slice(0, qIndex), score]);
      setResults(res);
      router.push("/results");
    } else {
      setStep(next);
    }
  }

  function handleBack() {
    if (qIndex === 0) setStep("profile");
    else setStep(qIndex - 1);
  }

  return (
    <div className="relative">
      <QuestionCard
        index={qIndex}
        total={questions.length}
        question={question}
        selected={answers[qIndex]}
        onSelect={handleSelect}
      />
      {/* 返回按钮 */}
      <button
        onClick={handleBack}
        className="fixed bottom-6 left-5 flex items-center gap-1 text-[11px] text-clinical-muted hover:text-clinical-secondary transition-colors"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
        上一题
      </button>
    </div>
  );
}
