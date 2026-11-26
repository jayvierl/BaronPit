import { duoEnabled } from "@/lib/duo";
import { duoPilotResults, duoPilotWindows } from "@/lib/duo-pilot";

function countRate(n: number, denominator: number) {
  return denominator ? `${n} of ${denominator} (${Math.round(100*n/denominator)}%)` : "No eligible pairs";
}

export async function DuoPilotResults() {
  const now = new Date();
  const windows = Object.values(duoPilotWindows(now));
  const reports = await Promise.all(windows.map(async window => ({
    window, data: await duoPilotResults(window).catch(() => null),
  })));
  return (
    <section className="card">
      <h2>Duo Finder conversion</h2>
      {!duoEnabled() && <p>Verified matching is paused. New players cannot enter this study.</p>}
      <p>Outcomes observed at {now.toISOString().replace("T"," ").slice(0,19)} UTC.</p>
      {reports.map(({window,data}) => <div key={window.label}>
        <h3>{window.label}</h3>
        <p className="meta">Requests opened from {window.start.replace("T"," ").slice(0,16)} up to
          {" "}{window.end.replace("T"," ").slice(0,16)} UTC, exclusive.</p>
        {!data ? <p role="status">These results couldn’t load. Refresh before evaluating the pilot.</p> : <>
        <p>{data.enrolled} current volunteers enrolled by the end of this window. During this window, {data.listed} submitted a listing and {data.sent} sent a request.
          Of players receiving a request opened in this window, {data.acceptedInvites} have accepted one.
          Each count covers distinct players and can overlap.</p>
        <table>
          <caption>Requests opened in this period by two consenting players</caption>
          <thead><tr><th scope="col">Stage</th><th scope="col">Distinct pairs</th><th scope="col">Distinct players</th></tr></thead>
          <tbody>
            <tr><th scope="row">Requested</th><td>{data.pairs}</td><td>{data.pairedPeople}</td></tr>
            <tr><th scope="row">Accepted / requested</th><td>{countRate(data.accepted,data.pairs)}</td><td>{data.acceptedPeople}</td></tr>
            <tr><th scope="row">Confirmed teammates / accepted</th><td>{countRate(data.played,data.accepted)}</td><td>{data.playedPeople}</td></tr>
            <tr><th scope="row">Both chose to queue again / confirmed teammates</th><td>{countRate(data.mutual,data.played)}</td><td>{data.mutualPeople}</td></tr>
          </tbody>
        </table>
        {data.medianAcceptanceMinutes !== null && <p>Median wait from request to acceptance was
          {" "}{data.medianAcceptanceMinutes} minutes across {data.acceptedRequests} accepted invitations.</p>}
        <p>Second game on a later UTC day within seven days of the first was observed for
          {" "}{countRate(data.observedRepeat,data.maturePlayed)} first-game pairs with a full seven days elapsed.
          Among those pairs, repeat status is unknown for {data.repeatUnknown} because recent records do not cover the window.</p>
        </>}
      </div>)}
        <p className="meta">The completed week gives every request at least seven days to convert. The exact follow-up time varies by request.
          Only currently active consents are included. Recently opened requests have had less time to convert.
          A first game requires a matching Riot start time after acceptance and visible teammate evidence from both profiles.
          A pair may check its recent games to preserve the result for 30 days. Games that roll off unchecked can be missed.</p>
    </section>
  );
}
