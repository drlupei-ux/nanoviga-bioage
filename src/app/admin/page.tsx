'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { api, StatusBadge } from './AdminUI';
import type { AdminSubmission, ReviewStatus, SubmissionType } from '@/lib/admin/types';

const STATUS_TABS: { key: ReviewStatus | 'all'; label: string }[] = [
  { key: 'submitted', label: '待审核' }, { key: 'under_review', label: '审核中' },
  { key: 'delivered', label: '已交付' }, { key: 'all', label: '全部' },
];
const TYPE_TABS: { key: SubmissionType | 'all'; label: string }[] = [
  { key: 'all', label: '全部' }, { key: 'pla', label: 'PLA' }, { key: 'cba', label: 'CBA' },
];

export default function AdminList() {
  const [status, setStatus] = useState<ReviewStatus | 'all'>('submitted');
  const [type, setType] = useState<SubmissionType | 'all'>('all');
  const [items, setItems] = useState<AdminSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setErr('');
    try {
      const sp = new URLSearchParams({ type });
      // when searching, span all statuses so a Claim Code is always findable
      if (status !== 'all' && !q.trim()) sp.set('status', status);
      setItems((await api(`/api/admin/submissions?${sp}`)).items);
    } catch (e: unknown) { setErr((e as Error).message || '加载失败'); } finally { setLoading(false); }
  }, [type, status, q]);
  useEffect(() => { load(); }, [load]);

  const claim = (a?: string | null) => (a ? a.replace(/^BCA-/i, '') : '—');
  const needle = q.trim().toUpperCase();
  const shown = needle
    ? items.filter(it =>
        (it.assessmentCode || '').toUpperCase().includes(needle) ||
        (it.caseId || '').toUpperCase().includes(needle) ||
        (it.name || '').toUpperCase().includes(needle))
    : items;

  return (
    <main className="min-h-screen bg-clinical-bg p-4 pb-safe">
      <header className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-clinical-primary">案例审核台</h1>
        <button onClick={() => api('/api/admin/logout', { method: 'POST' }).then(() => { location.href = '/admin/login'; })}
          className="text-sm text-clinical-muted">退出</button>
      </header>
      <div className="flex flex-wrap gap-2 mb-2">
        {TYPE_TABS.map(t => (
          <button key={t.key} onClick={() => setType(t.key)}
            className={`px-3 h-9 rounded text-sm ${type === t.key ? 'bg-clinical-primary text-white' : 'bg-white text-clinical-secondary'}`}>{t.label}</button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-4">
        {STATUS_TABS.map(t => (
          <button key={t.key} onClick={() => setStatus(t.key)}
            className={`px-3 h-9 rounded text-sm ${status === t.key ? 'bg-clinical-jade text-white' : 'bg-white text-clinical-secondary'}`}>{t.label}</button>
        ))}
      </div>
      <input value={q} onChange={e => setQ(e.target.value)}
        placeholder="搜索领取码 / 案例号 / 姓名（如 K8M4）"
        className="w-full h-10 px-3 mb-4 rounded border text-base" />
      {loading && <p className="text-clinical-muted">加载中…</p>}
      {err && <p className="text-clinical-danger">{err}</p>}
      {!loading && !err && shown.length === 0 && <p className="text-clinical-muted">暂无记录。</p>}
      <ul className="space-y-2">
        {shown.map(it => (
          <li key={`${it.type}-${it.id}`}>
            <Link href={`/admin/${it.type}/${it.id}`} className="clinical-card flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-clinical-primary truncate">{it.name || '未具名'}</span>
                  <span className="shrink-0 text-xs font-mono px-1.5 py-0.5 rounded bg-clinical-jade/10 text-clinical-jade tracking-wider">{claim(it.assessmentCode)}</span>
                </div>
                <div className="text-xs text-clinical-muted truncate">
                  {it.caseId || '未分配'} · {it.type.toUpperCase()} · {it.headlineAge}/{it.actualAge}岁 · {new Date(it.submittedAt).toLocaleString('zh-CN')}
                </div>
              </div>
              <StatusBadge status={it.status} />
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
