"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { DUO_ROLES, SCHEDULE_BLOCKS } from "@/lib/pure";
import { communications, partnerRoles, parseDuoFit, playstyles, type DuoFit } from "@/lib/duo-fit";
import { beginDraftSignIn, restoreAfterMount } from "@/lib/auth-draft";
import { signInHref } from "@/lib/signin-return";
import { ActionFeedback, usePostAction } from "./post-action";

const empty = { role: "", partnerRole: "Any", blocks: [] as string[], vibe: "both", communication: "any" };
const draftScope = "private-duo-plan";

export function DuoFitForm({ saved, signedIn }: { saved: DuoFit | null; signedIn: boolean }) {
  const [draft, setDraft] = useState(saved ?? empty);
  const [notice, setNotice] = useState("");
  const action = usePostAction();
  const router = useRouter();
  useEffect(() => {
    if (!signedIn) return;
    return restoreAfterMount(draftScope, payload => {
      const fit = parseDuoFit(payload);
      if (fit) {
        setDraft(fit);
        setNotice("Your choices are ready. Save them to your account.");
      }
    });
  }, [signedIn]);

  function signIn(mode?: "enrol") {
    let href = signInHref("/lfg#duo-plan", mode);
    try {
      href = beginDraftSignIn(window.localStorage, draftScope, "/lfg#duo-plan", draft, mode);
    } catch { /* Sign-in remains available when browser storage is disabled. */ }
    router.push(href);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!signedIn || action.authStep) return signIn(action.authStep === "enrol" ? "enrol" : undefined);
    setNotice("");
    if (await action.send("/api/lfg/preferences", { ...draft, action: "save" })) {
      setNotice("Your duo plan is saved privately.");
      router.refresh();
    }
  }
  async function clear() {
    setNotice("");
    if (await action.send("/api/lfg/preferences", { action: "clear" })) {
      setDraft(empty);
      setNotice("Your saved duo plan was cleared.");
      router.refresh();
    }
  }

  const discussionRole = draft.role === "ADC" ? "Bot" : draft.role;
  const discussion = discussionRole && discussionRole !== "Fill"
    ? "/questions?mode=unanswered&role=" + encodeURIComponent(discussionRole)
    : "/questions?mode=unanswered";

  return (
    <section className="duo-plan card" id="duo-plan" aria-labelledby="duo-plan-title">
      <h2 id="duo-plan-title">Your duo plan</h2>
      <p>Choose who you want to queue with. Your preferences stay private. You decide when to post a listing.</p>
      <form onSubmit={save}>
        <fieldset disabled={action.busy}>
          <div className="duo-fields">
            <label>My role
              <select required value={draft.role} onChange={e => setDraft({ ...draft, role: e.target.value })}>
                <option value="">Choose a role</option>
                {DUO_ROLES.map(role => <option key={role}>{role}</option>)}
              </select>
            </label>
            <label>My partner plays
              <select value={draft.partnerRole} onChange={e => setDraft({ ...draft, partnerRole: e.target.value })}>
                {partnerRoles.map(role => <option key={role} value={role}>{role === "Any" ? "Any role" : role}</option>)}
              </select>
            </label>
            <label>Playstyle
              <select value={draft.vibe} onChange={e => setDraft({ ...draft, vibe: e.target.value })}>
                {Object.entries(playstyles).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
              </select>
            </label>
            <label>Partner’s chat preference
              <select value={draft.communication} onChange={e => setDraft({ ...draft, communication: e.target.value })}>
                {Object.entries(communications).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
              </select>
            </label>
          </div>
          <details className="duo-times">
            <summary>Usual play times · {draft.blocks.length ? draft.blocks.length + " selected" : "Any time"}</summary>
            <p className="meta">These times are local to each player. Agree on a time and time zone after connecting.</p>
            <div className="duo-checks">
              {SCHEDULE_BLOCKS.map(block => <label key={block}>
                <input type="checkbox" checked={draft.blocks.includes(block)} onChange={e => {
                  const blocks = e.target.checked ? [...draft.blocks, block] : draft.blocks.filter(b => b !== block);
                  setDraft({ ...draft, blocks });
                }} /> {block}
              </label>)}
            </div>
          </details>
          <div className="duo-controls">
            <button className="btn gold" type="submit">
              {action.busy ? "Saving…" : !signedIn || action.authStep === "signin" ? "Sign in to save my plan"
                : action.authStep === "enrol" ? "Confirm my account" : saved ? "Update my plan" : "Save my plan"}
            </button>
            {saved && <button className="btn secondary" type="button" onClick={clear}>Clear saved plan</button>}
          </div>
        </fieldset>
        <ActionFeedback error={action.error} />
        {notice && <p className="meta" role="status">{notice}</p>}
      </form>
      <nav className="duo-list-views" aria-label="Community discussions">
        <Link href={discussion}>Explore {discussionRole && discussionRole !== "Fill" ? discussionRole.toLowerCase() + " " : ""}matchup questions</Link>
        <Link href="/review-hour">Bot-lane review hour</Link>
      </nav>
    </section>
  );
}
