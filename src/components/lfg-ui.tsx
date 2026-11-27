"use client";
import { useMemo, useState, useSyncExternalStore } from "react";
import { useBrowserTimeZone } from "./duo-time-zone";
import { scheduleWindows, timeZoneName } from "@/lib/duo-schedule";
import { coversSession, RANKED_QUEUE, NORMAL_QUEUE, sessionQueues, isSessionQueue, type SessionQueue, sessionOptions, sessionTime, sessionWindow } from "@/lib/duo-session";
import { duoFitReasons, partnerRoles, playstyles, type DuoFit } from "@/lib/duo-fit";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DUO_ROLES } from "@/lib/pure";
import type { DuoListing, DuoRequest } from "@/lib/duo";
import { DuoPinButton } from "./duo-shortlist";
import { playerStatsHref } from "@/lib/platforms";
import { postJson } from "@/lib/client";
import { DuoReminder } from "./duo-reminder";
import { DuoCancelButton } from "./duo-cancel-button";
import { RankBadge } from "./rank-badge";
import { SafetyReport } from "./safety-report";

function subscribeClock(notify: () => void) {
  const timer = window.setInterval(notify, 30_000);
  return () => window.clearInterval(timer);
}
const currentMinute = () => Math.floor(Date.now() / 60_000) * 60_000;
function useSessionClock(asOf: number) {
  return useSyncExternalStore(subscribeClock, currentMinute, () => asOf);
}

