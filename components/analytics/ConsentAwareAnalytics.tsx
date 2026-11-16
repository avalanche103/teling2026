"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { useEffect, useState } from "react";
import {
  COOKIE_CONSENT_EVENT,
  analyticsAllowed,
  readCookieConsent,
  type CookieConsentValue,
} from "@/lib/cookie-consent";

export function ConsentAwareAnalytics({ gaId }: { gaId: string }) {
  const [consent, setConsent] = useState<CookieConsentValue | null>(null);

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

  if (!analyticsAllowed(consent)) return null;
  return <GoogleAnalytics gaId={gaId} />;
}
