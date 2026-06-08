"use client";
// [CHANGE 2026-06-07] 原因：L1/L2 分离——L1 结果页底部引导加陆大夫微信（详细报告 / 团队沟通 / L2 由陆大夫人工发放）；微信号点击复制 + 尝试拉起微信 | 影响范围：src/components/WeChatAddCard.tsx（新建）
import { useState } from "react";
import { CTAButton } from "@/components/CTAButton";
import { MessageCircle, Copy, Check } from "lucide-react";

const WECHAT_ID = "Charlie20850";

const REASONS = [
  "获取本次 L1 评估的详细报告",
  "与陆大夫团队一对一沟通",
  "根据体检报告深度评估衰老风险",
];

// [CHANGE 2026-06-08] 原因：新增 onEngage——用户点击「加微信」时回调（真实线索），由结果页据此通知陆大夫，替代每个匿名 L1 自动发邮件 | 影响范围：WeChatAddCard 加微信交互
export function WeChatAddCard({ assessmentCode, onEngage }: { assessmentCode: string; onEngage?: () => void }) {
  const [copied, setCopied] = useState(false);

  function handleAdd() {
    onEngage?.();   // 用户点击加微信 = 真实线索，触发通知陆大夫
    const done = () => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      // 复制后尝试拉起微信：外部浏览器（Safari 等）可打开微信 App；
      // 微信内置浏览器无法深链到"加好友"，靠"已复制 + 粘贴搜索"文案兜底。
      setTimeout(() => { try { window.location.href = "weixin://"; } catch {} }, 150);
    };
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(WECHAT_ID).then(done).catch(done);
    } else {
      done();
    }
  }

  return (
    <section
      id="wechat-add"
      className="clinical-card mb-6 border-clinical-jade/30 animate-fade-up delay-300"
    >
      <div className="flex items-center gap-2 mb-3">
        <span className="w-8 h-8 rounded-full bg-clinical-jade-lt flex items-center justify-center shrink-0">
          <MessageCircle className="w-4 h-4 text-clinical-jade" strokeWidth={1.5} />
        </span>
        <h3 className="text-base font-semibold text-clinical-navy">
          添加陆大夫微信，获取完整评估
        </h3>
      </div>

      {/* 微信号 */}
      <div className="bg-clinical-surface border border-clinical-border rounded-2xl px-4 py-3 mb-3">
        <p className="text-xs tracking-[2px] uppercase text-clinical-muted mb-1">微信号</p>
        <p className="font-display text-xl text-clinical-navy tracking-wide tabular-nums">
          {WECHAT_ID}
        </p>
      </div>

      {/* 点击复制并打开微信 */}
      <CTAButton fullWidth size="lg" onClick={handleAdd}>
        {copied ? (
          <>
            <Check className="w-4 h-4 shrink-0" />
            已复制 — 请在微信「添加朋友」粘贴搜索
          </>
        ) : (
          <>
            <Copy className="w-4 h-4 shrink-0" />
            点击复制微信号并打开微信
          </>
        )}
      </CTAButton>

      <p className="text-xs text-clinical-jade font-medium text-center mt-3">
        添加后请备注您的评估编号：{assessmentCode}
      </p>

      {/* 为什么添加 */}
      <div className="mt-4 pt-4 border-t border-clinical-border">
        <p className="clinical-section-label mb-2">添加后可获得</p>
        <ul className="space-y-2">
          {REASONS.map((r) => (
            <li
              key={r}
              className="flex items-start gap-2.5 text-sm text-clinical-secondary leading-snug"
            >
              <Check className="w-4 h-4 text-clinical-jade mt-0.5 shrink-0" strokeWidth={2} />
              {r}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
