"use client";

import { useEffect } from "react";
import Link from "next/link";
import { WardEmptyState } from "@/components/ward-mascot";
import { reportClientError } from "@/lib/report-error";

export default function PageError({ error, reset }: { error?: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (error) reportClientError(error);
  }, [error]);
  return <section data-page-unavailable>
    <WardEmptyState page text="The pit is quiet here." action={<Link href="/" onClick={() => {
      if (window.location.pathname === "/") reset();
    }}>Return home</Link>}/>
  </section>;
}
