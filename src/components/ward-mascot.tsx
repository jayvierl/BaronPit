import Image from "next/image";
import type { ReactNode } from "react";
import styles from "./ward-mascot.module.css";

export function WardMascot({ size = 72, compact = false }: { size?: number; compact?: boolean }) {
  return <Image unoptimized className={styles.mascot} src={compact ? "/mascot-avatar.png" : "/mascot.png"}
    width={size} height={size} alt="The Baron Pit ward mascot"/>;
}

export function WardEmptyState({ text, action, page = false, status = false }: {
  text: string; action: ReactNode; page?: boolean; status?: boolean;
}) {
  return <div className={styles.empty} role={status ? "status" : undefined}>
    <WardMascot/>
    {page ? <h1 className="page-title">{text}</h1> : <p>{text}</p>}
    {action}
  </div>;
}
