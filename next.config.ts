import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async redirects() {
    return [{
      source: "/:path*",
      has: [{ type: "host", value: "www.baronpit.com" }],
      destination: "https://baronpit.com/:path*",
      permanent: true,
    }];
  },
  images: {
    // Only public, versioned Riot icons may enter the shared image cache.
    localPatterns: [],
    remotePatterns: [new URL("https://ddragon.leagueoflegends.com/cdn/*/img/profileicon/*.png")],
    maximumRedirects: 0,
  },
  async headers() {
    // Report-only CSP: the observation phase before enforcement. It describes the
    // origins the app actually uses (self, Data Dragon images, Vercel Blob media,
    // Vercel Analytics/Speed Insights) so violations can be reviewed with zero
    // user-facing risk. script-src keeps 'unsafe-inline' because Next.js hydration
    // emits inline scripts; removing it needs nonce-based CSP, which is why this
    // policy stays report-only and enforcement is a separate follow-up. The narrow
    // enforced CSP below it is unchanged.
    const reportOnlyCsp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://ddragon.leagueoflegends.com https://*.public.blob.vercel-storage.com",
      "font-src 'self' data:",
      "connect-src 'self' https://va.vercel-scripts.com",
      "object-src 'none'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
    ].join("; ");
    return [{ source: "/:path*", headers: [
      {key:"X-Content-Type-Options", value:"nosniff"},
      {key:"Referrer-Policy", value:"strict-origin-when-cross-origin"},
      {key:"X-Frame-Options", value:"DENY"},
      {key:"Permissions-Policy", value:"camera=(), microphone=(), geolocation=()"},
      {key:"Strict-Transport-Security", value:"max-age=63072000; includeSubDomains"},
      {key:"Content-Security-Policy", value:"frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"},
      {key:"Content-Security-Policy-Report-Only", value:reportOnlyCsp},
    ] }];
  },
};
export default nextConfig;
