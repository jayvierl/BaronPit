import { arrivalConsent } from "@/lib/duo-evening";
import { PilotVisit } from "@/components/pilot-visit";
import { signInHref } from "@/lib/signin-return";
import "./duo.css";
import Link from "next/link";
import Image from "next/image";
import { getCurrentUser } from "@/lib/auth";
import { duoEnabled, readDuoBoard, type DuoListing, type DuoRequest } from "@/lib/duo";
import { privateDuoReadiness, type DuoReadiness } from "@/lib/duo-readiness";
import { loadDuoFit } from "@/lib/duo-fit-store";
import { LfgBoard, LfgForm } from "@/components/lfg-ui";
import { DuoGameChecks } from "@/components/duo-game-checks";
import { DuoFitForm } from "@/components/duo-fit-form";
import { pinnedDuoIds } from "@/lib/duo-shortlist";

export const dynamic = "force-dynamic";
type BoardState =
  | { status: "guest" | "error" }
  | { status: "paused"; readiness?: DuoReadiness }
  | { status: "ineligible"; asOf: number; earlierRequests?: DuoRequest[]; readiness: Extract<DuoReadiness,{ready:false}> }
  | { status: "ready"; riotId: string; rankedPilot: boolean; listings: DuoListing[]; requests: DuoRequest[]; asOf: number };

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
    return { status: "ready", riotId: readiness.riotId, rankedPilot: readiness.rankedPilot, asOf, ...(await readDuoBoard(userId, onlyFit, asOf)) };
  } catch {
    return { status: "error" };
  }
}

export default async function LfgPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const [query, viewer] = await Promise.all([searchParams, getCurrentUser()]);
  const onlyFit = query.view !== "all";
  const boardHref = onlyFit ? "/lfg" : "/lfg?view=all";
  const [state, stored, measuring] = await Promise.all([
    loadBoard(viewer?.id, onlyFit),
    viewer ? loadDuoFit(viewer.id).catch(() => undefined) : null,
    viewer && onlyFit && duoEnabled() ? arrivalConsent(viewer.id,true).catch(() => false) : false,
  ]);
  const fit = stored ?? null;
  const readiness = state.status === "paused" || state.status === "ineligible" ? state.readiness : undefined;
  const requests = state.status === "ready" ? state.requests : state.status === "ineligible" ? state.earlierRequests ?? [] : [];
  const pins = viewer ? await pinnedDuoIds(viewer.id, requests.flatMap(request => request.socialProfileId ?? [])).catch(() => null) : null;
  return (
    <div className="duo-page">
      {measuring && fit && state.status === "ready" && <PilotVisit kind="duo-board"/>}
      <header className="duo-intro">
        <div>
          <h1 className="page-title">Find a duo</h1>
          <p>Find a lane partner for the hours you actually play.</p>
          {viewer && <Link className="meta" href="/playbook?tab=duos" prefetch={false}>Your Duo shortlist</Link>}
        </div>
        <Image unoptimized src="/baron-duo.webp" width={112} height={84} alt="" />
      </header>
      {state.status === "paused" && (
        <aside className="duo-status">
          <h2>Verified duo matching is coming</h2>
          <p>Listings open after Riot account verification and safety coverage are ready. You can save your private preferences now.</p>
          <Link href="#duo-plan">Set duo preferences</Link>
        </aside>
      )}
      {state.status === "guest" && (
        <p><Link href={signInHref(boardHref)} className="btn">Sign in to find a duo</Link></p>
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
        <LfgBoard requestsOnly listings={[]} requests={state.earlierRequests} fit={fit} onlyFit={false} asOf={state.asOf} pinnedIds={pins}/>
      )}
      {state.status === "ready" && (
        <>
          <p>Matching as <strong>{state.riotId}</strong> · NA · <Link href="/me">Manage Riot accounts</Link></p>
          <p className="meta">Choose an hour of Ranked Solo/Duo or Normal Draft on NA. Ranked listings match compatible Solo/Duo placements from Iron through Emerald. League confirms final queue eligibility.</p>
          <LfgBoard listings={state.listings} requests={state.requests} fit={fit} onlyFit={onlyFit} asOf={state.asOf} pinnedIds={pins}/>
          {!state.listings.some(l => l.own) && <LfgForm key={JSON.stringify([fit,state.riotId,state.rankedPilot])} fit={fit} asOf={state.asOf} rankedPilot={state.rankedPilot} />}
          <p className="meta"><Link href="/pilot#duo-study">Volunteer for the Duo Finder study</Link></p>
        </>
      )}
      {viewer && duoEnabled() && <DuoGameChecks userId={viewer.id}/> }
      {state.status === "error" && <p className="notice" role="status">Duo Finder couldn’t load. Try again shortly.</p>}
      {stored === undefined ? <p id="duo-plan" className="duo-plan" role="status">Your saved duo plan is temporarily unavailable. Refresh to try again.</p>
        : <DuoFitForm saved={fit} signedIn={!!viewer} returnTo={`${boardHref}#duo-plan`} />}
      <p><Link href="/pilot#duo-evening">Share availability for the proposed NA bot-lane evening</Link></p>
      <footer className="duo-foot">
        <p className="meta">Keep passwords, payment details and contact handles private. You can report a listing or request. Voice is optional.</p>
        <Link href="/lfg/thanks">Thanking a teammate after a game</Link>
      </footer>
    </div>
  );
}
