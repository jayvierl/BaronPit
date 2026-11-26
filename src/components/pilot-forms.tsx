"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ActionFeedback, usePostAction } from "./post-action";
import type { Interest, PilotChannel } from "@/lib/pilot";

type Props = {
  host: boolean;
  duoStarted: string | null | undefined;
  duoOpen: boolean;
  channel: PilotChannel;
  joinedAt: string | null;
  interest: Interest | null;
  current: boolean;
};
export function PilotForms({ host, duoStarted, duoOpen, channel, joinedAt, interest, current }: Props) {
  const action = usePostAction();
  const router = useRouter();
  const [status, setStatus] = useState("");
  async function submit(body: Record<string, unknown>, message: string) {
    setStatus("");
    if (await action.send("/api/pilot", body)) {
      setStatus(message);
      router.refresh();
    }
  }
  function enroll(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    void submit(
      { action: "join", channel: f.get("channel"), role: f.get("role"), consent: f.has("consent") },
      "You joined the pilot.",
    );
  }
  function sendInterest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const f = new FormData(event.currentTarget);
    void submit(
      {
        action: "interest",
        audience: f.get("audience"),
        intent: f.get("intent"),
        budget: f.get("budget"),
        consent: f.has("consent"),
      },
      "Your research response has been saved.",
    );
  }
  return (
    <>
      {joinedAt ? (
        <section className="card">
          <h2>Your pilot</h2>
          <p>
            You joined on {joinedAt.slice(0, 10)} UTC. Your 28-day measurement window ends on{" "}
            {new Date(Date.parse(joinedAt) + 28 * 86400000).toISOString().slice(0, 10)} UTC.
          </p>
          <Link href="/rooms">Find a discussion</Link>
        </section>
      ) : (
        current && (
          <form className="card" onSubmit={enroll}>
            <h2>{host ? "Join as an invited host" : "Join as a player"}</h2>
            {host ? (
              <p>Host replies are counted separately from independent player replies.</p>
            ) : (
              <>
                <p>
                  Use a primary linked NA player in Silver, Gold or Platinum. Your chosen role must appear in
                  recent matches from a lookup in the past seven days. Linking a player does not verify Riot
                  ownership.
                </p>
                <Link href="/me">Manage my linked player</Link>
                <div className="field">
                  <label htmlFor="pilot-role">Which role are you here to discuss?</label>
                  <select name="role" id="pilot-role" required defaultValue="">
                    <option value="" disabled>
                      Choose a role
                    </option>
                    <option value="UTILITY">Support</option>
                    <option value="BOTTOM">Bot carry (ADC)</option>
                  </select>
                </div>
              </>
            )}
            <div className="field">
              <label htmlFor="pilot-channel">How did you find this pilot?</label>
              <select name="channel" id="pilot-channel" defaultValue={channel}>
                <option value="community">Player community or open discussion</option>
                <option value="club">Club or coach invitation</option>
              </select>
            </div>
            <p>
              <label>
                <input type="checkbox" name="consent" required /> I agree to the pilot measurement described
                on this page.
              </label>
            </p>
            <button className="btn gold" disabled={action.busy}>
              Join the four-week pilot
            </button>
          </form>
        )
      )}
      <section className="card" id="duo-study">
        <h2>Duo Finder study</h2>
        <p>For 28 days, you can let us count whether you submit a listing, send a request, or accept one.
          If both players agreed before a request, we can also count the pair’s acceptance, a confirmed game
          together and a mutual choice to queue again. Staff see totals for the last seven days and an earlier completed week.</p>
        <p className="meta">This study keeps your account reference and consent date. Withdrawing removes
          your participation and any pair involving you from the results immediately.</p>
        {duoStarted === undefined ? <p role="status">Your duo study settings couldn’t load. Refresh to try again.</p>
          : duoStarted ? <>
            <p>Your consent ends on {new Date(Date.parse(duoStarted) + 28 * 86400000).toISOString().slice(0,10)} UTC.</p>
            <button type="button" className="text-btn" disabled={action.busy}
              onClick={() => void submit({action:"leave-duo"}, "Your duo study consent was deleted.")}>Withdraw from the duo study</button>
          </> : !duoOpen ? <p>Enrollment opens with verified Duo Finder matching.</p>
          : host ? <p>Staff and invited hosts are excluded from the duo study.</p>
          : current && <form onSubmit={event => {
            event.preventDefault();
            void submit({action:"join-duo",consent:new FormData(event.currentTarget).has("duo-consent")}, "You joined the duo study.");
          }}>
            <p>Enrollment requires an eligible verified Riot account. Duo Finder is available independently of this study.</p>
            <label><input type="checkbox" name="duo-consent" required /> I agree to this separate 28-day duo study.</label>
            <p><button className="btn secondary" disabled={action.busy}>Join the duo study</button></p>
          </form>}
      </section>
      {!current && (
        <p className="notice">Participation requires current community terms and an unrestricted account.</p>
      )}
      {current && (
        <details className="card" open={!!interest}>
          <summary>Coach or club research</summary>
          <p>
            Would a weekly player-question review be worth running with your group? This optional response
            helps us choose what to test. No purchase or outreach is scheduled.
          </p>
          <form onSubmit={sendInterest}>
            <div className="field">
              <label htmlFor="pilot-audience">I represent</label>
              <select id="pilot-audience" name="audience" defaultValue={interest?.audience ?? "coach"}>
                <option value="coach">A coach or coaching group</option>
                <option value="club">A player club</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="pilot-intent">Which commitment fits?</label>
              <select id="pilot-intent" name="intent" defaultValue={interest?.intent ?? "discuss"}>
                <option value="discuss">I would discuss this in an interview</option>
                <option value="trial">I would host a free four-week trial</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="pilot-budget">Hypothetical monthly group budget (USD)</label>
              <select id="pilot-budget" name="budget" defaultValue={interest?.budget ?? "unknown"}>
                <option value="unknown">Prefer not to say / unknown</option>
                <option value="free">Free only</option>
                <option value="1-10">$1–10</option>
                <option value="11-25">$11–25</option>
                <option value="26+">$26 or more</option>
              </select>
            </div>
            <p>
              <label>
                <input type="checkbox" required name="consent" /> Save this research response with my account
                for up to eight weeks.
              </label>
            </p>
            <button className="btn secondary" disabled={action.busy}>
              {interest ? "Update research response" : "Save research response"}
            </button>
          </form>
        </details>
      )}
      {(joinedAt || interest || duoStarted) && (
        <p>
          <button
            className="text-btn"
            disabled={action.busy}
            onClick={() => void submit({ action: "leave" }, "Your pilot and survey records were deleted.")}
          >
            Withdraw and delete my pilot and survey records
          </button>
        </p>
      )}
      <ActionFeedback error={action.error} />
      <p role="status">{status}</p>
    </>
  );
}
