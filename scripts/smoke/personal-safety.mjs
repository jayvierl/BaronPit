export async function checkPersonalSafety(journey) {
  const page = "/me/safety";
  await journey(page, { status: 307, signInReturn: page });
  await journey("/me", { session: true, includes: ["Safety settings"] });
  await journey(page, {
    session: true,
    includes: ["You have no blocked players.", "You have no muted players.", "Reports you made"],
    excludes: ["Fixture Blocked"],
  });

  const mutate = (kind, userId, enabled) => journey(`/api/social/${kind}`, {
    session: true,
    method: "POST",
    body: { userId, [kind]: enabled },
    includes: ['"ok":true'],
  });
  await mutate("block", 503, true);
  await mutate("mute", 504, true);

  await journey(page, {
    session: true,
    html: true,
    includes: ['aria-label="Unblock Fixture Blocked"', 'aria-label="Unmute Fixture Other"'],
    excludes: ["blocked@example.invalid", "other@example.invalid"],
  });
  await journey(page, { session: "helper", excludes: ["Fixture Blocked", "Fixture Other"] });

  await mutate("block", 503, false);
  await mutate("mute", 504, false);
  await journey(page, {
    session: true,
    includes: ["You have no blocked players.", "You have no muted players."],
    excludes: ["Fixture Blocked", "Fixture Other"],
  });
}
