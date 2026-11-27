"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { beginDraftSignIn, restoreAfterMount } from "@/lib/auth-draft";
import { decisionRoles, decisionTopics, matchDiscussionThread, type QuestionStarter } from "@/lib/decisions-input";
import { validId } from "@/lib/ids";
import type { DiscussionKind, MatchContext } from "@/lib/match-context";
import { signInHref } from "@/lib/signin-return";
import { MatchDiscussionPreview } from "./match-discussion-preview";
import { ActionFeedback, usePostAction } from "./post-action";
import { TagFieldWrap, useTagSuggest } from "./tag-suggest";
import { useHydrated } from "./use-hydrated";
import discussionStyles from "./match-discussion.module.css";
import styles from "@/app/questions/questions.module.css";

type Match = MatchContext & { item?: { id: number; name: string } | null };
const observerStarter: Record<QuestionStarter["id"], string> = {
  items: "Which item made sense in this situation?",
  recall: "When would you recall in this situation?",
  matchup: "How should this matchup be played?",
};
const roleNames: Record<string, string> = {
  TOP: "Top", JUNGLE: "Jungle", MIDDLE: "Mid", BOTTOM: "Bot", UTILITY: "Support", TEAM: "Team",
};
export function DecisionComposer({ champions, match: originalMatch, starter, destination, signedIn, discuss = false, fromMatch }: {
  champions: { id: string; name: string }[];
  match: Match | null;
  starter?: QuestionStarter;
  destination: string;
  signedIn: boolean;
  discuss?: boolean;
  fromMatch?: string;
}) {
  const [detached, setDetached] = useState(false);
  const match = detached ? null : originalMatch;
  const router = useRouter();
  const action = usePostAction();
  const hydrated = useHydrated();
  const [confirm, setConfirm] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [kind, setKind] = useState<DiscussionKind>("question");
  const [notice, setNotice] = useState("");
  const [posted, setPosted] = useState(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const scope = "decision:" + destination;
  const team = !!originalMatch && (originalMatch.role === "TEAM" || !originalMatch.role);
  const [draft, setDraft] = useState<Record<"champion" | "opponent" | "role" | "topic" | "body", string>>(() => ({
    champion: match?.champion ?? "",
    opponent: match?.opponent ?? "",
    role: team ? "Team" : roleNames[match?.role ?? ""] ?? "",
    topic: match?.item ? "Build choice" : starter?.topic ?? (team ? "Teamfight" : "Laning"),
    body: match?.item
      ? "Was " + match.item.name + " the right item on " + match.champion + " in this game?"
      : starter && match?.authorRole === "spectator" ? observerStarter[starter.id] : starter?.label ?? "",
  }));

  useEffect(() => {
    if (!signedIn) return;
    return restoreAfterMount(scope, saved => {
      const champion = (value: unknown) => champions.find(c => c.id === value)?.id ?? "";
      setDetached(!!originalMatch && saved.detached === true);
      setDraft(d => ({
        champion: originalMatch?.champion ?? champion(saved.champion),
        opponent: champion(saved.opponent),
        role: team ? "Team" : decisionRoles.find(r => r === saved.role) ?? d.role,
        topic: originalMatch?.item ? "Build choice" : decisionTopics.find(t => t === saved.topic) ?? d.topic,
        body: typeof saved.body === "string" ? saved.body.slice(0, 1000) : d.body,
      }));
      if (discuss && saved.discussionKind === "perspective") setKind("perspective");
      setNotice("Your draft is ready. Review it before posting.");
    });
  }, [scope, signedIn, champions, originalMatch, discuss, team]);

  function update(key: keyof typeof draft, value: string) {
    setDraft(d => ({ ...d, [key]: value }));
    setConfirm(false);
  }
  const bodyId = useId();
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const tags = useTagSuggest({
    inputRef: bodyRef, limit: 1000, value: draft.body,
    enabled: hydrated && !action.busy && !posted, apply: text => update("body", text),
  });

  function continueSignIn() {
    try {
      const mode = action.authStep === "enrol" ? "enrol" : undefined;
      router.push(beginDraftSignIn(window.localStorage, scope, destination, { ...draft, detached, discussionKind: kind }, mode));
    } catch {
      setStorageBlocked(true);
      setNotice("Your browser couldn’t save this draft. Copy your text before signing in.");
    }
  }
  const needsSignIn = !signedIn || !!action.authStep;
  const perspective = discuss && kind === "perspective";
  const observer = match?.authorRole === "spectator";
  return (
    <form className={styles.form} onSubmit={async event => {
      event.preventDefault();
      if (!hydrated || posted || action.busy) return;
      if (needsSignIn) { continueSignIn(); return; }
      if (match && !acknowledged) { setNotice("Confirm the public match attachment before posting."); return; }
      setNotice("");
      const result = detached
        ? await action.sendDraft("/api/social/post", { kind: "text", body: draft.body, submitForReview: action.reconsider && confirm })
        : await action.sendDraft("/api/questions", {
        ...draft,
        action: "ask",
        ...(perspective && { opponent: "", topic: "Teamfight" }),
        ...(match && { platform: match.platform, riotId: match.riotId, matchId: match.matchId, champion: match.champion,
          confirmPublicMatch: acknowledged, discussionKind: kind,
          ...(match.item && { itemId: match.item.id }),
        }),
        submitForReview: action.reconsider && confirm,
      });
      if (!result) { setConfirm(true); return; }
      setPosted(true);
      if (result.status === "held") setNotice(discuss ? "Your discussion was submitted for moderator review." : "Your question was submitted for moderator review.");
      router.push(result.status === "visible" && validId(result.postId)
        ? match ? matchDiscussionThread(result.postId, match, fromMatch) : "/post/" + result.postId
        : "/me#submissions");
    }}>
      {match && <>
        <MatchDiscussionPreview match={match} fromMatch={fromMatch} composing/>
        <button type="button" className="text-btn" disabled={!hydrated || action.busy || posted}
          onClick={() => { setDetached(true); setAcknowledged(false); setConfirm(false); setNotice(""); }}>Remove match</button>
      </>}
      {detached && <button type="button" className="text-btn" disabled={!hydrated || action.busy || posted}
        onClick={() => { setDetached(false); setConfirm(false); }}>Reattach match</button>}
      {match?.item && <p className="meta">Item decision · {match.item.name}</p>}
      <fieldset className={discussionStyles.fields} disabled={!hydrated || action.busy || posted}>
        {!detached && discuss && <fieldset className={discussionStyles.kind}>
          <legend>Discussion type</legend>
          {([ ["question", "Question"], ["perspective", "Perspective"] ] as const).map(([value, label]) => (
            <button className="btn small secondary" key={value} type="button" aria-pressed={kind === value}
              onClick={() => { setKind(value); setConfirm(false); }}>{label}</button>
          ))}
        </fieldset>}
        <label htmlFor={bodyId}>
          {detached ? "Your post" : perspective ? "Your perspective" : discuss ? "Your question" : observer ? "What are you asking about this match?" : "What were you deciding?"}
        </label>
        <TagFieldWrap>
          <textarea id={bodyId} ref={bodyRef} {...tags.fieldProps} value={tags.display}
            onChange={e => tags.change(e.currentTarget)} rows={4} minLength={detached ? 1 : 10} maxLength={tags.maxLength} required
            placeholder={perspective ? "What stood out to you in this match?"
              : observer || discuss ? "Was rotating to dragon the best choice here?"
              : "Dragon spawned and our bot wave was pushing. Should I have stayed for the tower or rotated?"} />
          {tags.menu}
        </TagFieldWrap>
        {!detached && <div className={styles.filters}>
          {!match && <label>Champion
            <select value={draft.champion}
              onChange={e => update("champion", e.target.value)} required>
              <option value="">Choose a champion</option>
              {champions.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}
            </select>
          </label>}
          {!perspective && <label>Opponent to discuss
            <select value={draft.opponent} onChange={e => update("opponent", e.target.value)}>
              <option value="">Optional</option>
              {champions.map(c => <option value={c.id} key={c.id}>{c.name}</option>)}
            </select>
            {match?.opponent && <span className="meta">Riot lists {match.opponent} in the opposing role. You can choose another matchup.</span>}
          </label>}
          {team ? <p className="meta">Team discussion · Riot did not provide a lane.</p> : <label>Role
            <select value={draft.role} onChange={e => update("role", e.target.value)} required>
              <option value="">Choose a role</option>
              {decisionRoles.map(r => <option key={r}>{r}</option>)}
            </select>
          </label>}
          {!perspective && <label>Decision
            <select disabled={!!match?.item} value={draft.topic} onChange={e => update("topic", e.target.value)}>
              {decisionTopics.map(t => <option key={t}>{t}</option>)}
            </select>
          </label>}
        </div>}
        {match && !needsSignIn && <label className={discussionStyles.acknowledgement}>
          <input type="checkbox" checked={acknowledged} onChange={e => setAcknowledged(e.target.checked)} required/>
          <span>Attach this public match to my post.</span>
        </label>}
        {match && !needsSignIn && <p className="meta">If your post needs moderator review, you can track it in <Link href="/me#submissions">My submissions</Link>.</p>}
        <ActionFeedback error={action.error} />
        <div>
          <button type="submit" className="btn gold" formNoValidate={needsSignIn}>
            {action.busy ? "Sending…" : action.authStep === "enrol" ? "Confirm eligibility and return"
              : needsSignIn ? detached ? "Sign in to post" : discuss ? "Sign in to discuss" : "Sign in to ask"
              : action.reconsider && confirm ? "Submit for moderator review" : detached ? "Post" : discuss ? "Post discussion" : "Post question"}
          </button>
        </div>
      </fieldset>
      <noscript>{signedIn ? <p className="meta">Enable JavaScript to post from this editor.</p>
        : <Link href={signInHref(destination)}>Sign in to continue</Link>}</noscript>
      {hydrated && needsSignIn && <p className="meta">Your draft will return when you open the sign-in email in this browser.</p>}
      {notice && <p role="status">{notice}{posted && <> <Link href="/me#submissions">View my submissions</Link></>}</p>}
      {storageBlocked && <Link href={signInHref(destination, action.authStep === "enrol" ? "enrol" : undefined)}>
        Continue without saving this draft
      </Link>}
    </form>
  );
}
