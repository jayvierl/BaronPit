"use client";

import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, type MouseEvent, type ReactNode } from "react";
import { POST_TO_THE_PIT } from "@/lib/brand";
import { composeDestination } from "@/lib/navigation-context";
import styles from "./navigation.module.css";

type Destination = { href: string; label: string; path: string; title?: string };
type Current = "page" | "location" | undefined;

const home = { href: "/", label: "Home", path: "m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z" };
const search = { href: "/search", label: "Search", path: "M17.5 10.5a7 7 0 1 1-14 0 7 7 0 0 1 14 0Zm-1.6 5.4 4.8 4.8" };
const playerStats = { href: "/player", label: "Player Stats", path: "M4 20h16M6 16v-5m6 5V4m6 12V8" };
const duos = { href: "/lfg", label: "Duos", title: "Find a duo", path: "M12.4 8a3.4 3.4 0 1 1-6.8 0 3.4 3.4 0 0 1 6.8 0ZM2.5 20c.8-3.2 3.4-5 6.5-5s5.7 1.8 6.5 5M16 5.3a3 3 0 0 1 0 5.6M17.5 15.4c2.1.5 3.6 2.1 4 4.6" };
const activity = { href: "/activity", label: "Activity", path: "M20.3 5.7a5.2 5.2 0 0 0-7.3 0l-1 1-1-1a5.2 5.2 0 1 0-7.4 7.4l7.3 7.3a1.5 1.5 0 0 0 2.2 0l7.2-7.3a5.2 5.2 0 0 0 0-7.4Z" };
const profile = { href: "/profile", label: "Profile", title: "My profile", path: "M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 21v-2a5 5 0 0 1 5-5h6a5 5 0 0 1 5 5v2" };
const composeIcon = "M8 3h8a5 5 0 0 1 5 5v8a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8a5 5 0 0 1 5-5Zm4 5v8m-4-4h8";
function Icon({ path }: { path: string }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
    strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={path}/></svg>;
}

function PendingMark() {
  const { pending } = useLinkStatus();
  return pending ? <span className={styles.pending} aria-hidden="true"/> : null;
}

function routeCurrent(pathname: string, href: string): Current {
  if (pathname === href) return "page";
  if (href !== "/" && pathname.startsWith(`${href}/`)) return "location";
  return undefined;
}

function NavigationLink({ destination, current, className, textClass }: {
  destination: Destination; current?: Current; className: string; textClass?: string;
}) {
  const { href, label, path, title = label } = destination;
  return <Link href={href} prefetch={false} className={className} title={title} aria-label={label} aria-current={current}>
    <Icon path={path}/><span className={textClass}>{label}</span><PendingMark/>
  </Link>;
}

function focusComposer() {
  const target = document.getElementById("compose");
  const textarea = target?.querySelector("textarea");
  if (!textarea) return false;
  if (document.activeElement === textarea) return true;
  const disclosure = textarea.closest("details");
  if (disclosure) disclosure.open = true;
  target?.scrollIntoView({ block: "start" });
  textarea.focus({ preventScroll: true });
  return true;
}

function ComposeLink({ pathname, mobile }: { pathname: string; mobile?: boolean }) {
  const router = useRouter();
  const target = composeDestination(pathname);
  const className = mobile ? `primary-nav-link ${styles.link} ${styles.mobileCompose}` : `${styles.railLink} ${styles.newThread}`;
  const item = <><Icon path={composeIcon}/><span className="sr-only">{POST_TO_THE_PIT}</span></>;
  function openComposer(event: MouseEvent<HTMLAnchorElement>) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const contextualAction = document.querySelector<HTMLAnchorElement>("main a#compose[href]");
    if (contextualAction) {
      event.preventDefault();
      contextualAction.click();
      return;
    }
    if (!focusComposer() && pathname !== "/" && document.querySelector("main [data-page-unavailable]")) {
      event.preventDefault();
      router.push("/#compose");
      return;
    }
    requestAnimationFrame(() => {
      if (window.location.hash === "#compose") focusComposer();
    });
  }
  if (target === "#compose") return <a href={target} className={className} title={POST_TO_THE_PIT} aria-label={POST_TO_THE_PIT}
    onClick={openComposer}>{item}</a>;
  return <Link href={target} prefetch={false} className={className} title={POST_TO_THE_PIT} aria-label={POST_TO_THE_PIT}>{item}<PendingMark/></Link>;
}

export function PrimaryNavigation({ brand, explore }: { brand: string; explore: ReactNode }) {
  const pathname = usePathname();
  useEffect(() => {
    let observer: MutationObserver | undefined;
    let timeout: number | undefined;
    function stopWatching() {
      observer?.disconnect();
      window.clearTimeout(timeout);
    }
    function focusFromLocation() {
      stopWatching();
      if (window.location.hash !== "#compose" || focusComposer()) return;
      observer = new MutationObserver(() => {
        if (window.location.hash !== "#compose" || focusComposer()) stopWatching();
      });
      observer.observe(document.body, { childList: true, subtree: true });
      timeout = window.setTimeout(stopWatching, 5000);
    }
    focusFromLocation();
    window.addEventListener("hashchange", focusFromLocation);
    window.addEventListener("popstate", focusFromLocation);
    return () => {
      stopWatching();
      window.removeEventListener("hashchange", focusFromLocation);
      window.removeEventListener("popstate", focusFromLocation);
    };
  }, [pathname]);

  return <>
    <nav className={`primary-nav ${styles.mobileNav}`} aria-label="Primary">
      {[home, search].map(destination => <NavigationLink key={destination.href} destination={destination}
        className={`primary-nav-link ${styles.link}`} textClass="sr-only" current={routeCurrent(pathname, destination.href)}/>)}
      <ComposeLink pathname={pathname} mobile/>
      {[activity, duos].map(destination => <NavigationLink key={destination.href} destination={destination}
        className={`primary-nav-link ${styles.link}`} textClass="sr-only" current={routeCurrent(pathname, destination.href)}/>)}
      <NavigationLink destination={playerStats} current={routeCurrent(pathname, playerStats.href)}
        className={`primary-nav-link ${styles.link} ${styles.statsShortcut}`} textClass={styles.statsLabel}/>
    </nav>
    <aside className={styles.rail} aria-label="Site shortcuts">
      <Link href="/" prefetch={false} className={styles.brand} title={brand}>
        <Image unoptimized src="/baron-emblem-96.webp" width={34} height={34} alt=""/>
        <span className="sr-only">{brand}</span>
      </Link>
      <nav className={styles.railGroup} aria-label="Primary desktop">
        {[home, search, playerStats, duos, activity, profile].map(destination =>
          <NavigationLink key={destination.href} destination={destination} className={styles.railLink}
            textClass="sr-only" current={routeCurrent(pathname, destination.href)}/>)}
      </nav>
      <div className={styles.railActions}>
        <ComposeLink pathname={pathname}/>
        <div className={styles.railExplore}>{explore}</div>
      </div>
    </aside>
  </>;
}
