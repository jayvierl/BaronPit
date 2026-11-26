"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { beginDraftSignIn, restoreAfterMount } from "@/lib/auth-draft";
import { decisionRoles, decisionTopics, type QuestionStarter } from "@/lib/decisions-input";
import { signInHref } from "@/lib/signin-return";
import { ActionFeedback, usePostAction } from "./post-action";
import styles from "@/app/questions/questions.module.css";

type Match = {
  puuid: string;
  matchId: string;
  champion: string;
  opponent: string;
  patch: string | null;
  role: string;
  riotId: string;
  item?: { id: number; name: string } | null;
};
const roleNames: Record<string, string> = {
  TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Support",
};
export function DecisionComposer({ champions, match, starter, destination, signedIn }: {
  champions: { id: string; name: string }[];
  match: Match | null;
  starter?: QuestionStarter;
  destination: string;
  signedIn: boolean;
}) {
  const router = useRouter();
  const action = usePostAction();
  const [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState("");
  const [posted, setPosted] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const scope = "decision:" + destination;
  const [draft, setDraft] = useState<Record<"champion" | "opponent" | "role" | "topic" | "body", string>>({
    champion: match?.champion ?? "",
    opponent: match?.opponent ?? "",
    role: roleNames[match?.role ?? ""] ?? "",
    topic: match?.item ? "Build choice" : starter?.topic ?? "Laning",
    body: match?.item
      ? "Was " + match.item.name + " the right item on " + match.champion + " in this game?"
      : starter?.label ?? "",
  });

  useEffect(() => {
    if (!signedIn) return;
    return restoreAfterMount(scope, saved => {
      const champion = (value: unknown) => champions.find(c => c.id === value)?.id ?? "";
      setDraft(d => ({
        champion: match?.champion ?? champion(saved.champion),
        opponent: champion(saved.opponent),
        role: decisionRoles.find(r => r === saved.role) ?? d.role,
        topic: match?.item ? "Build choice" : decisionTopics.find(t => t === saved.topic) ?? d.topic,
        body: typeof saved.body === "string" ? saved.body.slice(0, 1000) : d.body,
      }));
      setNotice("Your draft is ready. Review it before posting.");
    });
  }, [scope, signedIn, champions, match]);

  function update(key: keyof typeof draft, value: string) {
    setDraft(d => ({ ...d, [key]: value }));
    setConfirm(false);
  }
  function continueSignIn() {
    try {
      const mode = action.authStep === "enrol" ? "enrol" : undefined;
      router.push(beginDraftSignIn(window.localStorage, scope, destination, draft, mode));
    } catch {
      setStorageBlocked(true);
      setNotice("Your browser couldn’t save this draft. Copy your question before signing in.");
    }
  }
  const needsSignIn = !signedIn || !!action.authStep;
  return (
    <form className={styles.form} onSubmit={async event => {
      event.preventDefault();
      if (needsSignIn) { continueSignIn(); return; }
      const result = await action.sendDraft("/api/questions", {
        ...draft,
        action: "ask",
        ...(match && { puuid: match.puuid, matchId: match.matchId, champion: match.champion,
          ...(match.item && { itemId: match.item.id }),
        }),
        submitForReview: action.reconsider && confirm,
      });
      if (!result) { setConfirm(true); return; }
      setPosted(true);
      if (result.status === "held") setNotice("Your question was submitted for moderator review.");
      router.push(result.status === "visible" ? "/post/" + result.postId : "/me#submissions");
    }}>
      {match && (
        <p className="meta">
          Attached recent game · {match.riotId} on {match.champion}
          {match.patch ? " · Match patch " + match.patch : " · Match patch unavailable"}
          {match.item && " · " + match.item.name}
        </p>
      )}
      <label>
        What were you deciding?
        <textarea name="body" value={draft.body} onChange={e => update("body", e.target.value)}
          rows={4} minLength={10} maxLength={1000} required
          placeholder="Dragon spawned and our bot wave was pushing. Should I have stayed for the tower or rotated?" />
      </label>
      <div className={styles.filters}>
        <label>Champion
          <select name="champion" disabled={!!match} value={draft.champion}
            onChange={e => update("champion", e.target.value)} required>
            <option value="">Choose a champion</option>
            {champions.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label>Opponent to discuss
          <select name="opponent" value={draft.opponent} onChange={e => update("opponent", e.target.value)}>
            <option value="">Optional</option>
            {champions.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}
          </select>
          {match?.opponent && <span className="meta">Riot lists {match.opponent} in the opposing role. You can choose another matchup.</span>}
        </label>
        <label>Role
          <select name="role" value={draft.role} onChange={e => update("role", e.target.value)} required>
            <option value="">Choose a role</option>
            {decisionRoles.map(r => <option key={r}>{r}</option>)}
          </select>
        </label>
        <label>Decision
          <select name="topic" disabled={!!match?.item} value={draft.topic} onChange={e => update("topic", e.target.value)}>
            {decisionTopics.map(t => <option key={t}>{t}</option>)}
          </select>
        </label>
      </div>
      <ActionFeedback error={action.error} />
      <div>
        <button className="btn gold" disabled={action.busy || posted} formNoValidate={needsSignIn}>
          {action.busy ? "Sending…" : action.authStep === "enrol" ? "Confirm eligibility and return"
            : needsSignIn ? "Sign in to ask" : action.reconsider && confirm ? "Submit for moderator review" : "Post question"}
        </button>
      </div>
      {needsSignIn && <p className="meta">Your draft will return when you open the sign-in email in this browser.</p>}
      {notice && <p role="status">{notice}</p>}
      {storageBlocked && <Link href={signInHref(destination, action.authStep === "enrol" ? "enrol" : undefined)}>
        Continue without saving this draft
      </Link>}
    </form>
  );
}
