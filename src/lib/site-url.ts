import { headers } from "next/headers";

/**
 * The origin an organiser is handed to paste into their own website.
 *
 * This deliberately does not just echo the host we were served on. A Vercel
 * preview or per-deployment URL is unique to one build and usually sits behind
 * deployment protection, so a snippet carrying it embeds a page that 404s or
 * asks the organiser's visitors to log in to Vercel the moment that deployment
 * is superseded. Prefer an explicitly configured domain, then the project's
 * stable production domain, and only then the request host — which is what
 * local development wants and is correct there.
 */
export async function canonicalOrigin() {
  const configured = process.env.SITE_URL;
  if (configured) return configured.replace(/\/+$/, "");

  // Set by Vercel to the project's production domain, the same on every
  // deployment — unlike VERCEL_URL, which changes per build.
  const production = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (production) return `https://${production}`;

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
