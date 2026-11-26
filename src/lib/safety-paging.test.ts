import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("@neondatabase/serverless", async () => ({ neon: (await import("../../test/postgres")).neonForTests }));
import { postgres } from "../../test/postgres";
import { q,getSql } from "./db";
import { dispatchBatch } from "../../scripts/safety-pager.mjs";
const receipt="957b3cf7-6907-48ef-b329-5abaae1c2b32";
beforeAll(async()=>{
  vi.stubEnv("DATABASE_URL","postgresql://local-fixture.invalid/main");vi.stubEnv("VERCEL_ENV","development");
  await q`INSERT INTO wp_safety_urgent(receipt,target_kind,target_id,rule,evidence) VALUES (${receipt},'post',4,'threats','synthetic fixture')`;
});
afterAll(async()=>{vi.unstubAllEnvs();await postgres.close();});
it("retries a failed delivery and deduplicates later passes without sending evidence",async()=>{
  const db=await getSql(),send=vi.fn().mockRejectedValueOnce(new Error("unavailable")).mockResolvedValueOnce(undefined);
  expect(await dispatchBatch(db,send)).toEqual({attempts:1,failures:1});
  expect(await dispatchBatch(db,send)).toEqual({attempts:0,failures:0});
  await q`UPDATE wp_safety_page_delivery SET next_attempt=now() WHERE receipt=${receipt}`;
  expect(await dispatchBatch(db,send)).toEqual({attempts:1,failures:0});
  expect(await dispatchBatch(db,send)).toEqual({attempts:0,failures:0});
  expect(Object.keys(send.mock.calls[1][0]).sort()).toEqual(["opened_at","receipt"]);
});
