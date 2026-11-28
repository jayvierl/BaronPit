import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
const inter = localFont({src:"./fonts/inter.woff2",variable:"--font-body",weight:"400 700",display:"swap"});
const space = localFont({src:"./fonts/spacegrotesk.woff2",variable:"--font-display",weight:"500 700",display:"swap"});
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";
import { ExploreMenu } from "@/components/explore-menu";
import { PrimaryNavigation } from "@/components/primary-navigation";
import navStyles from "@/components/navigation.module.css";
import { APP_NAME, APP_DESCRIPTION, SAFETY_CENTER, SUPPORT_EMAIL } from "@/lib/brand";

export const metadata: Metadata = {
  metadataBase: new URL("https://baronpit.com"),
  title: `${APP_NAME} — League of Legends, together`,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  icons: {
    icon: { url: "/baron-icon-32.png", sizes: "32x32", type: "image/png" },
    apple: { url: "/baron-icon-180.png", sizes: "180x180", type: "image/png" },
  },
  openGraph: {
    type: "website",
    siteName: APP_NAME,
    title: `${APP_NAME} — League of Legends, together`,
    description: APP_DESCRIPTION,
    url: "https://baronpit.com",
    images: [{ url: "/baron-hero.png", alt: `${APP_NAME} — League of Legends, together` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${APP_NAME} — League of Legends, together`,
    description: APP_DESCRIPTION,
    images: ["/baron-hero.png"],
  },
};

export const viewport: Viewport = { viewportFit: "cover" };

const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://baronpit.com/#website",
      url: "https://baronpit.com/",
      name: APP_NAME,
      description: APP_DESCRIPTION,
    },
    {
      "@type": "Organization",
      "@id": "https://baronpit.com/#organization",
      url: "https://baronpit.com/",
      name: APP_NAME,
      description: APP_DESCRIPTION,
      logo: "https://baronpit.com/baron-icon-180.png",
      email: SUPPORT_EMAIL,
    },
  ],
};

function ExploreLinks({ desktop = false }: { desktop?: boolean }) {
  return <ExploreMenu menuId={desktop ? "desktop-explore-destinations" : undefined}>
    <div role="group" aria-label="Library">
      <Link href="/?tab=following">Following</Link>
      <Link href="/playbook" prefetch={false}>Saved</Link>
      <Link href="/me" prefetch={false}>Account settings</Link>
    </div>
    <div role="group" aria-label="League">
      <Link href="/player" prefetch={false}>Player Stats</Link>
      <Link href="/builds">Builds</Link>
      <Link href="/champions">Champions</Link>
    </div>
    <div role="group" aria-label="Rooms">
      <Link href="/rooms">Browse rooms</Link>
      <Link href="/rooms/general">General</Link>
      <Link href="/rooms/patch-meta">Patch &amp; Meta</Link>
      <Link href="/rooms/off-meta-lab">Off-Meta Lab</Link>
      <Link href="/rooms/new-players">New Players</Link>
      <Link href="/questions">Match questions</Link>
      <Link href="/review-hour">Bot lane review hour</Link>
      <Link href="/pilot">Community pilot</Link>
    </div>
  </ExploreMenu>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable + " " + space.variable}>
      <body>
        <a className="skip-link" href="#content">Skip to content</a>
        <header className={`topbar ${navStyles.topbar}`}>
          <div className="topbar-inner">
            <Link href="/" className="wordmark">
              <Image unoptimized src="/baron-emblem-96.webp" width={32} height={32} alt="" />
              <span>{APP_NAME}</span>
            </Link>
            <div className="topbar-right">
              <ExploreLinks/>
              <Link href="/profile" prefetch={false} className={navStyles.profileShortcut} aria-label="My profile" title="My profile">
                <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
                  <circle cx="12" cy="7.8" r="3.6"/><path d="M4.5 20c.7-3.7 3.2-5.5 7.5-5.5s6.8 1.8 7.5 5.5"/>
                </svg>
                <span className="sr-only">Profile</span>
              </Link>
            </div>
          </div>
        </header>
        <PrimaryNavigation brand={APP_NAME} explore={<ExploreLinks desktop/>}/>
        <div className="shell">
          <main className="page" id="content" tabIndex={-1}>{children}</main>
          <footer className="site">
            <div className="inner">
              <nav className="footer-links" aria-label="Safety and legal">
                <Link href="/safety">{SAFETY_CENTER}</Link>
                <Link href="/guidelines">Guidelines</Link>
                <Link href="/terms">Terms</Link>
                <Link href="/privacy">Privacy</Link>
                <a href={`mailto:${SUPPORT_EMAIL}`}>Contact &amp; safety</a>
              </nav>
              <p style={{ margin: 0 }}>
                {APP_NAME} is a fan-made community and isn&apos;t endorsed by Riot Games. {APP_NAME} doesn&apos;t reflect
                the views or opinions of Riot Games or anyone officially involved in producing or managing League of
                Legends. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.
              </p>
            </div>
          </footer>
        </div>
        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }} />
        <Analytics />
      </body>
    </html>
  );
}
