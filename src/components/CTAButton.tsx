"use client";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { ButtonHTMLAttributes } from "react";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  "primary" | "secondary" | "ghost";
  size?:     "sm" | "md" | "lg";
  loading?:  boolean;
  fullWidth?: boolean;
}

const VARIANT_STYLES = {
  primary: [
    "bg-clinical-jade text-white border border-clinical-jade",
    "hover:bg-clinical-jade/90 active:scale-[0.98]",
    "shadow-sm",
  ].join(" "),

  secondary: [
    "bg-white text-clinical-navy border border-clinical-navy/20",
    "hover:bg-clinical-surface active:scale-[0.98]",
  ].join(" "),

  ghost: [
    "bg-transparent text-clinical-secondary border border-transparent",
    "hover:bg-clinical-surface active:scale-[0.98]",
  ].join(" "),
};

const SIZE_STYLES = {
  sm: "h-9 px-4 text-xs rounded-xl gap-1.5",
  md: "h-11 px-6 text-sm rounded-xl gap-2",
  lg: "h-13 px-8 text-sm rounded-2xl gap-2",
};

export function CTAButton({
  variant  = "primary",
  size     = "md",
  loading  = false,
  fullWidth = false,
  className,
  children,
  disabled,
  ...props
}: Props) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-clinical-jade/50",
        "disabled:opacity-50 disabled:pointer-events-none",
        VARIANT_STYLES[variant],
        SIZE_STYLES[size],
        fullWidth && "w-full",
        className
      )}
    >
      {loading && <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" />}
      {children}
    </button>
  );
}
