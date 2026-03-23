"use client";
// [CHANGE 2026-03-23] 原因：CBA 指标录入页，两步混合模式（上传+AI提取/手动填写）| 影响范围：src/app/cba/upload/page.tsx（新建）

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useCBA } from "@/context/CBAContext";
import { AssessmentHeader } from "@/components/AssessmentHeader";
import { CTAButton } from "@/components/CTAButton";
import { calculateCBAResults } from "@/lib/phenoage";
import { BIOMARKER_FIELDS } from "@/types/cba";
import type { CBABiomarkers } from "@/types/cba";
import {
  Upload, FileText, X, ChevronDown, ChevronUp,
  Loader2, AlertCircle, CheckCircle2
} from "lucide-react";
import { cn } from "@/lib/utils";

type UploadStep = "upload" | "form";

const REQUIRED_KEYS = BIOMARKER_FIELDS.filter(f => f.required).map(f => f.key);
const CORE_FIELDS   = BIOMARKER_FIELDS.filter(f => f.group === "core");
const EXT_FIELDS    = BIOMARKER_FIELDS.filter(f => f.group === "extended");

export default function CBAUploadPage() {
  const router = useRouter();
  const { setBiomarkers, setResults, setL1RefCode, l1RefCode } = useCBA();

  // ── URL 参数读取 ──────────────────────────────────────────────────────────
  const [refCode, setRefCode] = useState<string | null>(null);
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref    = params.get("ref");
    setRefCode(ref);
    setL1RefCode(ref);
  }, [setL1RefCode]);

  // ── 用户基础信息 ──────────────────────────────────────────────────────────
  const [age,    setAge]    = useState("");
  const [gender, setGender] = useState<"male" | "female">("male");

  // ── 文件上传 ──────────────────────────────────────────────────────────────
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files,       setFiles]       = useState<File[]>([]);
  const [uploadStep,  setUploadStep]  = useState<UploadStep>("upload");
  const [uploading,   setUploading]   = useState(false);
  const [uploadError, setUploadError] = useState("");

  // ── 指标表单 ──────────────────────────────────────────────────────────────
  const [values,      setValues]      = useState<Partial<Record<keyof CBABiomarkers, string>>>({});
  const [showExt,     setShowExt]     = useState(false);
  const [formError,   setFormError]   = useState("");
  const [submitting,  setSubmitting]  = useState(false);

  // ─── 文件处理 ─────────────────────────────────────────────────────────────
  function handleFileDrop(e: React.DragEvent) {
    e.preventDefault();
    addFiles(Array.from(e.dataTransfer.files));
  }

  function addFiles(incoming: File[]) {
    const accepted = incoming.filter(f =>
      ["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(f.type)
    );
    setFiles(prev => {
      const combined = [...prev, ...accepted];
      return combined.slice(0, 10); // 最多10个文件
    });
  }

  function removeFile(idx: number) {
    setFiles(prev => prev.filter((_, i) => i !== idx));
  }

  // ─── Step 1：触发 AI 提取（或跳过直接手动填写）────────────────────────────
  async function handleAIExtract() {
    if (files.length === 0) {
      // 直接跳到手动填写
      setUploadStep("form");
      return;
    }
    setUploading(true);
    setUploadError("");
    try {
      const formData = new FormData();
      files.forEach(f => formData.append("files", f));

      const res  = await fetch("/api/cba/analyze", { method: "POST", body: formData });
      const json = await res.json();

      if (json.ok && json.biomarkers) {
        // 将 AI 提取结果填入表单（用户可修改）
        const extracted: Partial<Record<keyof CBABiomarkers, string>> = {};
        for (const [k, v] of Object.entries(json.biomarkers)) {
          if (v !== null && v !== undefined) {
            extracted[k as keyof CBABiomarkers] = String(v);
          }
        }
        setValues(extracted);
      }
    } catch {
      setUploadError("AI 提取失败，请手动填写或重试。");
    } finally {
      setUploading(false);
      setUploadStep("form");
    }
  }

  // ─── Step 2：表单提交，计算结果 ────────────────────────────────────────────
  function handleFormSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError("");

    const ageNum = parseInt(age);
    if (!age || isNaN(ageNum) || ageNum < 18 || ageNum > 110) {
      setFormError("请输入有效年龄（18–110岁）。"); return;
    }

    // 检查必填项
    const missing = REQUIRED_KEYS.filter(k => !values[k] || values[k] === "");
    if (missing.length > 0) {
      const labels = CORE_FIELDS.filter(f => missing.includes(f.key)).map(f => f.label);
      setFormError(`以下必填项尚未填写：${labels.join("、")}`); return;
    }

    // 解析数值
    const parsed: Partial<CBABiomarkers> = {};
    for (const [k, v] of Object.entries(values)) {
      const num = parseFloat(v as string);
      if (!isNaN(num)) parsed[k as keyof CBABiomarkers] = num;
    }

    // 数值合理性校验（防止单位填错）
    const core = parsed as CBABiomarkers;
    if (core.albumin > 100) {
      setFormError("白蛋白单位应为 g/L（正常35–55），请检查填写是否正确。"); return;
    }
    if (core.glucose > 50) {
      setFormError("空腹血糖单位应为 mmol/L（正常3.9–6.1），请检查填写是否正确。"); return;
    }

    setSubmitting(true);
    setBiomarkers(parsed);

    const results = calculateCBAResults({
      biomarkers: parsed as CBABiomarkers,
      actualAge:  ageNum,
      gender,
      l1RefCode:  refCode ?? undefined,
    });
    setResults(results);

    const params = new URLSearchParams(window.location.search);
    const ref    = params.get("ref");
    router.push(ref ? `/cba/preview?ref=${encodeURIComponent(ref)}` : "/cba/preview");
  }

  // ─── 表单 input 样式 ──────────────────────────────────────────────────────
  const fieldClass =
    "w-full h-12 px-3 rounded-xl border border-clinical-border bg-white text-base " +
    "text-clinical-navy placeholder:text-clinical-muted focus:outline-none " +
    "focus:ring-2 focus:ring-clinical-jade/40 transition";

  // ─── UI ───────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-clinical-bg flex flex-col">
      <AssessmentHeader
        progress={uploadStep === "upload" ? 30 : 65}
        stepLabel={uploadStep === "upload" ? "步骤 1 / 2 · 上传报告" : "步骤 2 / 2 · 填写指标"}
      />

      <main className="flex-1 flex flex-col items-center px-5 pt-20 pb-16">
        <div className="max-w-sm w-full">

          {/* ── Step 1：上传文件 ──────────────────────────────────────────── */}
          {uploadStep === "upload" && (
            <div className="animate-fade-up">
              <p className="text-[10px] tracking-[5px] uppercase text-clinical-jade font-medium mb-4">
                步骤 1 / 2
              </p>
              <h2 className="font-display text-2xl text-clinical-navy mb-1">
                上传体检报告
              </h2>
              <p className="text-sm text-clinical-secondary mb-5 leading-relaxed">
                支持血常规、生化全套、血脂等多张报告（JPG / PNG / PDF）。<br />
                AI 自动识别指标，您可在下一步确认修改。
              </p>

              {/* 拖拽区域 */}
              <div
                className={cn(
                  "border-2 border-dashed border-clinical-border rounded-2xl p-6 mb-4",
                  "flex flex-col items-center gap-3 cursor-pointer transition hover:border-clinical-jade/50 hover:bg-clinical-jade/5",
                  files.length > 0 && "border-clinical-jade/40 bg-clinical-jade/5"
                )}
                onDragOver={e => e.preventDefault()}
                onDrop={handleFileDrop}
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  multiple
                  className="hidden"
                  onChange={e => addFiles(Array.from(e.target.files ?? []))}
                />
                <Upload className="w-8 h-8 text-clinical-jade" strokeWidth={1.5} />
                <div className="text-center">
                  <p className="text-sm font-medium text-clinical-navy">拖拽或点击上传</p>
                  <p className="text-[11px] text-clinical-muted mt-0.5">JPG · PNG · PDF，最多10个文件</p>
                </div>
              </div>

              {/* 已选文件列表 */}
              {files.length > 0 && (
                <div className="space-y-1.5 mb-4">
                  {files.map((f, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2.5 bg-white border border-clinical-border rounded-xl px-3 py-2"
                    >
                      <FileText className="w-3.5 h-3.5 text-clinical-jade shrink-0" strokeWidth={1.5} />
                      <span className="text-xs text-clinical-secondary truncate flex-1">{f.name}</span>
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-clinical-muted hover:text-clinical-danger transition"
                      >
                        <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {uploadError && (
                <div className="flex items-start gap-2 bg-clinical-amber-lt border border-clinical-amber/20 rounded-xl px-3 py-2 mb-4">
                  <AlertCircle className="w-3.5 h-3.5 text-clinical-amber mt-0.5 shrink-0" strokeWidth={1.5} />
                  <p className="text-xs text-clinical-amber">{uploadError}</p>
                </div>
              )}

              <CTAButton
                fullWidth size="lg"
                loading={uploading}
                onClick={handleAIExtract}
              >
                {uploading
                  ? "AI 识别中…"
                  : files.length > 0
                  ? `识别 ${files.length} 个文件，进入指标确认`
                  : "跳过上传，直接手动填写指标 →"}
              </CTAButton>
            </div>
          )}

          {/* ── Step 2：指标填写/确认 ────────────────────────────────────── */}
          {uploadStep === "form" && (
            <form onSubmit={handleFormSubmit} className="animate-fade-up">
              <p className="text-[10px] tracking-[5px] uppercase text-clinical-jade font-medium mb-4">
                步骤 2 / 2
              </p>
              <h2 className="font-display text-2xl text-clinical-navy mb-1">
                确认 / 填写指标
              </h2>
              <p className="text-sm text-clinical-secondary mb-5 leading-relaxed">
                {Object.keys(values).length > 0
                  ? "AI 已识别以下数值，请核对并补充缺失项。"
                  : "请从您的体检报告中找到以下指标并填写。"}
              </p>

              {/* 基本信息 */}
              <div className="clinical-card p-4 mb-4 space-y-3">
                <p className="text-[9px] uppercase tracking-[3px] text-clinical-muted">基本信息</p>

                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-clinical-muted mb-1.5">
                    年龄 *
                  </label>
                  <input
                    className={fieldClass}
                    type="number"
                    placeholder="请输入您的年龄（岁）"
                    value={age}
                    min={18} max={110}
                    onChange={e => setAge(e.target.value)}
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase tracking-widest text-clinical-muted mb-1.5">
                    性别 *
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {(["male", "female"] as const).map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGender(g)}
                        className={cn(
                          "h-11 rounded-xl border text-sm font-medium transition",
                          gender === g
                            ? "border-clinical-jade bg-clinical-jade text-white"
                            : "border-clinical-border bg-white text-clinical-navy hover:border-clinical-jade/50"
                        )}
                      >
                        {g === "male" ? "男" : "女"}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 核心指标（必填9项）*/}
              <div className="clinical-card p-4 mb-4">
                <p className="text-[9px] uppercase tracking-[3px] text-clinical-muted mb-3">
                  核心指标（必填）
                </p>
                <div className="space-y-3">
                  {CORE_FIELDS.map(field => {
                    const val       = values[field.key] ?? "";
                    const extracted = Object.prototype.hasOwnProperty.call(values, field.key);
                    return (
                      <div key={field.key}>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-[10px] uppercase tracking-widest text-clinical-muted">
                            {field.label} *
                          </label>
                          <div className="flex items-center gap-1.5">
                            {extracted && val !== "" && (
                              <span className="flex items-center gap-0.5 text-[9px] text-clinical-jade">
                                <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={2} />
                                AI 已识别
                              </span>
                            )}
                            <span className="text-[10px] text-clinical-muted">{field.unit}</span>
                          </div>
                        </div>
                        <input
                          className={cn(fieldClass, extracted && val !== "" && "border-clinical-jade/40")}
                          type="number"
                          placeholder={field.hint}
                          value={val}
                          step={field.step}
                          min={field.min}
                          max={field.max}
                          onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 扩展指标（可选）*/}
              <div className="clinical-card p-4 mb-4">
                <button
                  type="button"
                  className="w-full flex items-center justify-between"
                  onClick={() => setShowExt(v => !v)}
                >
                  <div>
                    <p className="text-[9px] uppercase tracking-[3px] text-clinical-muted text-left">
                      扩展指标（可选，提升6维精度）
                    </p>
                    <p className="text-[10px] text-clinical-secondary mt-0.5 text-left">
                      肝功能 · 血脂 · 尿酸 · 血红蛋白等
                    </p>
                  </div>
                  {showExt
                    ? <ChevronUp className="w-4 h-4 text-clinical-muted" strokeWidth={1.5} />
                    : <ChevronDown className="w-4 h-4 text-clinical-muted" strokeWidth={1.5} />}
                </button>

                {showExt && (
                  <div className="space-y-3 mt-4 pt-4 border-t border-clinical-border">
                    {EXT_FIELDS.map(field => {
                      const val       = values[field.key] ?? "";
                      const extracted = Object.prototype.hasOwnProperty.call(values, field.key);
                      return (
                        <div key={field.key}>
                          <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] uppercase tracking-widest text-clinical-muted">
                              {field.label}
                            </label>
                            <div className="flex items-center gap-1.5">
                              {extracted && val !== "" && (
                                <span className="flex items-center gap-0.5 text-[9px] text-clinical-jade">
                                  <CheckCircle2 className="w-2.5 h-2.5" strokeWidth={2} />
                                  AI 已识别
                                </span>
                              )}
                              <span className="text-[10px] text-clinical-muted">{field.unit}</span>
                            </div>
                          </div>
                          <input
                            className={cn(fieldClass, extracted && val !== "" && "border-clinical-jade/40")}
                            type="number"
                            placeholder={field.hint}
                            value={val}
                            step={field.step}
                            min={field.min}
                            max={field.max}
                            onChange={e => setValues(prev => ({ ...prev, [field.key]: e.target.value }))}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {formError && (
                <div className="flex items-start gap-2 bg-clinical-danger-lt border border-clinical-danger/20 rounded-xl px-3 py-2 mb-4">
                  <AlertCircle className="w-3.5 h-3.5 text-clinical-danger mt-0.5 shrink-0" strokeWidth={1.5} />
                  <p className="text-xs text-clinical-danger">{formError}</p>
                </div>
              )}

              <div className="space-y-2">
                <CTAButton type="submit" fullWidth size="lg" loading={submitting}>
                  {submitting ? "计算中…" : "计算我的器官生物年龄 →"}
                </CTAButton>
                <CTAButton
                  type="button"
                  variant="ghost"
                  fullWidth
                  onClick={() => setUploadStep("upload")}
                >
                  ← 返回上传文件
                </CTAButton>
              </div>

              <p className="text-[10px] text-clinical-muted text-center mt-3 leading-relaxed">
                填写越完整，器官年龄评估越精准。扩展指标建议尽量填写。
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
