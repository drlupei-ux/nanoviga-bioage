// [CHANGE 2026-03-23] 原因：为 /cba/** 子树注入 CBAProvider，最小侵入（不修改根 layout.tsx）| 影响范围：src/app/cba/layout.tsx（新建）
import { CBAProvider } from "@/context/CBAContext";

export default function CBALayout({ children }: { children: React.ReactNode }) {
  return <CBAProvider>{children}</CBAProvider>;
}
