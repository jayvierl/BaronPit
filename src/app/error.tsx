"use client";

import Link from "next/link";

export default function PageError({ reset }: { error: Error; reset: () => void }) {
  return <section className="card" data-page-unavailable><h1 className="page-title">This page is temporarily unavailable</h1>
    <p>We couldn’t load the information for this page.</p>
    <button type="button" className="btn small" onClick={reset}>Try again</button>{" "}
    <Link href="/">Return home</Link></section>;
}
