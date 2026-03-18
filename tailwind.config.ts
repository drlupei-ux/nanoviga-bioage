import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        clinical: {
          bg:        "#F8F9FB",
          surface:   "#FFFFFF",
          surface2:  "#F1F3F7",
          border:    "#E2E6ED",
          navy:      "#1A2B4A",
          "navy-lt": "#2C4A7C",
          jade:      "#0D7A5F",
          "jade-lt": "#E6F4F0",
          amber:     "#B8860B",
          "amber-lt":"#FDF8E7",
          danger:    "#9B2335",
          "danger-lt":"#FDEDF0",
          gold:      "#C8A96E",
          muted:     "#64748B",
          secondary: "#2D3748",
          primary:   "#0F172A",
        },
      },
      fontFamily: {
        sans:    ["var(--font-inter)", "system-ui", "sans-serif"],
        display: ["var(--font-playfair)", "Georgia", "serif"],
      },
      boxShadow: {
        card: "0 1px 3px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 12px rgba(0,0,0,0.10), 0 8px 24px rgba(0,0,0,0.06)",
      },
      keyframes: {
        fadeUp: {
          from: { opacity: "0", transform: "translateY(16px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        countUp: {
          from: { opacity: "0" },
          to:   { opacity: "1" },
        },
      },
      animation: {
        "fade-up":  "fadeUp 0.5s ease both",
        "fade-up2": "fadeUp 0.5s 0.15s ease both",
        "fade-up3": "fadeUp 0.5s 0.3s ease both",
      },
    },
  },
  plugins: [],
};
export default config;
