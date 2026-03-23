"use client";
// [CHANGE 2026-03-23] 原因：新增 L2 CBA 独立状态管理，不影响 L1 AssessmentContext | 影响范围：src/context/CBAContext.tsx（新建）

import React, { createContext, useContext, useState, useCallback } from "react";
import type { CBABiomarkers, CBAResults } from "@/types/cba";

interface CBACtx {
  biomarkers:    Partial<CBABiomarkers> | null;
  results:       CBAResults | null;
  l1RefCode:     string | null;   // URL ?ref=BCA-XXXX，mounted 后写入
  setBiomarkers: (b: Partial<CBABiomarkers>) => void;
  setResults:    (r: CBAResults) => void;
  setL1RefCode:  (code: string | null) => void;
  reset:         () => void;
}

const Ctx = createContext<CBACtx | null>(null);

export function CBAProvider({ children }: { children: React.ReactNode }) {
  const [biomarkers, setBiomarkersState] = useState<Partial<CBABiomarkers> | null>(null);
  const [results,    setResultsState]    = useState<CBAResults | null>(null);
  const [l1RefCode,  setL1RefCodeState]  = useState<string | null>(null);

  const setBiomarkers = useCallback((b: Partial<CBABiomarkers>) => {
    setBiomarkersState(b);
  }, []);

  const setResults = useCallback((r: CBAResults) => {
    setResultsState(r);
    try {
      sessionStorage.setItem("nanoviga_cba_results", JSON.stringify(r));
    } catch {}
  }, []);

  const setL1RefCode = useCallback((code: string | null) => {
    setL1RefCodeState(code);
  }, []);

  const reset = useCallback(() => {
    setBiomarkersState(null);
    setResultsState(null);
    setL1RefCodeState(null);
    try { sessionStorage.removeItem("nanoviga_cba_results"); } catch {}
  }, []);

  return (
    <Ctx.Provider value={{ biomarkers, results, l1RefCode, setBiomarkers, setResults, setL1RefCode, reset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useCBA() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useCBA must be used within CBAProvider");
  return ctx;
}
