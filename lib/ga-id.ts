/** Public GA4 measurement id used on teling.by. Override with NEXT_PUBLIC_GA_ID. */
const FALLBACK_GA_MEASUREMENT_ID = "G-1DC8FGVC27";

/**
 * Measurement id for the root layout.
 *
 * NEXT_PUBLIC_* values are frozen at `next build`. A local build does not see
 * the server's `.env.production`, so an empty build used to ship the site
 * with analytics removed entirely. The fallback keeps production builds
 * working; `next dev` stays quiet unless the variable is set.
 */
export function readGaMeasurementId(): string {
  const configured = process.env.NEXT_PUBLIC_GA_ID?.trim();
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") return FALLBACK_GA_MEASUREMENT_ID;
  return "";
}
