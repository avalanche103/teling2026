import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import "./generated-globals.css";

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
    icon: [{ url: "/favicon.ico", type: "image/x-icon" }],
    shortcut: ["/favicon.ico"],
    apple: [{ url: "/teling-circle.jpg", type: "image/jpeg" }],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID?.trim();

  return (
    <html lang="ru" className="h-full antialiased">
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {children}
      </body>
      {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
    </html>
  );
}
