"use client";

import Link, { useLinkStatus } from "next/link";
import type { ComponentProps } from "react";
import styles from "./builds-link.module.css";

function BuildLinkStatus() {
  const { pending } = useLinkStatus();
  return <span className={styles.status} role="status">{pending ? "Opening builds…" : ""}</span>;
}

export function BuildsLink({ children, className, ...link }: ComponentProps<typeof Link>) {
  return <Link {...link} prefetch={false} className={className ? `${className} ${styles.link}` : styles.link}>
    {children}<BuildLinkStatus/>
  </Link>;
}
