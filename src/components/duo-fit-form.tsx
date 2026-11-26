"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DUO_ROLES, SCHEDULE_BLOCKS } from "@/lib/pure";
import { communications, partnerRoles, parseDuoFit, playstyles, type DuoFit } from "@/lib/duo-fit";
import { beginDraftSignIn, restoreAfterMount } from "@/lib/auth-draft";
import { signInHref } from "@/lib/signin-return";
import { DuoTimeZone, useBrowserTimeZone } from "./duo-time-zone";
import { scheduleHours, timeZoneName } from "@/lib/duo-schedule";
import { ActionFeedback, usePostAction } from "./post-action";
import { useHydrated } from "./use-hydrated";

const draftScope = "private-duo-plan";

function formChoices(form: HTMLFormElement) {
  const blocks: string[] = [];
  const choices: Record<string, unknown> = { blocks };
  for (const field of form.querySelectorAll<HTMLInputElement | HTMLSelectElement>("[data-duo-field]")) {
    const name = field.dataset.duoField;
    if (name === "blocks") {
      if (field.matches("input:checked")) blocks.push(field.value);
    } else if (name) choices[name] = field.value;
  }
  return choices;
}

export function DuoFitForm({ saved, signedIn, returnTo }: { saved: DuoFit | null; signedIn: boolean; returnTo: string }) {
  const browserZone = useBrowserTimeZone();
  const hydrated = useHydrated();
  const form = useRef<HTMLFormElement>(null);
  const [initial, setInitial] = useState({ fit: saved, key: 0 });
  const [role, setRole] = useState<string>(saved?.role ?? "");
  const [blockCount, setBlockCount] = useState(saved?.blocks.length ?? 0);
  const [notice, setNotice] = useState("");
  const [directSignIn, setDirectSignIn] = useState<string | null>(null);
  const action = usePostAction();
  const router = useRouter();
  useEffect(() => {
    if (!hydrated || !form.current) return;
    // Read native edits made before React attached the handlers.
    const current = form.current;
    const frame = requestAnimationFrame(() => {
      const choices = formChoices(current);
      setRole(typeof choices.role === "string" ? choices.role : "");
      setBlockCount(Array.isArray(choices.blocks) ? choices.blocks.length : 0);
    });
    return () => cancelAnimationFrame(frame);
  }, [hydrated]);
  useEffect(() => {
    if (!signedIn) return;
    return restoreAfterMount(draftScope, payload => {
      const fit = parseDuoFit(payload);
      if (fit) {
        setInitial(previous => ({ fit, key: previous.key + 1 }));
        setRole(fit.role);
        setBlockCount(fit.blocks.length);
        setNotice("Your choices are ready. Save them to your account.");
      }
    });
  }, [signedIn]);

  function signIn(fit: DuoFit, mode?: "enrol") {
    try {
      router.push(beginDraftSignIn(window.localStorage, draftScope, returnTo, fit, mode));
    } catch {
      setNotice("This browser couldn’t keep your choices. Enter them again after signing in.");
      setDirectSignIn(signInHref(returnTo, mode));
    }
  }
  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!hydrated) return;
    const choices = formChoices(e.currentTarget);
    if (!timeZoneName(choices.timeZone)) { setNotice("Choose a valid schedule time zone, such as Europe/London."); return; }
    const fit = parseDuoFit(choices);
    if (!fit) { setNotice("Check your role and partner preferences."); return; }
    if (!signedIn || action.authStep) return signIn(fit, action.authStep === "enrol" ? "enrol" : undefined);
    setNotice("");
    if (await action.send("/api/lfg/preferences", { ...fit, action: "save" })) {
      setNotice("Your duo plan is saved privately.");
      router.refresh();
    }
  }
  async function clear() {
    setNotice("");
    if (await action.send("/api/lfg/preferences", { action: "clear" })) {
      setInitial(previous => ({ fit: null, key: previous.key + 1 }));
      setRole("");
      setBlockCount(0);
      setNotice("Your saved duo plan was cleared.");
      router.refresh();
    }
  }

  const discussionRole = role === "ADC" ? "Bot" : role;
  const discussion = discussionRole && discussionRole !== "Fill"
    ? "/questions?mode=unanswered&role=" + encodeURIComponent(discussionRole)
    : "/questions?mode=unanswered";

  return (
    <section className="duo-plan card" id="duo-plan" aria-labelledby="duo-plan-title">
      <h2 id="duo-plan-title">Your duo plan</h2>
      <p>Choose who you want to queue with. Your preferences stay private. You decide when to post a listing.</p>
      {saved?.blocks.length && !saved.timeZone ? <p className="notice">Save your time zone to match your play times with another player’s.</p> : null}
      <form ref={form} action="/signin" method="get" onSubmit={save}>
        <input type="hidden" name="next" value={returnTo} />
        <fieldset key={initial.key} disabled={action.busy}>
          <div className="duo-fields">
            <label>My role
              <select required defaultValue={initial.fit?.role ?? ""} data-duo-field="role" onChange={e => setRole(e.target.value)}>
                <option value="">Choose a role</option>
                {DUO_ROLES.map(role => <option key={role}>{role}</option>)}
              </select>
            </label>
            <label>My partner plays
              <select defaultValue={initial.fit?.partnerRole ?? "Any"} data-duo-field="partnerRole">
                {partnerRoles.map(role => <option key={role} value={role}>{role === "Any" ? "Any role" : role}</option>)}
              </select>
            </label>
            <label>Playstyle
              <select defaultValue={initial.fit?.vibe ?? "both"} data-duo-field="vibe">
                {Object.entries(playstyles).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
              </select>
            </label>
            <label>Partner’s chat preference
              <select defaultValue={initial.fit?.communication ?? "any"} data-duo-field="communication">
                {Object.entries(communications).map(([key, value]) => <option key={key} value={key}>{value}</option>)}
              </select>
            </label>
          </div>
          <details className="duo-times">
            <summary>Usual play times · {blockCount ? blockCount + " selected" : "Any time"}</summary>
            <DuoTimeZone defaultValue={initial.fit?.timeZone ?? browserZone} />
            <p className="meta">{scheduleHours} Weekends are Saturday and Sunday in this time zone.</p>
            <div className="duo-checks">
              {SCHEDULE_BLOCKS.map(block => <label key={block}>
                <input type="checkbox" value={block} data-duo-field="blocks" defaultChecked={initial.fit?.blocks.includes(block)}
                  onChange={e => setBlockCount(e.currentTarget.form?.querySelectorAll('[data-duo-field="blocks"]:checked').length ?? 0)} /> {block}
              </label>)}
            </div>
          </details>
          <div className="duo-controls">
            <button className="btn gold" type="submit" disabled={!hydrated}>
              {action.busy ? "Saving…" : !signedIn || action.authStep === "signin" ? "Sign in to save my plan"
                : action.authStep === "enrol" ? "Confirm my account" : saved ? "Update my plan" : "Save my plan"}
            </button>
            {saved && <button className="btn secondary" type="button" disabled={!hydrated} onClick={clear}>Clear saved plan</button>}
          </div>
        </fieldset>
        <ActionFeedback error={action.error} />
        {notice && <p className="meta" role="status">{notice}</p>}
        {directSignIn && <a className="btn secondary" href={directSignIn}>Sign in to continue</a>}
      </form>
      <noscript>{signedIn ? <p>Enable JavaScript to save your duo preferences.</p> : <p>
        <a href={signInHref(returnTo)}>Sign in to continue</a>. Enter your preferences again after signing in.
      </p>}</noscript>
      <nav className="duo-list-views" aria-label="Community discussions">
        <Link href={discussion}>Explore {discussionRole && discussionRole !== "Fill" ? discussionRole.toLowerCase() + " " : ""}matchup questions</Link>
        <Link href="/review-hour">Bot-lane review hour</Link>
      </nav>
    </section>
  );
}
