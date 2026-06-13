'use client';
import { cn } from '@/lib/utils';
import type { ReviewStatus } from '@/lib/admin/types';

export const STATUS_LABEL: Record<ReviewStatus, string> = {
  submitted: '待审核', under_review: '审核中', delivered: '已交付',
};
export function StatusBadge({ status }: { status: ReviewStatus }) {
  const tone: Record<ReviewStatus, string> = {
    submitted: 'bg-clinical-bg text-clinical-secondary',
    under_review: 'bg-clinical-jade/15 text-clinical-jade',
    delivered: 'bg-clinical-primary/15 text-clinical-primary',
  };
  return <span className={cn('px-2 py-0.5 rounded text-xs font-medium', tone[status])}>{STATUS_LABEL[status]}</span>;
}
export async function api(path: string, init?: RequestInit) {
  const res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
