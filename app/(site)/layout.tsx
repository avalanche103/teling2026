import { Header } from "@/components/layout/Header";
import { CookieConsent } from "@/components/layout/CookieConsent";
import { ChatWidget } from "@/components/chat/ChatWidget";
import { RequestCartProvider } from "@/components/request/RequestCartProvider";
import type { ReactNode } from "react";

export default function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <RequestCartProvider>
      <Header />
      {children}
      <ChatWidget />
      <CookieConsent />
    </RequestCartProvider>
  );
}
