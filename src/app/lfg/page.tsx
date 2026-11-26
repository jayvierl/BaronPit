import { signInHref } from "@/lib/signin-return";
import "./duo.css";
import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { duoEnabled, duoEligible, readDuoBoard, type DuoListing, type DuoRequest } from "@/lib/duo";
import { loadDuoFit } from "@/lib/duo-fit-store";
import { LfgBoard, LfgForm } from "@/components/lfg-ui";
import { DuoFitForm } from "@/components/duo-fit-form";

export const dynamic = "force-dynamic";
type BoardState =
  | { status: "paused" | "guest" | "ineligible" | "error" }
  | { status: "ready"; listings: DuoListing[]; requests: DuoRequest[] };

async function loadBoard(userId: number | undefined, onlyFit: boolean): Promise<BoardState> {
  if (!duoEnabled()) return { status: "paused" };
  if (!userId) return { status: "guest" };
  try {
    if (!(await duoEligible(userId))) return { status: "ineligible" };
    return { status: "ready", ...(await readDuoBoard(userId, onlyFit)) };
  } catch {
    return { status: "error" };
  }
}

export default async function LfgPage({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const [query, viewer] = await Promise.all([searchParams, getCurrentUser()]);
  const onlyFit = query.view !== "all";
  const [state, stored] = await Promise.all([
    loadBoard(viewer?.id, onlyFit),
    viewer ? loadDuoFit(viewer.id).catch(() => undefined) : null,
  ]);
  const fit = stored ?? null;
  return (
    <div className="duo-page">
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
      {state.status === "ineligible" && (
        <aside className="duo-status">
          <h2>Check your eligibility</h2>
          <p>Confirm your age group and terms in your account. After your first 24 hours, matching requires
            verified Riot ownership and recent ranked data. Refresh your linked player’s stats to update your eligibility.</p>
          <Link href="/me">My account</Link>
        </aside>
      )}
      {state.status === "ready" && (
        <>
          <p className="meta">Listings last four hours. You see a teammate’s Riot ID after both of you agree to connect.</p>
          <LfgBoard listings={state.listings} requests={state.requests} fit={fit} onlyFit={onlyFit} />
          {!state.listings.some(l => l.own) && <LfgForm key={JSON.stringify(fit)} fit={fit} />}
        </>
      )}
      {state.status === "error" && <p className="notice" role="status">Duo Finder couldn’t load. Try again shortly.</p>}
      {stored === undefined ? <p role="status">Your saved duo plan is temporarily unavailable. Refresh to try again.</p>
        : <DuoFitForm saved={fit} signedIn={!!viewer} />}
      <footer className="duo-foot">
        <p className="meta">Keep passwords, payment details and contact handles private. You can report a listing or request. Voice is optional.</p>
        <Link href="/lfg/thanks">Thanking a teammate after a game</Link>
      </footer>
    </div>
  );
}
