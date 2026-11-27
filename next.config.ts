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
    return [{ source: "/:path*", headers: [
      {key:"X-Content-Type-Options", value:"nosniff"},
      {key:"Referrer-Policy", value:"strict-origin-when-cross-origin"},
      {key:"X-Frame-Options", value:"DENY"},
      {key:"Permissions-Policy", value:"camera=(), microphone=(), geolocation=()"},
      {key:"Content-Security-Policy", value:"frame-ancestors 'none'; object-src 'none'; base-uri 'self'; form-action 'self'"},
    ] }];
  },
};
export default nextConfig;
