"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useLayoutEffect, useState } from "react";
import {
  COOKIE_CONSENT_EVENT,
  analyticsAllowed,
  readCookieConsent,
  type CookieConsentValue,
} from "@/lib/cookie-consent";
import { isGaExcludedPath } from "@/lib/ga-exclude";

type YmFn = {
  (...args: unknown[]): void;
  a?: IArguments[];
  l?: number;
};

declare global {
  interface Window {
    ym?: YmFn;
  }
}

const TAG_SRC = "https://mc.yandex.ru/metrika/tag.js";
const initedCounters = new Set<string>();
let lastHitUrl = "";
let lastHitAt = 0;

function installYm(): YmFn {
  if (typeof window.ym === "function") return window.ym;

  const ym = function ymStub() {
    (ym.a = ym.a || []).push(arguments);
  } as YmFn;
  ym.l = Date.now();
  window.ym = ym;

  if (![...document.scripts].some((script) => script.src === TAG_SRC)) {
    const tag = document.createElement("script");
    tag.async = true;
    tag.src = TAG_SRC;
    document.head.appendChild(tag);
  }
  return ym;
}

function ensureCounter(counterId: string, ym: YmFn) {
  if (initedCounters.has(counterId)) return;
  initedCounters.add(counterId);
  ym(Number(counterId), "init", {
    defer: true,
    clickmap: true,
    trackLinks: true,
    accurateTrackBounce: true,
    webvisor: true,
  });
}

function trackHit(counterId: string, ym: YmFn) {
  const url = window.location.href;
  const now = Date.now();
  if (url === lastHitUrl && now - lastHitAt < 800) return;
  lastHitUrl = url;
  lastHitAt = now;
  ym(Number(counterId), "hit", url, { title: document.title });
}

export function YandexMetrika({ counterId }: { counterId: string }) {
  const pathname = usePathname();
  const search = useSearchParams();
  const query = search.toString();
  const [consent, setConsent] = useState<CookieConsentValue | null>(null);
  const excluded = isGaExcludedPath(pathname);

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

  useLayoutEffect(() => {
    if (!/^\d{5,12}$/.test(counterId)) return;
    if (excluded || !analyticsAllowed(consent)) return;
    const ym = installYm();
    ensureCounter(counterId, ym);
    trackHit(counterId, ym);
  }, [consent, counterId, excluded, pathname, query]);

  return null;
}