function toggled(selected: string[], value: string) {
  return selected.includes(value) ? selected.filter((r) => r !== value) : [...selected, value];
}
function DuoButton({ action, id, children }: { action: string; id: number; children: React.ReactNode }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState("");
  const router = useRouter();
  async function submit() {
    setBusy(true);
    setResult("");
    try {
      const { ok, data } = await postJson("/api/lfg", { action, id });
      if (ok) {
        setResult("Saved.");
        router.refresh();
      } else setResult(String(data.error ?? "Please try again."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <span>
      <button type="button" className="btn small secondary" disabled={busy} onClick={submit}>
        {busy ? "Saving…" : children}
      </button>
      {result && (
        <span role="status" className="meta">
          {" "}
          {result}
        </span>
      )}
    </span>
  );
}
function LfgForm({ fit, now, rankedPilot }: { fit: DuoFit | null; now: number; rankedPilot: boolean }) {
  const router = useRouter();
  const browserZone = useBrowserTimeZone();
  const [queue, setQueue] = useState<SessionQueue>(rankedPilot ? RANKED_QUEUE : NORMAL_QUEUE);
  const [partnerRole, setPartnerRole] = useState<string>(fit?.partnerRole ?? "Any");
  const timeZone = fit?.timeZone ?? browserZone;
  const starts = sessionOptions(now);
  const [chosenStart, setStart] = useState<number | null>(null);
  const start = chosenStart !== null && starts.includes(chosenStart) ? chosenStart : 0;
  const [roles, setRoles] = useState<string[]>(fit ? [fit.role] : []);
  // Voice on a listing is about this player. A partner preference never opts the player into voice.
  const [voice, setVoice] = useState(false),
    [vibe, setVibe] = useState<string>(fit?.vibe ?? "both"),
    [note, setNote] = useState("");
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState("");
  async function publish(e: React.FormEvent) {
    e.preventDefault();
    if (!start) { setMessage("Choose an upcoming session."); return; }
    setBusy(true);
    setMessage("");
    try {
      const { ok, data } = await postJson("/api/lfg", { action: "create", queue, start, roles, partnerRole, voice, vibe, note });
      if (ok) {
        setMessage(data.held ? "Your listing is in review." : "Your session is open for requests.");
        setNote("");
        router.refresh();
      } else setMessage(String(data.error ?? "Couldn’t publish that listing."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="card" onSubmit={publish}>
      <h2>Post a listing</h2>
      <div className="field" role="group" aria-label="Roles">
        <strong>Roles I play (choose up to three)</strong>
        <div className="duo-controls">
          {DUO_ROLES.map((r) => (
            <button
              type="button"
              key={r}
              aria-pressed={roles.includes(r)}
              disabled={!roles.includes(r) && roles.length >= 3}
              className={`kind-tab${roles.includes(r) ? " active" : ""}`}
              onClick={() => setRoles(toggled(roles, r))}
            >
              {r}
            </button>
          ))}
        </div>
      </div>
      <label className="field">My partner plays
        <select value={partnerRole} onChange={e => setPartnerRole(e.target.value)}>
          {partnerRoles.map(r => <option key={r} value={r}>{r === "Any" ? "Any role" : r}</option>)}
        </select>
      </label>
      <label className="field">Queue
        <select value={queue} onChange={e => { if (isSessionQueue(e.target.value)) setQueue(e.target.value); }}>
          {rankedPilot && <option value={RANKED_QUEUE}>{sessionQueues[RANKED_QUEUE]}</option>}
          <option value={NORMAL_QUEUE}>{sessionQueues[NORMAL_QUEUE]}</option>
        </select>
      </label>
      {!rankedPilot && <p className="meta">Ranked sessions currently support verified Iron–Emerald Solo/Duo placements. Normal Draft is available for your account.</p>}
      <label className="field">Session time · {timeZone}
        <select value={start} required onChange={e => setStart(Number(e.target.value))}>
          <option value={0}>Choose one hour to play</option>
          {starts.map(t => <option value={t} key={t}>{sessionTime(t, timeZone)}</option>)}
        </select>
      </label>
      <label className="field">
        Playstyle
        <select value={vibe} onChange={(e) => setVibe(e.target.value)}>
          <option value="both">Flexible</option>
          <option value="chill">Chill</option>
          <option value="tryhard">Competitive</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={voice} onChange={(e) => setVoice(e.target.checked)} /> Open to voice
        chat
      </label>
      <label className="field">
        Game plan
        <textarea
          value={note}
          maxLength={300}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Looking to practise bot-lane trades"
        />
      </label>
      <p className="meta">Only people you accept receive your Riot ID{queue === RANKED_QUEUE ? " and social profile link" : ""}. Invitations close at the start of the session.</p>
      <button className="btn" disabled={busy || !roles.length || !start}>
        {busy ? "Posting…" : "Post listing"}
      </button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
export function LfgBoard({ listings, requests, fit, onlyFit, asOf, requestsOnly = false, pinnedIds = null, hosting }: {
  listings: DuoListing[]; requests: DuoRequest[]; fit: DuoFit | null; onlyFit: boolean; asOf:number; requestsOnly?: boolean; pinnedIds?: number[] | null;
  hosting?: { riotId: string; rankedPilot: boolean };
}) {
  const now = useSessionClock(asOf);
  const browserZone = useBrowserTimeZone();
  const viewZone = timeZoneName(fit?.timeZone) ?? browserZone;
  const preferred = useMemo(() => scheduleWindows(fit?.blocks ?? [], fit?.timeZone, asOf, 1), [fit, asOf]);
  const displayed = listings.filter(l => Date.parse(l.expiresAt) > now && (l.own || (l.start !== null && l.start > now)));
  const pinRequests = new Map<number, number>();
  if (pinnedIds) for (const request of requests) {
    const peer = request.socialProfileId;
    if (peer !== null && request.riotId && (request.contactEndsAt === null || request.contactEndsAt > now) && !pinRequests.has(peer)) {
      pinRequests.set(peer, request.id);
    }
  }
  return (
    <>
      {!!requests.length && (
        <section>
          <h2>Your duo requests</h2>
          {requests.map((r) => (
            <article className="card" key={r.id} id={"duo-request-" + r.id}>
              <strong>
                {r.status === "cancelled" ? "Duo booking canceled" : r.status === "accepted" ? "Matched" : r.incoming ? "Incoming request" : "Request sent"}
              </strong>
              <p>
                <RankBadge tier={r.rankTier}>{r.rank}</RankBadge> · {r.platform}
              </p>
              {r.session && <p>{sessionQueues[r.session.queue]} · {sessionTime(r.session.start, viewZone)}<br/>
                {r.session.roles.join(" / ")} · {playstyles[r.session.vibe as keyof typeof playstyles]} · {r.session.voice ? "Open to voice" : "Text only"}</p>}
              {r.requeue && (
                <div>
                  <p>
                    <strong>Play together again</strong>
                    {r.matchedAt && (
                      <span className="meta">
                        {" "}
                        · Connected{" "}
                        {new Date(r.matchedAt).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                          timeZoneName: "short",
                          timeZone: "UTC",
                        })}
                      </span>
                    )}
                  </p>
                  <p>
                    {r.requeue === "mutual"
                      ? "Both of you want another game."
                      : r.requeue === "waiting"
                        ? "Your choice is private until you both opt in."
                        : "You played together after matching. Your choice stays private until you both say yes."}
                  </p>
                  <DuoButton id={r.id} action={r.requeue === "available" ? "requeue" : "withdraw-requeue"}>
                    {r.requeue === "available" ? "I'd queue again" : "Withdraw my choice"}
                  </DuoButton>
                </div>
              )}
              {r.thanks && (
                <section aria-label="Post-game appreciation">
                  {r.thanks.received && <p>Your duo thanked you for the game.</p>}
                  {r.thanks.sent ? <p>You sent your duo a private thank-you.</p> : r.thanks.canSend && (
                    <DuoButton id={r.id} action="thank">Send a private thank-you</DuoButton>
                  )}
                  {r.thanks.canSend && (r.thanks.recentlyEndorsed
                    ? <p className="meta">You’ve endorsed this player in the past 30 days.</p>
                    : <div>
                      <DuoButton id={r.id} action="endorse">Endorse as a good teammate</DuoButton>
                      <p className="meta">Adds one to their public profile count. Your name stays private.</p>
                    </div>)}
                  {r.thanks.adultPair && <p className="meta"><Link href="/lfg/thanks">See how a future tip could be split</Link></p>}
                </section>
              )}
              {r.riotId && (r.contactEndsAt === null || r.contactEndsAt > now) && (
                <p>
                  Add <strong>{r.riotId}</strong> in League.{" "}
                  <Link prefetch={false} href={playerStatsHref(r.platform.toLowerCase(), r.riotId)}>View player stats</Link>
                  {r.socialProfileId !== null && <> · <Link prefetch={false} href={"/u/"+r.socialProfileId}>Visit duo profile</Link></>}
                </p>
              )}
              {r.socialProfileId !== null && pinnedIds && pinRequests.get(r.socialProfileId) === r.id &&
                <DuoPinButton key={r.socialProfileId} playerId={r.socialProfileId} initial={pinnedIds.includes(r.socialProfileId)}/>}
              {r.status === "pending" && !r.session && <p>Earlier invitation. Ask for a new session to choose a time together.</p>}
              {r.status === "pending" && r.session && r.session.start <= now && <p>This session has started. You can choose another listing.</p>}
              {r.status === "pending" && r.incoming && r.session?.compatible && r.session.start > now && (
                <p className="meta">Accepting shares both Riot IDs{r.session.queue === RANKED_QUEUE ? " and social profile links" : ""} until the end of the session. Either player can check recent matches for a game together.</p>
              )}
              {r.status === "pending" && r.session && !r.session.compatible && <p>Your current Solo/Duo placements no longer match this session.</p>}
              {r.status === "accepted" && r.session && r.session.start > now && r.cancellationEndsAt !== null && <DuoReminder id={r.id} />}
              {r.cancellationEndsAt !== null && r.cancellationEndsAt > now && <DuoCancelButton id={r.id} />}
              <div className="duo-controls">
                {r.status === "pending" && r.incoming && r.session?.compatible && r.session.start > now && (
                  <DuoButton action="accept" id={r.id}>
                    {r.session.queue === RANKED_QUEUE ? "Accept and share profiles" : "Accept and share Riot IDs"}
                  </DuoButton>
                )}
                {r.status === "pending" && (
                  <DuoButton action="decline" id={r.id}>
                    {r.incoming ? "Decline" : "Withdraw"}
                  </DuoButton>
                )}
                <DuoButton action="block-request" id={r.id}>
                  Block player
                </DuoButton>
                <SafetyReport kind="duo_request" targetId={r.id} />
              </div>
            </article>
          ))}
        </section>
      )}
      {!requestsOnly && <>
      <h2 id="open-listings">Open listings</h2>
      <nav className="duo-list-views" aria-label="Open listing views">
        {fit && <Link href="/lfg?view=fit#open-listings" aria-current={onlyFit ? "page" : undefined}>Matches my plan</Link>}
        <Link href="/lfg?view=all#open-listings" aria-current={!onlyFit || !fit ? "page" : undefined}>All eligible listings</Link>
        <Link href="#duo-plan">{fit ? "Edit my plan" : "Set my preferences"}</Link>
      </nav>
      <p className="meta">Ranked sessions appear first. Times shown in {viewZone}.</p>
      {onlyFit && fit?.blocks.length && !fit.timeZone ? <p className="meta">Save a time zone in <Link href="#duo-plan">your duo plan</Link> to match your play times.</p> : null}
      {!displayed.some(listing => !listing.own) && (
        <p className="empty">
          {fit && onlyFit ? "No upcoming sessions match your plan. Browse all sessions or choose a time to host."
             : "No upcoming sessions for your region and age group. You can choose a time to host."}
        </p>
      )}
      {displayed.map(l => {
        const hasSharedTime = l.start !== null && coversSession(preferred, sessionWindow(l.start));
        const playTime = l.start !== null ? sessionTime(l.start, viewZone) : "Earlier listing · choose a new session to receive invitations";
        return (
          <article key={l.id} className="card">
            <strong>{l.own ? (l.held ? "Your listing is in review" : "Your listing") : <RankBadge tier={l.rankTier}>{l.rank}</RankBadge>}</strong>
            <p className="meta">{l.queue && sessionQueues[l.queue]}{l.queue === RANKED_QUEUE && !l.own && " · Compatible Solo/Duo ranks"}</p>
            <p>
              {l.roles.join(" / ")} · {l.partnerRole ? (l.partnerRole === "Any" ? "Open to any partner role" : "Looking for " + l.partnerRole) : "Partner role unspecified"} · {l.platform}
            </p>
            <p>
              {playTime} · {l.voice ? "Open to voice" : "Text only"} ·{" "}
              {l.vibe === "both" ? "Flexible" : l.vibe === "tryhard" ? "Competitive" : "Chill"}
            </p>
            {fit && !l.own && <FitReasons fit={fit} listing={l} sharedTime={hasSharedTime} />}
            {l.soloRecord && <p>Ranked Solo/Duo this season · {l.soloRecord}</p>}
            {l.form && <p>Recent form, all queues · {l.form}</p>}
            {!!l.champs.length && <p>Recent champions · {l.champs.join(", ")}</p>}
            {l.note && <p>{l.note}</p>}
            {l.own ? (
              <DuoButton action="close" id={l.id}>
                Close listing
              </DuoButton>
            ) : (
              <div className="duo-controls">
                {l.requestState ? (
                  <span className="meta">{l.requestState === "pending" ? "Request already sent" : "Your request is closed"}</span>
                ) : (
                  <SessionRequest listing={l} fit={fit} zone={viewZone} />
                )}
                <DuoButton action="block-listing" id={l.id}>
                  Block player
                </DuoButton>
                <SafetyReport kind="lfg" targetId={l.id} />
              </div>
            )}
          </article>
        );
      })}
      {hosting && !displayed.some(listing => listing.own) &&
        <LfgForm key={JSON.stringify([fit, hosting.riotId, hosting.rankedPilot])} fit={fit} now={now} rankedPilot={hosting.rankedPilot}/>}
      </>}
    </>
  );
}

function FitReasons({ fit, listing, sharedTime }: { fit: DuoFit; listing: DuoListing; sharedTime: boolean }) {
  const reasons = duoFitReasons(fit, listing, sharedTime);
  return reasons.length ? <p className="duo-reasons"><strong>Shared preferences</strong> · {reasons.join(" · ")}</p> : null;
}

function SessionRequest({listing, fit, zone}: {listing: DuoListing; fit: DuoFit | null; zone: string}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const allowedRoles = DUO_ROLES.filter(r => listing.partnerRole === "Any" || r === "Fill" || r === listing.partnerRole);
  const [role, setRole] = useState<string>(fit && allowedRoles.some(r => r === fit.role) ? fit.role : "");
  const [voice, setVoice] = useState(false);
  const [vibe, setVibe] = useState(fit?.vibe ?? "both");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  if (listing.start === null || listing.queue === null) return null;
  if (!open) return <button className="btn small secondary" type="button" onClick={() => setOpen(true)}>Request this session</button>;
  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!role || busy) return;
    setBusy(true);
    try {
      const result = await postJson("/api/lfg", {action:"request", id:listing.id, queue:listing.queue, start:listing.start, role, voice, vibe});
      setMessage(result.ok ? "Request sent." : String(result.data.error ?? "Please try again."));
      if (result.ok) router.refresh();
    } finally { setBusy(false); }
  }
  return <form className="card" onSubmit={send}>
    <h3>Request this session</h3>
    <p>{sessionQueues[listing.queue]} · {sessionTime(listing.start,zone)}</p>
    <label className="field">My role this game
      <select required value={role} onChange={e => setRole(e.target.value)}>
        <option value="">Choose a role</option>
        {allowedRoles.map(r => <option key={r}>{r}</option>)}
      </select>
    </label>
    <label className="field">My playstyle
      <select value={vibe} onChange={e => setVibe(e.target.value as DuoFit["vibe"])}>
        {Object.entries(playstyles).map(([value,label]) => <option key={value} value={value}>{label}</option>)}
      </select>
    </label>
    <label><input type="checkbox" checked={voice} onChange={e => setVoice(e.target.checked)} /> I’m open to voice</label>
    <p className="meta">They’ll see these choices, your rank and server. Accepting shares your Riot IDs{listing.queue === RANKED_QUEUE ? " and links to your social profiles" : ""} until the session ends. Either player can check for a shared game.</p>
    <button className="btn small" disabled={busy || !role}>Send session request</button>{" "}
    <button className="text-btn" type="button" disabled={busy} onClick={() => setOpen(false)}>Cancel</button>
    {message && <p role="status">{message}</p>}
  </form>;
}
