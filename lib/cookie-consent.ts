export const COOKIE_CONSENT_KEY = "teling_cookie_consent";
export const COOKIE_CONSENT_EVENT = "teling:cookie-consent";

export type CookieConsentValue = "accepted" | "necessary";

function parseConsentValue(raw: string | null | undefined): CookieConsentValue | null {
  if (raw === "accepted" || raw === "necessary") return raw;
  return null;
}

export function readCookieConsent(): CookieConsentValue | null {
  if (typeof window === "undefined") return null;

  try {
    const fromStorage = parseConsentValue(window.localStorage.getItem(COOKIE_CONSENT_KEY));
    if (fromStorage) return fromStorage;
  } catch {
    // localStorage may be blocked
  }

  const match = document.cookie.match(
    new RegExp(`(?:^|; )${COOKIE_CONSENT_KEY}=(accepted|necessary)(?:;|$)`),
  );
  return parseConsentValue(match?.[1]);
}

export function writeCookieConsent(value: CookieConsentValue): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(COOKIE_CONSENT_KEY, value);
  } catch {
    // ignore quota / privacy mode errors
  }

  // Mirror into a first-party cookie so the choice survives localStorage clears less often
  // and can be inspected in DevTools as a real cookie.
  const maxAge = 60 * 60 * 24 * 365;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${COOKIE_CONSENT_KEY}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${secure}`;

  window.dispatchEvent(
    new CustomEvent(COOKIE_CONSENT_EVENT, { detail: { value } }),
  );
}

export function analyticsAllowed(value: CookieConsentValue | null): boolean {
  return value === "accepted";
}
