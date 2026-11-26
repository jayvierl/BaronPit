import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { APP_NAME, APP_DESCRIPTION, SUPPORT_EMAIL } from "@/lib/brand";
import { getCurrentUser } from "@/lib/auth";
import { Avatar } from "@/components/ui";

export const metadata: Metadata = {
  title: `${APP_NAME} — League of Legends, together`,
  description: APP_DESCRIPTION,
  icons: { icon: "/baron-emblem.png" },
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
function RoomsIcon() {
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

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  const profileHref = user ? `/u/${user.id}` : "/signin";

  const railItems = [
    { href: "/", label: "Home", Icon: HomeIcon },
    { href: "/search", label: "Search", Icon: SearchIcon },
    { href: "/#compose", label: "New post", Icon: ComposeIcon },
    { href: "/rooms", label: "Rooms", Icon: RoomsIcon },
    { href: profileHref, label: "Profile", Icon: ProfileIcon },
  ];

  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <header className="topbar">
          <div className="topbar-inner">
            <div />
            <Link href="/" className="wordmark">{APP_NAME}</Link>
            <div className="topbar-right">
              <nav className="topbar-links">
                <Link href="/lfg">Find a Duo</Link>
                <Link href="/builds">Builds</Link>
                <Link href="/champions">Champions</Link>
              </nav>
              {user ? (
                <Link href="/me" aria-label="Your account" style={{ display: "flex" }}>
                  <Avatar name={user.displayName} hue={user.avatarHue} size={32} />
                </Link>
              ) : (
                <Link href="/signin" className="btn small">Log in</Link>
              )}
            </div>
          </div>
        </header>

        <nav className="rail" aria-label="Primary">
          <div className="rail-nav">
            {railItems.map(({ href, label, Icon }) => (
              <Link key={label} href={href} className="rail-link" aria-label={label} title={label}>
                <Icon />
              </Link>
            ))}
          </div>
        </nav>

        <div className="shell">
          <main className="page">{children}</main>
          <footer className="site">
            <div className="inner">
              <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontWeight: 500 }}>
                <Link href="/rooms">Rooms</Link>
                <Link href="/lfg">Find a Duo</Link>
                <Link href="/builds">Builds</Link>
                <Link href="/champions">Champions</Link>
                <Link href="/guidelines">Community Guidelines</Link>
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
          {railItems.map(({ href, label, Icon }) => (
            <Link key={label} href={href} aria-label={label}>
              <Icon />
            </Link>
          ))}
        </nav>
      </body>
    </html>
  );
}
