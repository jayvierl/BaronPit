import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
import { postgres, testQueries } from "../../test/postgres";
import { q } from "./db";
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL","postgresql://local-fixture.invalid/old");
  vi.stubEnv("VERCEL_ENV","development");
  // An older release may already have rows here when the new schema arrives.
  await postgres.exec("CREATE TABLE wp_meta (key text PRIMARY KEY, value text NOT NULL DEFAULT ''); INSERT INTO wp_meta VALUES ('last_patch','16.23.1')");
});
afterAll(async()=>{vi.unstubAllEnvs();await postgres.close();});
it("brings an existing install forward atomically and retains its patch state",async()=>{
  const rows = await q`SELECT key,value FROM wp_meta ORDER BY key`;
  expect(rows).toContainEqual({key:"last_patch",value:"16.23.1"});
  expect(rows.some(r=>r.key==="schema_revision")).toBe(true);
  expect(await q`SELECT to_regclass('wp_safety_page_delivery') IS NOT NULL AS installed`).toEqual([{installed:true}]);
  testQueries.length=0;
  await q`SELECT 1`;
  expect(testQueries).toHaveLength(1);
});
