import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
import { postgres, testQueries } from "../../test/postgres";
import { getSql, q, schemaStatements } from "./db";
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
  expect(rows).toContainEqual({key:"schema_revision", value:"baron-profile-avatar-20261126-1"});
  expect(rows).toContainEqual({key:"schema_generation", value:"2"});
  expect(await q`SELECT to_regclass('wp_safety_page_delivery') IS NOT NULL AS installed`).toEqual([{installed:true}]);
  expect(await q`SELECT to_regclass('wp_duo_shortlist') IS NOT NULL AS installed`).toEqual([{installed:true}]);
  testQueries.length=0;
  await q`SELECT 1`;
  expect(testQueries).toHaveLength(1);
});

it("stops a stale cold-start transaction before it can reapply incompatible DDL", async () => {
  const sql = await getSql();
  await sql`UPDATE wp_meta SET value='3' WHERE key='schema_generation'`;
  testQueries.length = 0;
  await expect(sql.transaction(schemaStatements(sql, true))).rejects.toMatchObject({code:"BP001"});
  expect(testQueries.some(s => s.includes("CREATE TABLE IF NOT EXISTS wp_users"))).toBe(false);
  expect(await q`SELECT value FROM wp_meta WHERE key='schema_generation'`).toEqual([{value:"3"}]);
});
