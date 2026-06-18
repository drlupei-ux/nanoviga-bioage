'use client';
import { useState } from 'react';
import { parseReport, buildWeChatText, hasRoadmap } from '@/lib/admin/reportFormat';
import type { AdminSubmission } from '@/lib/admin/types';

/**
 * Formatted, readable Doctor Report View. Parses the raw AI report JSON into
 * clean sections (overview · risks · mechanism · roadmap), shows the doctor's
 * note, and offers a one-tap "复制到微信" that copies a plain-text version
 * (report + doctor note) suitable for pasting into WeChat. Falls back to raw
 * text for legacy/non-JSON reports. No PDF, no email — display + copy only.
 */
export function DoctorReportView({ item, doctorNote }: { item: AdminSubmission; doctorNote: string }) {
  const parsed = parseReport(item.report);
  const [copied, setCopied] = useState(false);

  async function copy() {
    const text = buildWeChatText(item, parsed, doctorNote);
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('请手动全选复制以下内容：', text);
    }
  }

  return (
    <div className="space-y-4">
      {/* overview */}
      <p className="text-sm">
        身体年龄 <strong className="text-clinical-primary">{item.headlineAge}</strong> / 实际 {item.actualAge} 岁
        {typeof item.score === 'number' && item.score ? ` · 评分 ${item.score}` : ''}
        {parsed?.rating ? ` · 评级 ${parsed.rating}` : ''}
      </p>
      {parsed?.ratingReason && <p className="text-sm text-clinical-secondary leading-relaxed">{parsed.ratingReason}</p>}

      {parsed ? (
        <>
          {parsed.risks.length > 0 && (
            <section>
              <h3 className="clinical-section-label">三大关键风险</h3>
              <ol className="mt-2 space-y-1.5 text-sm list-decimal list-inside leading-relaxed">
                {parsed.risks.map((r, i) => (
                  <li key={i}><strong>{r.name}</strong>{r.oneLine ? ` — ${r.oneLine}` : ''}</li>
                ))}
              </ol>
            </section>
          )}

          {parsed.mechanism.length > 0 && (
            <section>
              <h3 className="clinical-section-label">风险形成机制</h3>
              <div className="mt-2 space-y-2">
                {parsed.mechanism.map((m, i) => (
                  <div key={i} className="text-sm rounded border border-clinical-border p-2.5 leading-relaxed">
                    <span className="text-clinical-muted text-xs">原因 </span>{m.cause}
                    <span className="text-clinical-jade font-medium"> → </span>
                    <span className="text-clinical-muted text-xs">机制 </span>{m.physiology}
                    <span className="text-clinical-jade font-medium"> → </span>
                    <span className="text-clinical-muted text-xs">结果 </span>{m.result}
                  </div>
                ))}
              </div>
            </section>
          )}

          {hasRoadmap(parsed.roadmap) && (
            <section>
              <h3 className="clinical-section-label">行动路线图</h3>
              <div className="mt-2 space-y-2">
                {([['未来 7 天', parsed.roadmap.d7], ['未来 30 天', parsed.roadmap.d30], ['未来 90 天', parsed.roadmap.d90]] as const).map(
                  ([title, arr]) => arr.length > 0 && (
                    <div key={title} className="text-sm">
                      <div className="font-medium text-clinical-jade">{title}</div>
                      <ul className="mt-0.5 space-y-0.5 leading-relaxed">
                        {arr.map((a, i) => <li key={i}>✓ {a}</li>)}
                      </ul>
                    </div>
                  ),
                )}
              </div>
            </section>
          )}
        </>
      ) : (
        <div className="whitespace-pre-wrap text-sm leading-relaxed">{item.report || '报告缺失'}</div>
      )}

      <button onClick={copy} className="w-full h-11 rounded bg-clinical-jade text-white text-sm font-medium">
        {copied ? '已复制 ✓' : '复制到微信（含医生意见）'}
      </button>
    </div>
  );
}
