"use client";
import React, { createContext, useContext, useState, useCallback } from "react";
import type { UserProfile, AssessmentResults } from "@/types/assessment";

interface AssessmentCtx {
  profile:     UserProfile | null;
  answers:     number[];
  results:     AssessmentResults | null;
  setProfile:  (p: UserProfile) => void;
  setAnswer:   (idx: number, score: number) => void;
  setResults:  (r: AssessmentResults) => void;
  reset:       () => void;
}

const Ctx = createContext<AssessmentCtx | null>(null);

export function AssessmentProvider({ children }: { children: React.ReactNode }) {
  const [profile, setProfile]   = useState<UserProfile | null>(null);
  const [answers, setAnswers]   = useState<number[]>([]);
  const [results, setResults]   = useState<AssessmentResults | null>(null);

  const setAnswer = useCallback((idx: number, score: number) => {
    setAnswers((prev) => {
      const next = [...prev];
      next[idx] = score;
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setProfile(null);
    setAnswers([]);
    setResults(null);
  }, []);

  return (
    <Ctx.Provider value={{ profile, answers, results, setProfile, setAnswer, setResults, reset }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAssessment() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAssessment must be used within AssessmentProvider");
  return ctx;
}
