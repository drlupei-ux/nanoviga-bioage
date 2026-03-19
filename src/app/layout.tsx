import type { Metadata, Viewport } from "next";
import { Inter, Playfair_Display } from "next/font/google";
import "./globals.css";
import { AssessmentProvider } from "@/context/AssessmentContext";

const inter = Inter({
  subsets:  ["latin"],
  variable: "--font-inter",
  display:  "swap",
});

const playfair = Playfair_Display({
  subsets:  ["latin"],
  variable: "--font-playfair",
  weight:   ["400", "600"],
  style:    ["normal", "italic"],
  display:  "swap",
});

export const viewport: Viewport = {
  width:          "device-width",
  initialScale:   1,
  viewportFit:    "cover",   // enables env(safe-area-inset-*) on iOS notch/home-bar
};

export const metadata: Metadata = {
  title:       "Nanoviga · Clinical Longevity Assessment",
  description: "A validated, multi-domain biological age assessment based on lifestyle indicators.",
  openGraph: {
    title:       "Nanoviga · Phenotypic Age Index",
    description: "Understand how your lifestyle impacts biological ageing across 7 health domains.",
    type:        "website",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${playfair.variable}`}>
      <body>
        <AssessmentProvider>
          {children}
        </AssessmentProvider>
      </body>
    </html>
  );
}
