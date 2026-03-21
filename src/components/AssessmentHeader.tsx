"use client";
import { cn } from "@/lib/utils";

interface Props {
  progress?:   number;   // 0–100, undefined = hide bar
  stepLabel?:  string;   // e.g. "Q 4 / 29"
  hideRight?:  boolean;
}

export function AssessmentHeader({ progress, stepLabel, hideRight }: Props) {
  const showProgress = progress !== undefined;

  return (
    <header className="fixed top-0 left-0 right-0 z-50 h-14 bg-white/95 backdrop-blur border-b border-clinical-border flex items-center px-5 gap-4">

      {/* Logo */}
      <div className="flex items-center gap-2.5 shrink-0">
        <div className="w-7 h-7 rounded-full border border-clinical-gold flex items-center justify-content-center">
          <span className="text-clinical-gold font-display text-xs leading-none w-full text-center">B</span>
        </div>
        <div className="min-w-0">
          <div className="text-clinical-navy font-semibold text-xs tracking-[2px] leading-none whitespace-nowrap">
            <span className="sm:hidden">生命罗盘</span>
            <span className="hidden sm:inline">Bioage Compass 生命罗盘</span>
          </div>
          <div className="text-clinical-muted text-[9px] tracking-[1px] mt-0.5 leading-none whitespace-nowrap">
            陆大夫抗衰管理
          </div>
        </div>
      </div>

      {/* Progress bar — desktop: center; mobile: absolute strip at header bottom */}
      {showProgress && (
        <>
          {/* Desktop bar */}
          <div className="flex-1 min-w-0 mx-4 hidden sm:block">
            <div className="h-[1.5px] bg-clinical-border rounded-full overflow-hidden relative">
              <div
                className="h-full bg-gradient-to-r from-clinical-jade to-clinical-gold rounded-full transition-all duration-500 ease-out"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-[9px] text-clinical-muted tracking-widest text-center mt-1.5 uppercase">
              Assessment in Progress
            </p>
          </div>
          {/* Mobile thin strip at bottom of header */}
          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-clinical-border sm:hidden">
            <div
              className="h-full bg-gradient-to-r from-clinical-jade to-clinical-gold transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
        </>
      )}

      {/* Step counter — right */}
      {!hideRight && stepLabel && (
        <div className="ml-auto shrink-0">
          <span className="text-[10px] text-clinical-muted tracking-widest font-medium">
            {stepLabel}
          </span>
        </div>
      )}
      {/* "Assessment Report" — desktop only */}
      {!showProgress && !hideRight && (
        <div className="ml-auto shrink-0 hidden sm:block">
          <span className="text-[10px] text-clinical-muted tracking-widest uppercase">
            Assessment Report
          </span>
        </div>
      )}
    </header>
  );
}
