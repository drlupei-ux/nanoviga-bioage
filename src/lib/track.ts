// [CHANGE 2026-06-18] 原因：转化漏斗埋点（PLA完成→领取码→点击→二维码→交付）| 影响范围：results/admin 转化分析
// Lightweight, fire-and-forget funnel tracking. Never throws, never blocks UX.
export function track(event: string, props?: Record<string, unknown>) {
  try {
    const body = JSON.stringify({
      event,
      props: props || {},
      ts: new Date().toISOString(),
      path: typeof location !== 'undefined' ? location.pathname : '',
    });
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }));
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {});
    }
  } catch {
    /* tracking must never break the page */
  }
}
