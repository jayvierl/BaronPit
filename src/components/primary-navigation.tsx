"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { composeDestination } from "@/lib/navigation-context";
import styles from "./navigation.module.css";

const destinations = [
  { href: "/", label: "Home", path: "m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" },
  { href: "/search", label: "Search", path: "M17.5 10.5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-1.6 5.4 4.8 4.8" },
  { href: "/#compose", label: "Post", path: "M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5Zm4 5v8m-4-4h8" },
  { href: "/activity", label: "Activity", path: "M20.3 5.7a5.2 5.2 0 0 0-7.3 0l-1 1-1-1a5.2 5.2 0 1 0-7.4 7.4l7.3 7.3a1.5 1.5 0 0 0 2.2 0l7.2-7.3a5.2 5.2 0 0 0 0-7.4Z" },
  { href: "/lfg", label: "Duos", path: "M12.4 8a3.4 3.4 0 1 1-6.8 0 3.4 3.4 0 0 1 6.8 0ZM2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5M16 5.3a3 3 0 0 1 0 5.6M17.5 15.4c2.1.5 3.6 2.1 4 4.6" },
];

function PendingMark() {
  const { pending } = useLinkStatus();
  return pending ? <span className={styles.pending} aria-hidden="true"/> : null;
}

function focusComposer() {
  const textarea = document.querySelector<HTMLTextAreaElement>("#compose textarea");
  if (!textarea) return;
  const disclosure = textarea.closest("details");
  if (disclosure) disclosure.open = true;
  textarea.focus({preventScroll:true});
}

export function PrimaryNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    if (window.location.hash === "#compose") focusComposer();
  }, [pathname]);
  return <nav className="primary-nav" aria-label="Primary">
    {destinations.map(({href,label,path}) => {
      const compose = label === "Post";
      const target = compose ? composeDestination(pathname) : href;
      const title = compose ? "New post" : label === "Duos" ? "Find a duo" : label;
      const active = pathname === href ? "page" : href === "/lfg" && pathname.startsWith("/lfg/") ? "location" : undefined;
      const item = <><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={path}/></svg><span>{label}</span></>;
      if (target === "#compose") return <a key={href} href="#compose" className={`primary-nav-link ${styles.link}`} title={title} aria-label={label}
        onClick={event => {
          if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
            focusComposer();
            requestAnimationFrame(focusComposer);
          }
        }}>{item}</a>;
      return <Link key={href} href={target} prefetch={false} className={`primary-nav-link ${styles.link}`} title={title}
        aria-label={label} aria-current={active}>{item}<PendingMark/></Link>;
    })}
  </nav>;
}
