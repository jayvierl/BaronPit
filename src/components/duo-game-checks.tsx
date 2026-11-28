import { privateGameChecks } from "@/lib/duo-game-check";
import { DuoGameCheckButton } from "./duo-game-check-button";
import { LocalTime } from "./local-time";

const gameTime = { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" } as const;
export async function DuoGameChecks({ userId }: { userId: number }) {
  const checks = await privateGameChecks(userId).catch(() => null);
  if (!checks) return <p role="status">Your recent game checks could not load.</p>;
  if (!checks.length) return null;
  return <section className="card" aria-labelledby="recent-duo-games">
    <h2 id="recent-duo-games">Your duo games</h2>
    <p>Either partner can check both recent Riot profiles for a shared game after accepting. Older games and hidden teammates can leave a result unknown.</p>
    {checks.map(check => <article key={check.requestId}>
      <h3>Invitation accepted <LocalTime iso={check.acceptedAt} format={gameTime} /></h3>
      <p>{check.firstGameAt ? <>First shared game verified · <LocalTime iso={check.firstGameAt} format={gameTime} /></>
        : "First game awaiting confirmation."}</p>
      {check.firstGameAt && (check.repeatGameAt || !check.cancelled) && <p>{check.repeatGameAt ? <>Played again on another day · <LocalTime iso={check.repeatGameAt} format={gameTime} /></>
        : "Repeat game awaiting confirmation. The check covers later UTC dates within seven days of your first game."}</p>}
      {check.checkedAt && <p className="meta">Last checked <LocalTime iso={check.checkedAt} format={gameTime} />.</p>}
      {!check.cancelled && <DuoGameCheckButton id={check.requestId} />}
    </article>)}
  </section>;
}
