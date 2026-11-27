"use client";

import Link from "next/link";
import { WardEmptyState } from "@/components/ward-mascot";

export default function PageError({ reset }: { reset: () => void }) {
  return <section data-page-unavailable>
    <WardEmptyState page text="The pit is quiet here." action={<Link href="/" onClick={() => {
      if (window.location.pathname === "/") reset();
    }}>Return home</Link>}/>
  </section>;
}
