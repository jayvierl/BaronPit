import Link from "next/link";
import type { QuotePreview as Original } from "@/lib/quote-types";
import styles from "./quote.module.css";

export function QuotePreview({ original }: { original: Original | null }) {
  if (!original) return <p className={`${styles.preview} ${styles.unavailable}`}>Original post unavailable</p>;
  return <Link href={`/post/${original.postId}`} className={styles.preview} prefetch={false}>
    <span className={styles.heading}>Original post by <strong>{original.author}</strong>{original.room && ` · ${original.room}`}</span>
    {original.body && <span className={styles.excerpt}>{original.body}</span>}
  </Link>;
}
