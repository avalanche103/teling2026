import { Header } from "@/components/layout/Header";
import { CookieConsent } from "@/components/layout/CookieConsent";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { RequestCartProvider } from "@/components/request/RequestCartProvider";
import { getCatalogNavTree } from "@/lib/data";
import type { ReactNode } from "react";

export default function SiteLayout({ children }: { children: ReactNode }) {
  const catalogNav = getCatalogNavTree().map((root) => ({
    ...root,
    // Mega-menu only needs one child level.
    children: root.children.map((child) => ({ ...child, children: [] })),
  }));

  return (
    <RequestCartProvider>
      <Header catalogNav={catalogNav} />
      {children}
      <ChatWidget />
      <CookieConsent />
    </RequestCartProvider>
  );
}
