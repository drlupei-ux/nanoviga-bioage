"use client";
// [CHANGE 2026-06-18] 原因：转化优化——全屏 H5 领取码+二维码弹层，1次点击即出二维码 | 影响范围：results 微信获客弹层
// [CHANGE 2026-06-19] 原因：微信外浏览器「长按识别二维码」不可用（该手势仅微信内置浏览器支持）——按环境给出可用路径：微信内=长按识别；微信外=保存到相册+扫一扫 / 复制微信号搜索添加 | 影响范围：WeChatClaimModal 引导文案
import { useEffect, useState } from "react";

const WECHAT_ID = "Charlie20850";

export function WeChatClaimModal({
  open, onClose, claimCode,
}: { open: boolean; onClose: () => void; claimCode: string }) {
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const [isWeChat, setIsWeChat] = useState(false);

  useEffect(() => {
    setIsWeChat(/MicroMessenger/i.test(navigator.userAgent || ""));
  }, []);

  if (!open) return null;

  const copy = (text: string, setFlag: (v: boolean) => void) => {
    navigator.clipboard?.writeText(text)
      .then(() => { setFlag(true); setTimeout(() => setFlag(false), 2000); })
      .catch(() => {});
  };

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
        <button onClick={() => copy(claimCode, setCopiedCode)}
          className="mt-5 w-full rounded-2xl border-2 border-dashed border-clinical-jade bg-clinical-jade/5 py-5">
          <div className="text-xs tracking-[3px] uppercase text-clinical-muted">您的领取码 Claim Code</div>
          <div className="font-display text-4xl text-clinical-navy tracking-[0.3em] mt-1 tabular-nums">{claimCode}</div>
          <div className="text-xs text-clinical-jade mt-1">{copiedCode ? "✓ 已复制" : "点击复制"}</div>
        </button>

        {/* 二维码 — 原生 img；父容器无 overflow-hidden，便于「保存到相册」/微信内长按识别 */}
        <div className="mt-5 rounded-2xl border border-clinical-border bg-white p-5 text-center">
          <p className="text-sm font-medium text-clinical-navy mb-3">
            {isWeChat ? "长按二维码 · 识别添加陆大夫" : "长按二维码 · 保存到相册"}
          </p>
          <img src="/wechat-qr.jpg" alt="陆大夫微信二维码" width={220} height={220}
            className="mx-auto rounded-xl border border-clinical-border" />
          {/* 微信号 — 一键复制（搜索添加兜底） */}
          <button onClick={() => copy(WECHAT_ID, setCopiedId)}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-clinical-navy">
            微信号 <strong>{WECHAT_ID}</strong>
            <span className="text-xs text-clinical-jade">· {copiedId ? "已复制" : "复制"}</span>
          </button>
        </div>

        {/* 按环境给出可用添加路径 */}
        {isWeChat ? (
          <ol className="mt-5 space-y-2 text-sm text-clinical-secondary">
            {["长按上方二维码，点击「识别图中二维码」", "添加陆大夫为好友", "把已复制的领取码粘贴发送给陆大夫", "24 小时内收到您的完整医生报告"].map((s, i) => (
              <li key={i} className="flex gap-2">
                <span className="shrink-0 w-5 h-5 rounded-full bg-clinical-navy text-white text-xs flex items-center justify-center">{i + 1}</span>
                <span>{s}</span>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mt-5 space-y-4">
            <p className="text-sm font-semibold text-clinical-navy">当前不在微信内，请按任一方式添加陆大夫 👇</p>

            <div className="rounded-xl bg-clinical-bg p-3.5">
              <p className="text-sm font-medium text-clinical-jade mb-2">方式一 · 扫码（推荐）</p>
              <ol className="space-y-1.5 text-sm text-clinical-secondary">
                {["长按上方二维码 →「保存到照片 / 保存到相册」", "打开微信，点右上角「+」→「扫一扫」", "点扫一扫页右上角相册，选择刚保存的二维码", "添加后，把领取码粘贴发送给陆大夫"].map((s, i) => (
                  <li key={i} className="flex gap-2"><span className="text-clinical-muted">{i + 1}.</span><span>{s}</span></li>
                ))}
              </ol>
            </div>

            <div className="rounded-xl bg-clinical-bg p-3.5">
              <p className="text-sm font-medium text-clinical-jade mb-2">方式二 · 搜索微信号</p>
              <ol className="space-y-1.5 text-sm text-clinical-secondary">
                {["点上方「复制」微信号", "打开微信「+」→「添加朋友」→ 粘贴微信号搜索", "添加后，把领取码粘贴发送给陆大夫"].map((s, i) => (
                  <li key={i} className="flex gap-2"><span className="text-clinical-muted">{i + 1}.</span><span>{s}</span></li>
                ))}
              </ol>
            </div>
          </div>
        )}

        <p className="text-xs text-clinical-muted text-center mt-6">报告由陆大夫人工复核后发送，请耐心等待</p>
      </div>
    </div>
  );
}
