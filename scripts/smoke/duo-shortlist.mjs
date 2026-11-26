export async function checkDuoShortlist(journey) {
  const saved = "/playbook?tab=duos";
  await journey(saved, { status: 307, signInReturn: saved });
  await journey("/u/504", { session: true, includes: ["Pin for duos", 'aria-pressed="false"'] });
  await journey("/u/504", { excludes: ["Pin for duos"] });
  await journey("/lfg", { session: true, includes: ["Your Duo shortlist", saved] });
  const write = (active, session = true) => journey("/api/social/duo-shortlist", {
    session, method: "POST", body: { playerId: 504, active }, includes: ['"ok":true'],
  });
  await write(true);
  await journey(saved, { session: true, includes: ["Duo shortlist", "Fixture Other", 'aria-label="Remove Fixture Other from Duo shortlist"'] });
  await journey(saved, { session: "helper", excludes: ["Fixture Other"], includes: ["Find community players"] });
  await write(false, "helper");
  await journey(saved, { session: true, includes: ["Fixture Other"] });
  await write(false);
  await journey(saved, { session: true, excludes: ["Fixture Other"], includes: ["Find community players"] });
}
