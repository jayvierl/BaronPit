import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { neonForTests, postgres, testQueries } from "../../test/postgres";
import { DAILY_CALL_LAUNCH_KEY } from "./daily-call-schema";

const fixture = vi.hoisted(() => ({ neon: undefined as (() => unknown) | undefined }));
vi.mock("@neondatabase/serverless", () => ({ neon: () => fixture.neon?.() }));
fixture.neon = neonForTests;

beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", "postgresql://local-fixture.invalid/launch");
  vi.stubEnv("WARD_PREVIEW_DATABASE_URL", "postgresql://local-fixture.invalid/preview");
  vi.stubEnv("VERCEL_ENV", "production");
  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "false");
  await postgres.exec(`CREATE TABLE wp_meta (key text PRIMARY KEY, value text NOT NULL DEFAULT '');
    INSERT INTO wp_meta VALUES ('schema_generation','1'),('last_patch','16.23.1');`);
}, 30_000);

afterAll(async () => { await postgres.close(); vi.unstubAllEnvs(); });

async function coldStart() {
  vi.resetModules();
  testQueries.length = 0;
  const { getSql } = await import("./db");
  await getSql();
}

async function clearLaunchFixture() {
  await postgres.exec("TRUNCATE wp_daily_calls; DELETE FROM wp_posts; DELETE FROM wp_meta WHERE key LIKE 'daily_call:%' OR key='daily_call_launch_v2';");
}

async function launchMarker() {
  return (await postgres.query("SELECT value FROM wp_meta WHERE key=$1", [DAILY_CALL_LAUNCH_KEY])).rows;
}

async function callCount() {
  return (await postgres.query("SELECT count(*)::int AS n FROM wp_daily_calls")).rows;
}

it("publishes one launch poll after committing the current generation and leaves other bootstrap state intact", async () => {
  await coldStart();
  const migrate = testQueries.findIndex(statement => statement.includes("INSERT INTO wp_meta(key,value) VALUES ('schema_generation'"));
  const open = testQueries.findIndex(statement => statement.includes("INSERT INTO wp_daily_calls(day,post_id"));
  expect(migrate).toBeGreaterThan(-1);
  expect(open).toBeGreaterThan(migrate);
  expect(await callCount()).toEqual([{ n: 1 }]);
  expect(await launchMarker()).toEqual([{ value: "handled" }]);
  expect((await postgres.query("SELECT value FROM wp_meta WHERE key='last_patch'")).rows).toEqual([{value:"16.23.1"}]);
  await coldStart();
  expect(testQueries).toHaveLength(1);
  expect(await callCount()).toEqual([{ n: 1 }]);
});

it("lets production perform the one-time launch when a preview already installed the schema", async () => {
  await clearLaunchFixture();
  await postgres.exec("UPDATE wp_meta SET value='1' WHERE key='schema_generation'");
  vi.stubEnv("VERCEL_ENV", "preview");
  try {
    await coldStart();
    expect(await callCount()).toEqual([{ n: 0 }]);
    expect(await launchMarker()).toEqual([]);
  } finally { vi.stubEnv("VERCEL_ENV", "production"); }
  await coldStart();
  expect(testQueries.some(statement => statement.includes("CREATE TABLE IF NOT EXISTS wp_users"))).toBe(false);
  expect(await callCount()).toEqual([{ n: 1 }]);
  expect(await launchMarker()).toEqual([{ value: "handled" }]);
});

it("marks a prior scheduled round as handled without replacing it", async () => {
  await postgres.query("DELETE FROM wp_meta WHERE key=$1", [DAILY_CALL_LAUNCH_KEY]);
  const before = (await postgres.query("SELECT post_id FROM wp_daily_calls")).rows;
  await coldStart();
  expect((await postgres.query("SELECT post_id FROM wp_daily_calls")).rows).toEqual(before);
  expect(await launchMarker()).toEqual([{ value: "handled" }]);
});

it("honors a publication pause and lets the ordinary cron recover", async () => {
  await clearLaunchFixture();
  vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "true");
  try {
    await coldStart();
    expect(await callCount()).toEqual([{ n: 0 }]);
    expect(await launchMarker()).toEqual([{ value: "handled" }]);
  } finally { vi.stubEnv("SAFETY_PAUSE_PUBLICATION", "false"); }
  await coldStart();
  expect(await callCount()).toEqual([{ n: 0 }]);
  const { runDailyCall } = await import("./daily-call");
  expect(await runDailyCall()).toMatchObject({ opened: 1 });
});

it("skips automatic publication on a newer schema generation even if the launch marker is absent", async () => {
  await clearLaunchFixture();
  await postgres.exec("UPDATE wp_meta SET value='6' WHERE key='schema_generation'");
  await coldStart();
  expect(testQueries).toHaveLength(1);
  expect(await callCount()).toEqual([{ n: 0 }]);
  expect(await launchMarker()).toEqual([]);
});
