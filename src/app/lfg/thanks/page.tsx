import type { Metadata } from "next";
import Link from "next/link";
import { DuoTipPreview } from "@/components/duo-tip-preview";
import { examplePlatformBps } from "@/lib/duo-gratuity";
import styles from "./preview.module.css";

export const metadata: Metadata = { title: "Thank your duo" };
export const dynamic = "force-dynamic";

export default function DuoThanksPage() {
  return <div className={styles.page}>
    <Link href="/lfg">Duo Finder</Link>
    <h1 className="page-title">Thank your duo</h1>
    <p>A good teammate deserves a thanks. After a verified shared game, either player can send one privately from their duo request. Sending thanks and choosing to play again are independent.</p>
    <p className="notice"><strong>Tip preview only.</strong> This calculator shows how an optional future tip could be shared. Payments and payouts are unavailable.</p>
    <DuoTipPreview platformBps={examplePlatformBps(process.env.DUO_TIP_PREVIEW_BPS)} />
    <p>Keep money out of listings and requests. Report anyone asking for payment to queue, carry or boost.</p>
    <Link href="/safety">Visit the safety centre</Link>
  </div>;
}
