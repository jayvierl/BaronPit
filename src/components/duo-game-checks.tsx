import { privateGameChecks } from "@/lib/duo-game-check";
import { DuoGameCheckButton } from "./duo-game-check-button";

const utcFormatter = new Intl.DateTimeFormat("en", {
  month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "UTC", timeZoneName: "short",
});
function utc(value: string) {
  return utcFormatter.format(new Date(value));
}
export async function DuoGameChecks({ userId }: { userId: number }) {
  const checks = await privateGameChecks(userId).catch(() => null);
  if (!checks) return <p role="status">Your recent game checks could not load.</p>;
  if (!checks.length) return null;
  return <section className="card" aria-labelledby="recent-duo-games">
    <h2 id="recent-duo-games">Your duo games</h2>
    <p>Either partner can check both recent Riot profiles for a shared game after accepting. Older games and hidden teammates can leave a result unknown.</p>
    {checks.map(check => <article key={check.requestId}>
      <h3>Invitation accepted <time dateTime={check.acceptedAt}>{utc(check.acceptedAt)}</time></h3>
      <p>{check.firstGameAt ? "First shared game verified · " + utc(check.firstGameAt)
        : "First game awaiting confirmation."}</p>
      {check.firstGameAt && (check.repeatGameAt || !check.cancelled) && <p>{check.repeatGameAt ? "Played again on another day · " + utc(check.repeatGameAt)
        : "Repeat game awaiting confirmation. The check covers later UTC dates within seven days of your first game."}</p>}
      {check.checkedAt && <p className="meta">Last checked <time dateTime={check.checkedAt}>{utc(check.checkedAt)}</time>.</p>}
      {!check.cancelled && <DuoGameCheckButton id={check.requestId} />}
    </article>)}
  </section>;
}
