import type { Metadata, Viewport } from "next";
import Image from "next/image";
import Link from "next/link";
import localFont from "next/font/local";
const inter = localFont({src:"./fonts/inter.woff2",variable:"--font-body",weight:"400 700",display:"swap"});
const space = localFont({src:"./fonts/spacegrotesk.woff2",variable:"--font-display",weight:"500 700",display:"swap"});
import "./globals.css";
import { ExploreMenu } from "@/components/explore-menu";
import { PrimaryNavigation } from "@/components/primary-navigation";
import navStyles from "@/components/navigation.module.css";
import { APP_NAME, APP_DESCRIPTION, SAFETY_CENTER, SUPPORT_EMAIL } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${APP_NAME} — League of Legends, together`,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  icons: {
    icon: { url: "/baron-icon-32.png", sizes: "32x32", type: "image/png" },
    apple: { url: "/baron-icon-180.png", sizes: "180x180", type: "image/png" },
  },
};

export const viewport: Viewport = { viewportFit: "cover" };

function ExploreLinks({ desktop = false }: { desktop?: boolean }) {
  return <ExploreMenu menuId={desktop ? "desktop-explore-destinations" : undefined}>
    <Link href="/me" prefetch={false}>Account settings</Link>
    {!desktop && <Link href="/rooms">Rooms</Link>}
    <Link href="/questions">Match questions</Link>
    <Link href="/review-hour">Bot lane review hour</Link>
    {!desktop && <Link href="/playbook">Saved</Link>}
    <Link href="/builds">Builds</Link>
    <Link href="/champions">Champions</Link>
    <Link href="/pilot">Community pilot</Link>
  </ExploreMenu>;
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable + " " + space.variable}>
      <body>
        <a className="skip-link" href="#content">Skip to content</a>
        <header className={`topbar ${navStyles.topbar}`}>
          <div className="topbar-inner">
            <Link href="/" className={`wordmark ${navStyles.mobileWordmark}`}>
              <Image unoptimized src="/baron-emblem-96.webp" width={32} height={32} alt="" />
              <span>{APP_NAME}</span>
            </Link>
            <div className="topbar-right">
              <ExploreLinks/>
              <Link href="/profile" prefetch={false} className={`btn small ${navStyles.mobileProfile}`} aria-label="My profile">Profile</Link>
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

      </body>
    </html>
  );
}
