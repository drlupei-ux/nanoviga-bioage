"use client";
// [CHANGE 2026-06-18] 原因：转化优化——全屏 H5 领取码+二维码弹层，1次点击即出二维码 | 影响范围：results 微信获客弹层
import { useState } from "react";

const WECHAT_ID = "Charlie20850";

const STEPS = [
  "长按下方二维码，点击「识别图中二维码」",
  "添加陆大夫为好友",
  "把已复制的领取码粘贴发送给陆大夫",
  "24 小时内收到您的完整医生报告",
];

export function WeChatClaimModal({
  open, onClose, claimCode,
}: { open: boolean; onClose: () => void; claimCode: string }) {
  const [copied, setCopied] = useState(false);
  if (!open) return null;

  function copyCode() {
    navigator.clipboard?.writeText(claimCode)
      .then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000); })
      .catch(() => {});
  }

  return (
    <div className="fixed inset-0 z-50 bg-clinical-bg overflow-y-auto pb-safe">
      <div className="min-h-full flex flex-col max-w-md mx-auto px-5 py-6">
        <button onClick={onClose} className="self-end text-clinical-muted text-sm mb-2 h-10 px-2">关闭 ✕</button>

        <div className="text-center">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-clinical-jade/10 text-clinical-jade text-sm font-medium">
            ✓ 领取码已复制
          </div>
          <h2 className="text-xl font-semibold text-clinical-navy mt-4">添加陆大夫微信，发送领取码</h2>
          <p className="text-sm text-clinical-muted mt-1">凭领取码匹配您的评估，24 小时内收到完整医生报告</p>
        </div>

        {/* 领取码大卡 */}
        <button onClick={copyCode}
          className="mt-5 w-full rounded-2xl border-2 border-dashed border-clinical-jade bg-clinical-jade/5 py-5">
          <div className="text-xs tracking-[3px] uppercase text-clinical-muted">您的领取码 Claim Code</div>
          <div className="font-display text-4xl text-clinical-navy tracking-[0.3em] mt-1 tabular-nums">{claimCode}</div>
          <div className="text-xs text-clinical-jade mt-1">{copied ? "✓ 已复制" : "点击复制"}</div>
        </button>

        {/* 二维码 — 原生 img 便于微信长按识别；父容器无 overflow-hidden */}
        <div className="mt-5 rounded-2xl border border-clinical-border bg-white p-5 text-center">
          <p className="text-sm font-medium text-clinical-navy mb-3">长按下方二维码 · 添加陆大夫微信</p>
          <img src="/wechat-qr.jpg" alt="陆大夫微信二维码" width={220} height={220}
            className="mx-auto rounded-xl border border-clinical-border" />
          <p className="text-xs text-clinical-muted mt-3">微信号：<strong className="text-clinical-navy">{WECHAT_ID}</strong></p>
        </div>

        <ol className="mt-5 space-y-2 text-sm text-clinical-secondary">
          {STEPS.map((s, i) => (
            <li key={i} className="flex gap-2">
              <span className="shrink-0 w-5 h-5 rounded-full bg-clinical-navy text-white text-xs flex items-center justify-center">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>

        <p className="text-xs text-clinical-muted text-center mt-6">报告由陆大夫人工复核后发送，请耐心等待</p>
      </div>
    </div>
  );
}
