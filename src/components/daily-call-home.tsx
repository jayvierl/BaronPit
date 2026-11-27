import Link from "next/link";
import { dailyCallsForHome } from "@/lib/daily-call";
import { WardMascot } from "./ward-mascot";
import styles from "./daily-call-home.module.css";

export async function DailyCallHome({ viewerId }: { viewerId: number | null }) {
  const { entries, awaitingFirst } = await dailyCallsForHome(viewerId).catch(() => ({ entries: [], awaitingFirst: false }));
  const poll = entries.find(entry => entry.kind === "poll");
  const result = entries.find(entry => entry.kind === "result");
  if (!poll && !result && !awaitingFirst) return null;
  return <div className={styles.call}>
    <WardMascot size={36} compact />
    <div>
      {poll ? <Link href={`/post/${poll.id}`} prefetch={false}><strong>Daily Call</strong> · {poll.title}</Link>
        : <strong>Daily Call</strong>}
      {awaitingFirst && <> · New polls arrive during the 13:00 UTC hour.</>}
      {result && <Link className={styles.results} href={`/post/${result.id}`} prefetch={false}>Latest results</Link>}
    </div>
  </div>;
}
