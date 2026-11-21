import type { Metadata } from "next";
import { Onest } from "next/font/google";
import { ConsentAwareAnalytics } from "@/components/analytics/ConsentAwareAnalytics";
import "./generated-globals.css";

const onest = Onest({
  subsets: ["cyrillic", "latin"],
  // 500 rarely needed; font-medium falls back to nearest loaded weight.
  weight: ["400", "600", "700", "800"],
  variable: "--font-onest",
  display: "swap",
});

function getSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim() || "https://teling.by";
  try {
    return new URL(raw);
  } catch {
    return new URL("https://teling.by");
  }
}

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: "Teling.by - Каталог телекоммуникационного оборудования",
    template: "%s | Teling.by",
  },
  description:
    "Каталог оборудования для ЛВС, ВОЛС, видеонаблюдения, кабельного ТВ и мультимедийных систем.",
  alternates: {
    canonical: "/",
  },
  openGraph: {
    type: "website",
    locale: "ru_BY",
    url: "/",
    siteName: "Teling.by",
    title: "Teling.by - Каталог телекоммуникационного оборудования",
    description:
      "Каталог оборудования для ЛВС, ВОЛС, видеонаблюдения, кабельного ТВ и мультимедийных систем.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Teling.by - Каталог телекоммуникационного оборудования",
    description:
      "Каталог оборудования для ЛВС, ВОЛС, видеонаблюдения, кабельного ТВ и мультимедийных систем.",
  },
  icons: {
    icon: [
      { url: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { url: "/favicon.ico", type: "image/x-icon" },
    ],
    shortcut: ["/favicon-32.png"],
    apple: [{ url: "/apple-touch-icon.png", type: "image/png", sizes: "180x180" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID?.trim();

  return (
    <html lang="ru" className={`${onest.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {children}
        {gaId ? <ConsentAwareAnalytics gaId={gaId} /> : null}
      </body>
    </html>
  );
}
