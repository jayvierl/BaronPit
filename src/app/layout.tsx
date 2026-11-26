import type { Metadata } from "next";
import Link from "next/link";
import localFont from "next/font/local";
const inter = localFont({src:"./fonts/inter.woff2",variable:"--font-body",weight:"400 700",display:"swap"});
const space = localFont({src:"./fonts/spacegrotesk.woff2",variable:"--font-display",weight:"500 700",display:"swap"});
import "./globals.css";
import { MobileExplore } from "@/components/mobile-explore";
import { APP_NAME, APP_DESCRIPTION, SUPPORT_EMAIL } from "@/lib/brand";

export const metadata: Metadata = {
  title: `${APP_NAME} — League of Legends, together`,
  description: APP_DESCRIPTION,
  applicationName: APP_NAME,
  icons: {
    icon: { url: "/baron-icon-32.png", sizes: "32x32", type: "image/png" },
    apple: { url: "/baron-icon-180.png", sizes: "180x180", type: "image/png" },
  },
};

const stroke = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
} as const;

function HomeIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}
function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.8-3.8" />
    </svg>
  );
}
function ComposeIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <path d="M12 8v8M8 12h8" />
    </svg>
  );
}
function DuoIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 5.9M17.8 15.4c2 .6 3.3 2.1 3.8 4.6" />
    </svg>
  );
}
function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" {...stroke} aria-hidden>
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 20.5c1-3.8 4-5.5 7.5-5.5s6.5 1.7 7.5 5.5" />
    </svg>
  );
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const explore = <>
    <Link href="/questions">Match questions</Link>
    <Link href="/rooms">Rooms</Link>
    <Link href="/builds">Builds</Link>
    <Link href="/champions">Champions</Link>
  </>;
  const railItems = [
    { href: "/", label: "Home", short: "Home", Icon: HomeIcon },
    { href: "/lfg", label: "Find a duo", short: "Duos", Icon: DuoIcon },
    { href: "/#compose", label: "New post", short: "Post", Icon: ComposeIcon },
    { href: "/search", label: "Search", short: "Search", Icon: SearchIcon },
    { href: "/profile", label: "Profile", short: "Profile", Icon: ProfileIcon },
  ];

  return (
    <html lang="en" className={inter.variable + " " + space.variable}>
      <body>
        <a className="skip-link" href="#content">Skip to content</a>
        <header className="topbar">
          <div className="topbar-inner">
            <div><MobileExplore>{explore}<Link href="/review-hour">Bot lane review hour</Link><Link href="/activity">Thread activity</Link><Link href="/playbook">My playbook</Link><Link href="/pilot">Community pilot</Link></MobileExplore></div>
            <Link href="/" className="wordmark">{APP_NAME}</Link>
            <div className="topbar-right">
              <nav className="topbar-links" aria-label="Explore">{explore}</nav>
              <Link href="/me" prefetch={false} className="btn small" aria-label="Account and sign-in">Account</Link>
            </div>
          </div>
        </header>

        <nav className="rail" aria-label="Primary">
          <div className="rail-nav">
            {railItems.map(({ href, label, short, Icon }) => (
              <Link key={label} href={href} prefetch={false} className="rail-link" aria-label={label} title={label}>
                <Icon /><span>{short}</span>
              </Link>
            ))}
          </div>
        </nav>

        <div className="shell">
          <main className="page" id="content" tabIndex={-1}>{children}</main>
          <footer className="site">
            <div className="inner">
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontWeight: 500 }}>
                <Link href="/rooms">Rooms</Link>
                <Link href="/lfg">Find a Duo</Link>
                <Link href="/builds">Builds</Link>
                <Link href="/champions">Champions</Link>
                <Link href="/pilot">Community pilot</Link>
                <Link href="/safety">Safety centre</Link>
                <Link href="/guidelines">Guidelines</Link>
                <Link href="/terms">Terms</Link>
                <Link href="/privacy">Privacy</Link>
                <a href={`mailto:${SUPPORT_EMAIL}`}>Contact &amp; safety: {SUPPORT_EMAIL}</a>
              </div>
              <p style={{ margin: 0 }}>
                {APP_NAME} is a fan-made community and isn&apos;t endorsed by Riot Games. {APP_NAME} doesn&apos;t reflect
                the views or opinions of Riot Games or anyone officially involved in producing or managing League of
                Legends. League of Legends and Riot Games are trademarks or registered trademarks of Riot Games, Inc.
              </p>
            </div>
          </footer>
        </div>

        <nav className="bottomnav" aria-label="Primary">
          {railItems.map(({ href, label, short, Icon }) => (
            <Link key={label} href={href} prefetch={false} aria-label={label}>
              <Icon /><span>{short}</span>
            </Link>
          ))}
        </nav>
      </body>
    </html>
  );
}
