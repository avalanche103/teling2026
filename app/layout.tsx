import type { Metadata } from "next";
import { Geist_Mono, Inter, Oswald } from "next/font/google";
import "./globals.css";

function getSiteUrl(): URL {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim() || process.env.SITE_URL?.trim() || "https://teling.by";
  try {
    return new URL(raw);
  } catch {
    return new URL("https://teling.by");
  }
}

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const oswald = Oswald({
  variable: "--font-oswald",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin", "cyrillic"],
  display: "swap",
});

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
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${oswald.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900">
        {children}
      </body>
    </html>
  );
}
