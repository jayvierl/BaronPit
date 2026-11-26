import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { postgres } from "../../../../../test/postgres";
import { q } from "@/lib/db";
import { GET, POST } from "./route";

const session = vi.hoisted(() => vi.fn());
vi.mock("@/lib/auth", async original => ({...await original<typeof import("@/lib/auth")>(), getCurrentUser:session}));
vi.mock("@neondatabase/serverless", async () => ({neon:(await import("../../../../../test/postgres")).neonForTests}));
vi.mock("@/lib/profile-photo-scanner", () => ({photoScanningEnabled:() => true}));

const staff = {id:1, email:"staff@photos.invalid", bannedUntil:null};
const author = {id:2, email:"author@photos.invalid", bannedUntil:null};
const id = "6a418a88-f08c-47db-93bf-7cc5014ac0c9";
const hash = "abc0".repeat(16);
const endpoint = "https://app.test/api/admin/profile-photos";
const get = (assetId=id, digest=hash) => GET(new Request(endpoint+"?"+new URLSearchParams({id:assetId,hash:digest})));
const decide = (body:unknown) => POST(new Request(endpoint,{
  method:"POST",headers:{origin:"https://app.test","content-type":"application/json"},body:JSON.stringify(body),
}));
const decision = {id,hash,approve:true};

function expectPrivate(response: Response) {
  expect(response.headers.get("cache-control")).toContain("private, no-store");
  expect(response.headers.get("vary")).toBe("Cookie");
  expect(response.headers.get("x-robots-tag")).toContain("noindex");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("cross-origin-resource-policy")).toBe("same-origin");
}

beforeAll(async () => {
  vi.stubEnv("VERCEL_ENV","development");
  vi.stubEnv("DATABASE_URL","postgresql://fixture.invalid/photo-review");
  vi.stubEnv("ADMIN_EMAILS",staff.email);
  await q`INSERT INTO wp_users(id,email,display_name) VALUES (1,${staff.email},'Staff'),(2,${author.email},'Author')`;
  await q`INSERT INTO wp_profile_photos(id,user_id,uploader_id,original_hash,content_hash,needs_human,status,automated_clear,image)
    VALUES(${id},2,2,${hash},${hash},true,'held',true,decode('52494646','hex'))`;
},30000);
beforeEach(async () => {
  session.mockReset().mockResolvedValue(staff);
  await q`UPDATE wp_profile_photos SET user_id=2,status='held',active=true WHERE id=${id}`;
});
afterAll(async () => {vi.unstubAllEnvs();await postgres.close();});

it("reveals no preview to signed-out, ordinary, or suspended reviewers and restricts write access", async () => {
  for (const [actor,status] of [[null,401],[author,403],[{...staff,bannedUntil:"2099-01-01"},403]] as const) {
    session.mockResolvedValue(actor);
    const preview = await get();
    expect(preview.status).toBe(404);
    expect(await preview.text()).toBe("");
    expectPrivate(preview);
    expect((await decide(decision)).status).toBe(status);
  }
});

it("serves a staff-only WebP with private headers after validating the complete id and digest", async () => {
  const preview = await get();
  expect(preview.status).toBe(200);
  expect(preview.headers.get("content-type")).toBe("image/webp");
  expectPrivate(preview);
  expect(Buffer.from(await preview.arrayBuffer()).toString("hex")).toBe("52494646");
  for (const [assetId,digest] of [[id.toUpperCase(),hash],[id+"x",hash],[id,hash.slice(1)],[id,hash.toUpperCase()]]) {
    const missing = await get(assetId,digest);
    expect(missing.status).toBe(404);
    expectPrivate(missing);
    expect((await decide({id:assetId,hash:digest,approve:true})).status).toBe(400);
  }
  expect((await decide({...decision,approve:"true"})).status).toBe(400);
});

it("rejects own and stale decisions, and applies one matching staff decision exactly once", async () => {
  await q`UPDATE wp_profile_photos SET user_id=1 WHERE id=${id}`;
  expect((await get()).status).toBe(404);
  expect((await decide(decision)).status).toBe(409);
  await q`UPDATE wp_profile_photos SET user_id=2 WHERE id=${id}`;
  expect((await decide({...decision,hash:"f".repeat(64)})).status).toBe(409);
  expect(await q`SELECT status FROM wp_profile_photos WHERE id=${id}`).toEqual([{status:"held"}]);
  const accepted = await decide(decision);
  expect(accepted.status).toBe(200);
  expectPrivate(accepted);
  expect((await decide(decision)).status).toBe(409);
  expect(await q`SELECT action FROM wp_mod_log ORDER BY id`).toEqual([{action:"photo_approve"}]);
});
