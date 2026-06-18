import type { AdminSubmission } from './types';

export interface Risk { name: string; oneLine: string; }
export interface Mechanism { cause: string; physiology: string; result: string; }
export interface Roadmap { d7: string[]; d30: string[]; d90: string[]; }
export interface ParsedReport {
  rating?: string;
  ratingReason?: string;
  risks: Risk[];
  mechanism: Mechanism[];
  roadmap: Roadmap;
}

const strArr = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x)).filter(Boolean) : []);

/**
 * Parse the raw model report into structured sections.
 * Mirrors the cloud function's parseModelJson: strips code fences, slices to the
 * outermost braces, JSON.parses. Returns null when the report is not JSON
 * (legacy plain-text reports, test placeholders) so callers can fall back to raw text.
 */
export function parseReport(raw?: string | null): ParsedReport | null {
  if (!raw) return null;
  let s = String(raw).trim();
  s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a !== -1 && b !== -1 && b > a) s = s.slice(a, b + 1);
  let parsed: any;
  try { parsed = JSON.parse(s); } catch { return null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;

  const rm = parsed.roadmap && typeof parsed.roadmap === 'object' && !Array.isArray(parsed.roadmap) ? parsed.roadmap : {};
  return {
    rating: typeof parsed.rating === 'string' ? parsed.rating : undefined,
    ratingReason: typeof parsed.ratingReason === 'string' ? parsed.ratingReason : undefined,
    risks: Array.isArray(parsed.risks)
      ? parsed.risks.filter((r: any) => r && (r.name || r.oneLine)).map((r: any) => ({ name: String(r.name || ''), oneLine: String(r.oneLine || '') }))
      : [],
    mechanism: Array.isArray(parsed.mechanism)
      ? parsed.mechanism.filter((m: any) => m && (m.cause || m.physiology || m.result)).map((m: any) => ({ cause: String(m.cause || ''), physiology: String(m.physiology || ''), result: String(m.result || '') }))
      : [],
    roadmap: { d7: strArr(rm.d7), d30: strArr(rm.d30), d90: strArr(rm.d90) },
  };
}

export function hasRoadmap(r: Roadmap): boolean {
  return r.d7.length > 0 || r.d30.length > 0 || r.d90.length > 0;
}

/** Plain-text rendering of report + doctor note, formatted for pasting into WeChat. */
export function buildWeChatText(item: AdminSubmission, parsed: ParsedReport | null, doctorNote: string): string {
  const code = item.caseId || item.assessmentCode || '';
  const L: string[] = [`【缓龄评估报告】${code}`];

  const head = [`姓名：${item.name || '—'}`, `身体年龄 ${item.headlineAge} / 实际 ${item.actualAge} 岁`];
  if (typeof item.score === 'number' && item.score) head.push(`评分 ${item.score}`);
  if (parsed?.rating) head.push(`评级：${parsed.rating}`);
  L.push(head.join('　'));
  if (parsed?.ratingReason) L.push(parsed.ratingReason);

  if (parsed) {
    if (parsed.risks.length) {
      L.push('', '■ 三大关键风险');
      parsed.risks.forEach((r, i) => L.push(`${i + 1}. ${r.name}${r.oneLine ? ' — ' + r.oneLine : ''}`));
    }
    if (parsed.mechanism.length) {
      L.push('', '■ 风险形成机制');
      parsed.mechanism.forEach((m) => L.push(`· 原因：${m.cause} → 机制：${m.physiology} → 结果：${m.result}`));
    }
    if (hasRoadmap(parsed.roadmap)) {
      L.push('', '■ 行动路线图');
      const { d7, d30, d90 } = parsed.roadmap;
      if (d7.length) L.push('【未来7天】 ' + d7.map((a) => '✓ ' + a).join('  '));
      if (d30.length) L.push('【未来30天】 ' + d30.map((a) => '✓ ' + a).join('  '));
      if (d90.length) L.push('【未来90天】 ' + d90.map((a) => '✓ ' + a).join('  '));
    }
  } else if (item.report) {
    L.push('', String(item.report));
  }

  if (doctorNote && doctorNote.trim()) {
    L.push('', '■ 医生复核意见', doctorNote.trim());
  }
  L.push('', `— 陆医生 · 编号 ${code}`);
  return L.join('\n');
}
