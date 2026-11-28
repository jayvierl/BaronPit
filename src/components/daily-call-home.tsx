import Link from "next/link";
import { dailyCallsForHome } from "@/lib/daily-call";
import { LocalTime } from "./local-time";
import { WardMascot } from "./ward-mascot";
import styles from "./daily-call-home.module.css";

/** The next 13:00 UTC poll opening, shown to readers in their own zone. */
function nextPollOpensAt(): string {
  const next = new Date();
  next.setUTCHours(13, 0, 0, 0);
  if (next.getTime() <= Date.now()) next.setUTCDate(next.getUTCDate() + 1);
  return next.toISOString();
}

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
      {awaitingFirst && <> · New polls arrive at <LocalTime iso={nextPollOpensAt()} format={{ hour: "numeric", minute: "2-digit" }} />.</>}
      {result && <Link className={styles.results} href={`/post/${result.id}`} prefetch={false}>Latest results</Link>}
    </div>
  </div>;
}
