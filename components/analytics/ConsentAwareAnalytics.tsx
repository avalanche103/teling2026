"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { usePathname } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  COOKIE_CONSENT_EVENT,
  analyticsAllowed,
  readCookieConsent,
  type CookieConsentValue,
} from "@/lib/cookie-consent";
import { isGaExcludedPath, syncGaCollection } from "@/lib/ga-exclude";

export function ConsentAwareAnalytics({ gaId }: { gaId: string }) {
  const pathname = usePathname();
  const [consent, setConsent] = useState<CookieConsentValue | null>(null);
  const excluded = isGaExcludedPath(pathname);

  // Layout effect runs before next/script's afterInteractive useEffect,
  // so the filter is in place before gtag's config command.
  useLayoutEffect(() => {
    syncGaCollection(gaId);
  }, [gaId, pathname]);

  useEffect(() => {
    setConsent(readCookieConsent());

    function onConsent(event: Event) {
      const detail = (event as CustomEvent<{ value: CookieConsentValue }>).detail;
      if (detail?.value) setConsent(detail.value);
      else setConsent(readCookieConsent());
    }

    window.addEventListener(COOKIE_CONSENT_EVENT, onConsent);
    return () => window.removeEventListener(COOKIE_CONSENT_EVENT, onConsent);
  }, []);

  if (excluded || !analyticsAllowed(consent)) return null;
  return <GoogleAnalytics gaId={gaId} />;
}
