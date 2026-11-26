"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const destinations = [
  {
    href: "/", label: "Home", short: "Home",
    icon: <path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" />,
  },
  {
    href: "/lfg", label: "Find a duo", short: "Duos",
    icon: <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5M16 5.3a3 3 0 0 1 0 5.6M17.5 15.4c2.1.5 3.6 2.1 4 4.6" />
    </>,
  },
  {
    href: "/#compose", label: "New post", short: "Post",
    icon: <><rect x="3" y="3" width="18" height="18" rx="5" /><path d="M12 8v8M8 12h8" /></>,
  },
  {
    href: "/search", label: "Search", short: "Search",
    icon: <><circle cx="10.5" cy="10.5" r="7" /><path d="m16 16 4.5 4.5" /></>,
  },
  {
    href: "/profile", label: "Profile", short: "Profile",
    icon: <><circle cx="12" cy="8" r="3.8" /><path d="M4.5 20.5c1-3.8 4-5.5 7.5-5.5s6.5 1.7 7.5 5.5" /></>,
  },
];

export function PrimaryNavigation() {
  const path = usePathname();
  return (
    <nav className="primary-nav" aria-label="Primary">
      {destinations.map(({ href, label, short, icon }) => {
        const inSection = href === "/lfg" && path.startsWith("/lfg/");
        return (
          <Link key={href} href={href} prefetch={false} className="primary-nav-link" title={label}
            aria-label={label} aria-current={path === href ? "page" : inSection ? "location" : undefined}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              {icon}
            </svg>
            <span>{short}</span>
          </Link>
        );
      })}
    </nav>
  );
}
