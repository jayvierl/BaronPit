import { arrivalConsent } from "@/lib/duo-evening";
import { PilotVisit } from "@/components/pilot-visit";
import { signInHref } from "@/lib/signin-return";
import "./duo.css";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { duoEnabled, readDuoBoard, type DuoListing, type DuoRequest } from "@/lib/duo";
import { privateDuoReadiness, type DuoReadiness } from "@/lib/duo-readiness";
import { loadDuoFit } from "@/lib/duo-fit-store";
import { LfgBoard, LfgForm } from "@/components/lfg-ui";
import { DuoGameChecks } from "@/components/duo-game-checks";
import { DuoFitForm } from "@/components/duo-fit-form";

export const dynamic = "force-dynamic";
type BoardState =
  | { status: "guest" | "error" }
  | { status: "paused"; readiness?: DuoReadiness }
  | { status: "ineligible"; asOf: number; earlierRequests?: DuoRequest[]; readiness: Extract<DuoReadiness,{ready:false}> }
  | { status: "ready"; riotId: string; listings: DuoListing[]; requests: DuoRequest[]; asOf: number };

async function loadBoard(userId: number | undefined, onlyFit: boolean): Promise<BoardState> {
  const enabled = duoEnabled();
  if (!userId) return { status: enabled ? "guest" : "paused" };
  try {
    const readiness = await privateDuoReadiness(userId);
    if (!enabled) return { status: "paused", readiness };
    const asOf = Date.now();
    if (!readiness.ready) return {
      status: "ineligible", readiness, asOf,
      ...(readiness.regionOutsidePilot ? { earlierRequests: (await readDuoBoard(userId)).requests } : {}),
    };
    return { status: "ready", riotId: readiness.riotId, asOf, ...(await readDuoBoard(userId, onlyFit, asOf)) };
  } catch {
    return { status: "error" };
  }
}

export default async function LfgPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const [query, viewer] = await Promise.all([searchParams, getCurrentUser()]);
  const onlyFit = query.view !== "all";
  const [state, stored, measuring] = await Promise.all([
    loadBoard(viewer?.id, onlyFit),
    viewer ? loadDuoFit(viewer.id).catch(() => undefined) : null,
    viewer && onlyFit && duoEnabled() ? arrivalConsent(viewer.id,true).catch(() => false) : false,
  ]);
  const fit = stored ?? null;
  const readiness = state.status === "paused" || state.status === "ineligible" ? state.readiness : undefined;
  return (
    <div className="duo-page">
      {measuring && fit && state.status === "ready" && <PilotVisit kind="duo-board"/>}
      <header>
        <h1 className="page-title">Find a duo</h1>
        <p>Find someone who plays your partner role, likes your pace and queues when you do.</p>
      </header>
      {state.status === "paused" && (
        <aside className="duo-status">
          <h2>Verified duo matching is coming</h2>
          <p>Listings open once Riot account verification and community safety coverage are in place. You can set up your private duo plan today.</p>
        </aside>
      )}
      {state.status === "guest" && (
        <p><Link href={signInHref("/lfg")} className="btn">Sign in to find a duo</Link></p>
      )}
      {readiness && !readiness.ready && (
        <aside className="duo-status">
          <h2>{readiness.title}</h2>
          <p>{readiness.detail}</p>
          {readiness.availableAt && <p>Check again after <time dateTime={readiness.availableAt}>{new Date(readiness.availableAt).toUTCString()}</time>.</p>}
          {readiness.href && <Link href={readiness.href}>{readiness.action}</Link>}
        </aside>
      )}
      {state.status === "ineligible" && !!state.earlierRequests?.length && (
        <LfgBoard requestsOnly listings={[]} requests={state.earlierRequests} fit={fit} onlyFit={false} asOf={state.asOf} />
      )}
      {state.status === "ready" && (
        <>
          <p>Matching as <strong>{state.riotId}</strong> · NA · <Link href="/me">Manage Riot accounts</Link></p>
          <p className="meta">The pilot offers one-hour Normal Draft sessions on NA. Invitations close when the session starts. Accepting shares your Riot IDs until the session ends and lets either player check for a shared game.</p>
          <LfgBoard listings={state.listings} requests={state.requests} fit={fit} onlyFit={onlyFit} asOf={state.asOf} />
          {!state.listings.some(l => l.own) && <LfgForm key={JSON.stringify(fit)} fit={fit} asOf={state.asOf} />}
          <p className="meta"><Link href="/pilot#duo-study">Volunteer for the Duo Finder study</Link></p>
        </>
      )}
      {viewer && duoEnabled() && <DuoGameChecks userId={viewer.id}/> }
      {state.status === "error" && <p className="notice" role="status">Duo Finder couldn’t load. Try again shortly.</p>}
      {stored === undefined ? <p role="status">Your saved duo plan is temporarily unavailable. Refresh to try again.</p>
        : <DuoFitForm saved={fit} signedIn={!!viewer} />}
      <p><Link href="/pilot#duo-evening">Share availability for the proposed NA bot-lane evening</Link></p>
      <footer className="duo-foot">
        <p className="meta">Keep passwords, payment details and contact handles private. You can report a listing or request. Voice is optional.</p>
        <Link href="/lfg/thanks">Thanking a teammate after a game</Link>
      </footer>
    </div>
  );
}
