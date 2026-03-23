"use client";
// [CHANGE 2026-03-23] 原因：CBA 支付完成成功页，展示微信二维码+报告预计送达时间 | 影响范围：src/app/cba/success/page.tsx（新建）

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useCBA } from "@/context/CBAContext";
import { AssessmentHeader } from "@/components/AssessmentHeader";
import { CTAButton } from "@/components/CTAButton";
import { CheckCircle2 } from "lucide-react";
import type { CBAResults } from "@/types/cba";

export default function CBASuccessPage() {
  const router      = useRouter();
  const { results } = useCBA();

  const [resolved, setResolved] = useState<CBAResults | null>(null);
  useEffect(() => {
    if (results) { setResolved(results); return; }
    try {
      const saved = sessionStorage.getItem("nanoviga_cba_results");
      if (saved) setResolved(JSON.parse(saved));
    } catch {}
  }, [results]);

  const isLinked = !!resolved?.l1RefCode;

  return (
    <div className="min-h-screen bg-clinical-bg flex flex-col">
      <AssessmentHeader hideRight />

      <main className="flex-1 flex flex-col items-center justify-center px-5 text-center pb-12">
        <div className="animate-fade-up max-w-sm w-full">

          {/* 成功图标 */}
          <div className="w-14 h-14 rounded-full bg-clinical-jade-lt flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 className="w-7 h-7 text-clinical-jade" strokeWidth={1.5} />
          </div>

          <h2 className="font-display text-2xl text-clinical-navy mb-2">
            报告生成中
          </h2>
          <p className="text-sm text-clinical-secondary leading-relaxed mb-5">
            感谢您的信任。陆大夫将在{" "}
            <strong className="text-clinical-navy">24 小时内</strong>
            {" "}通过微信向您发送完整的临床生化生物年龄报告。
          </p>

          {/* CBA 评估编号 */}
          {resolved?.assessmentCode && (
            <div className="bg-clinical-surface border border-clinical-jade/30 rounded-2xl px-4 py-3 mb-4">
              <p className="text-[9px] tracking-[3px] uppercase text-clinical-jade font-medium mb-1">
                您的 CBA 评估编号
              </p>
              <p className="font-display text-xl text-clinical-navy tracking-widest">
                {resolved.assessmentCode}
              </p>
              {isLinked && (
                <p className="text-[10px] text-clinical-muted mt-1">
                  已关联 L1 编号 {resolved.l1RefCode}，将生成综合报告
                </p>
              )}
            </div>
          )}

          {/* 微信二维码卡片 */}
          <div className="clinical-card p-5 mb-5">
            <p className="text-[9px] tracking-[4px] uppercase text-clinical-muted mb-3">
              {isLinked ? "陆大夫会主动联系您" : "扫码添加陆大夫 · 报告通过微信发送"}
            </p>

            {!isLinked && (
              <>
                <div className="flex justify-center mb-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src="/wechat-qr.jpg"
                    alt="陆大夫微信二维码"
                    className="w-52 h-auto rounded-2xl border border-clinical-border bg-white"
                    onError={e => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                </div>
                <p className="text-xs text-clinical-secondary font-medium mb-1">
                  陆大夫逆龄管理
                </p>
                <p className="text-[11px] text-clinical-muted leading-relaxed">
                  长按识别二维码，添加微信好友
                </p>
              </>
            )}

            {isLinked && (
              <p className="text-sm text-clinical-secondary leading-relaxed">
                您已在微信好友列表中。陆大夫收到报告后将主动发送给您，无需任何额外操作。
              </p>
            )}
          </div>

          {/* 说明 */}
          <div className="bg-clinical-surface border border-clinical-border rounded-2xl px-4 py-3 mb-6 text-left">
            <p className="text-[10px] text-clinical-muted leading-relaxed">
              <span className="text-clinical-jade font-medium">· </span>
              报告将在 24 小时内（工作日）通过微信发送<br />
              <span className="text-clinical-jade font-medium">· </span>
              {isLinked
                ? `如有问题请在微信发送"CBA报告 ${resolved?.assessmentCode ?? ""}"`
                : "添加微信后请备注您的手机后 4 位"}
              <br />
              <span className="text-clinical-jade font-medium">· </span>
              如有疑问可直接微信咨询陆大夫
            </p>
          </div>

          <CTAButton
            variant="secondary"
            fullWidth
            onClick={() => router.push("/")}
          >
            返回首页
          </CTAButton>
        </div>
      </main>
    </div>
  );
}
