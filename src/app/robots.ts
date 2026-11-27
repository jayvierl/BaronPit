import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/me", "/signin", "/profile"],
    },
    sitemap: "https://baronpit.com/sitemap.xml",
    host: "https://baronpit.com",
  };
}
