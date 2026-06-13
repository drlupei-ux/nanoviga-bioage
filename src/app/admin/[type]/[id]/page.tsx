'use client';
import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { api, StatusBadge } from '../../AdminUI';
import type { AdminSubmission } from '@/lib/admin/types';

export default function AdminDetail() {
  const { type, id } = useParams<{ type: string; id: string }>();
  const [item, setItem] = useState<AdminSubmission | null>(null);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const { item } = await api(`/api/admin/submissions/${type}/${id}`);
      setItem(item); setNote(item.doctorNote || '');
    } catch (e: any) { setErr(e.message || '加载失败'); }
  }, [type, id]);
  useEffect(() => { load(); }, [load]);

  async function deliver() {
    if (!note.trim()) return;
    setBusy(true); setErr('');
    try {
      const { item } = await api(`/api/admin/submissions/${type}/${id}/deliver`, {
        method: 'POST', body: JSON.stringify({ doctorNote: note }),
      });
      setItem(item);
    } catch (e: any) { setErr(e.message || '操作失败'); } finally { setBusy(false); }
  }

  if (err) return <main className="p-4"><p className="text-clinical-danger">{err}</p></main>;
  if (!item) return <main className="p-4"><p className="text-clinical-muted">加载中…</p></main>;
  const delivered = item.status === 'delivered';

  return (
    <main className="min-h-screen bg-clinical-bg p-4 pb-safe">
      <a href="/admin" className="text-sm text-clinical-muted">← 返回队列</a>

      <section className="clinical-card mt-3">
        <div className="flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-clinical-primary">{item.name || '未具名'}</h1>
          <StatusBadge status={item.status} />
        </div>
        <p className="text-xs text-clinical-muted mt-1">
          {item.caseId || '未分配'} · 评估编号 {item.assessmentCode} · {item.type.toUpperCase()}
          {item.l1RefCode ? ` · 关联 ${item.l1RefCode}` : ''}
        </p>
      </section>

      <section className="clinical-card mt-3">
        <h2 className="clinical-section-label">联系方式</h2>
        <p className="text-sm mt-2">手机：{item.contact.phone || (item.contact.phoneSuffix ? `尾号 ${item.contact.phoneSuffix}` : '未提供')}</p>
      </section>

      <section className="clinical-card mt-3">
        <h2 className="clinical-section-label">评估报告</h2>
        <p className="text-sm mt-1">身体年龄 {item.headlineAge} / 实际 {item.actualAge} 岁{typeof item.score === 'number' ? ` · 评分 ${item.score}` : ''}</p>
        {item.type === 'pla' && item.dimensionScores && (
          <ul className="text-sm mt-2 grid grid-cols-2 gap-1">
            {Object.entries(item.dimensionScores).map(([k, v]) => <li key={k}>{k}: {v}</li>)}
          </ul>
        )}
        {item.type === 'cba' && item.organAges && (
          <ul className="text-sm mt-2 grid grid-cols-2 gap-1">
            {Object.entries(item.organAges).map(([k, v]) => <li key={k}>{k}: {v}岁</li>)}
          </ul>
        )}
        <div className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{item.report || '报告缺失'}</div>
      </section>

      <section className="clinical-card mt-3">
        <h2 className="clinical-section-label">医生备注</h2>
        <textarea value={note} onChange={e => setNote(e.target.value)}
          placeholder="填写本案例的医生备注…" className="w-full h-28 p-2 mt-2 rounded border text-base" />
      </section>

      <section className="mt-4">
        <button disabled={busy || !note.trim()} onClick={deliver}
          className="w-full h-12 rounded bg-clinical-primary text-white font-medium disabled:opacity-60">
          {busy ? '提交中…' : delivered ? '保存备注' : '确认交付'}
        </button>
        {delivered && <p className="text-center text-xs text-clinical-jade mt-2">本案例已交付（备注仍可修改）。</p>}
      </section>
    </main>
  );
}
