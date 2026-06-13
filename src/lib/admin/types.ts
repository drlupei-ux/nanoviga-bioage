export type SubmissionType = 'pla' | 'cba';
export type ReviewStatus = 'submitted' | 'under_review' | 'delivered';

export function isPending(s: ReviewStatus): boolean {
  return s === 'submitted' || s === 'under_review';
}

export const CASE_ID_RE = /^BAC-(\d{4})-(\d{4})$/;
export function formatCaseId(year: number, seq: number): string {
  return `BAC-${year}-${String(seq).padStart(4, '0')}`;
}
export function parseCaseId(id: string): { year: number; seq: number } | null {
  const m = CASE_ID_RE.exec(id);
  return m ? { year: Number(m[1]), seq: Number(m[2]) } : null;
}

export interface AdminContact { phone?: string | null; phoneSuffix?: string | null; }

export interface AdminSubmission {
  id: string;
  type: SubmissionType;
  caseId: string | null;
  name: string;
  assessmentCode: string;
  l1RefCode?: string | null;
  status: ReviewStatus;
  submittedAt: string;
  headlineAge: number;
  actualAge: number;
  contact: AdminContact;
  // detail-only:
  report?: string | null;
  dimensionScores?: Record<string, number>;
  organAges?: Record<string, number>;
  score?: number;
  doctorNote?: string | null;
}
