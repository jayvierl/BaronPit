import { afterAll, beforeAll, afterEach, describe, expect, it, vi } from "vitest";
import { memoryStorage } from "../../test/browser-storage";
import { beginDraftSignIn, consumeAuthDraft, copyableDraftText, hasDraftContinuation } from "./auth-draft";
import { discussionMetadata } from "./discussion-library-preview";
import { POST as writeReply } from "../app/api/social/comments/route";
import { postgres } from "../../test/postgres";
import { TERMS_VERSION } from "./account-policy";
import { q } from "./db";
import { createHash } from "node:crypto";
import { rateLimit } from "./auth";
import { POST as acceptTerms } from "../app/api/account/eligibility/route";
import { isSameOriginWrite, emailOrigin, requireUser } from "./auth-http";
import { POST as requestLink } from "../app/api/auth/request-link/route";
import { GET as visitLegacyLink, POST as confirm } from "../app/api/auth/verify/route";
import { POST as vote } from "../app/api/social/vote/route";
import { POST as block } from "../app/api/social/block/route";

vi.mock("@neondatabase/serverless",async()=>({neon:(await import("../../test/postgres")).neonForTests}));
const fakes=vi.hoisted(()=>({email:vi.fn(), cookie:{value:""}}));
vi.mock("./auth-email",()=>({sendMagicLinkEmail:fakes.email}));
vi.mock("next/headers",()=>({cookies:async()=>({get:()=>fakes.cookie.value ? {value:fakes.cookie.value} : undefined})}));
beforeAll(async()=>{
  vi.stubEnv("DATABASE_URL","postgresql://local.invalid/auth-test"); vi.stubEnv("APP_ORIGIN","https://app.test");
  vi.stubEnv("RESEND_API_KEY","inert-test-value"); fakes.email.mockResolvedValue({ok:true});
  await q`SELECT 1`;
},30000);
afterEach(()=>{fakes.cookie.value=""; fakes.email.mockClear();});
afterAll(async()=>{vi.unstubAllEnvs(); await postgres.close();});
function request(path:string,body:unknown) {
  return new Request("https://app.test"+path,{method:"POST",headers:{"Content-Type":"application/json",origin:"https://app.test"},body:JSON.stringify(body)});
}
const signup = (email:string, next?:string) => requestLink(request("/api/auth/request-link",{email,mode:"signup",ageBand:"teen",next}));

describe("passwordless account lifecycle",()=>{
  it("checks exact intent and the configured email destination independently",()=>{
    const wrong = new Request("https://app.test/api/auth/request-link",{headers:{origin:"https://elsewhere.test"}});
    expect(isSameOriginWrite(wrong)).toBe(false);
    expect(emailOrigin(new Request("https://unconfigured.test"))).toBeNull();
    expect(emailOrigin(wrong)).toBeNull();
    expect(isSameOriginWrite(new Request("https://app.test/api/auth/request-link"))).toBe(false);
  });
  it("preserves the original sign-in host for a configured public alias", () => {
    const previous = process.env.AUTH_PUBLIC_ALIASES;
    try {
      process.env.AUTH_PUBLIC_ALIASES = "https://original.test, https://www.community.test";
      for (const origin of ["https://original.test", "https://www.community.test"]) {
        expect(emailOrigin(new Request(origin + "/signin", { headers: { origin } }))).toBe(origin);
      }
      const unknown = "https://elsewhere.test";
      expect(emailOrigin(new Request(unknown + "/signin", { headers: { origin: unknown } }))).toBeNull();
    } finally {
      if (previous === undefined) delete process.env.AUTH_PUBLIC_ALIASES;
      else process.env.AUTH_PUBLIC_ALIASES = previous;
    }
  });
  it("accepts the exact browser authority when Next normalizes its loopback listener, and only trusts a configured TLS origin across a proxy",()=>{
    const via=(host:string,origin:string)=>new Request("http://localhost:3174/api/auth/request-link",{headers:{host,origin}});
    expect(isSameOriginWrite(via("127.0.0.1:3174","http://127.0.0.1:3174"))).toBe(true);
    expect(isSameOriginWrite(via("127.0.0.1:3174","http://127.0.0.1:3175"))).toBe(false);
    expect(isSameOriginWrite(via("app.test","https://different-app.test"))).toBe(false);
    expect(emailOrigin(via("app.test","https://app.test"))).toBe("https://app.test");
    expect(emailOrigin(via("unconfigured.test","https://unconfigured.test"))).toBeNull();
  });
  it("does not create an account or dispatch mail for unknown sign-in or an ineligible signup",async()=>{
    expect((await requestLink(request("/api/auth/request-link",{email:"unknown@example.test", mode:"signin"}))).status).toBe(200);
    expect((await requestLink(request("/api/auth/request-link",{email:"unknown@example.test", mode:"signup",ageBand:"child"}))).status).toBe(400);
    expect(fakes.email).not.toHaveBeenCalled();
    expect(await q`SELECT id FROM wp_users`).toHaveLength(0);
  });
  it("keeps mail previews read-only and atomically creates a single pseudonymous session after affirmative consent",async()=>{
    const email="private.localpart@example.test";
    expect((await signup(email, "/rooms/champ-ashe#compose")).status).toBe(200);
    const [,raw,signUp] = fakes.email.mock.calls[0];
    expect(signUp).toBe(true);
    const emailed = new URL(raw);
    expect(emailed.origin+emailed.pathname).toBe("https://app.test/signin/confirm");
    expect(emailed.search).toBe("");
    const token=emailed.hash.slice(1);
    const legacy=visitLegacyLink(new Request("https://app.test/api/auth/verify?token="+token));
    expect(legacy.headers.get("location")).toBe(emailed.pathname + emailed.hash);
    expect(legacy.headers.get("set-cookie")).toBeNull();
    const verify=(input:unknown)=>confirm(request("/api/auth/verify",input));
    expect(await (await verify({token,action:"inspect"})).json()).toMatchObject({needsConsent:true});
    expect((await verify({token,action:"confirm"})).status).toBe(410);
    expect(await q`SELECT id FROM wp_sessions`).toHaveLength(0);
    const body={token,action:"confirm",ageBand:"teen",termsVersion:TERMS_VERSION,accepted:true};
    const results=await Promise.all([verify({...body,next:"/lfg"}),verify(body)]);
    expect(results.map(r=>r.status).sort()).toEqual([200,410]);
    const success=results.find(r=>r.status===200)!;
    expect(await success.json()).toMatchObject({ returnTo: "/rooms/champ-ashe#compose" });
    const cookie=results.find(r=>r.status===200)!.headers.get("set-cookie")!;
    expect(cookie).toMatch(/httponly/i); expect(cookie).toMatch(/secure/i); expect(cookie).toMatch(/samesite=lax/i);
    const [user]=await q`SELECT id,display_name,age_band,terms_version FROM wp_users WHERE email=${email}`;
    expect(user.display_name).toMatch(/^Player [a-f0-9]{8}$/); expect(user.age_band).toBe("teen");
    expect(user.terms_version).toBe(TERMS_VERSION); expect(await q`SELECT id FROM wp_sessions`).toHaveLength(1);
    fakes.cookie.value=cookie.split(";")[0].slice("wp_session=".length);
    await q`UPDATE wp_users SET banned_until=now()+interval '1 day' WHERE id=${user.id}`;
    expect((await vote(request("/api/social/vote",{postId:1,optionIdx:1}))).status).toBe(403);
    // The same suspended user still reaches the normal validation in a safety route.
    expect((await block(request("/api/social/block",{userId:user.id,block:true}))).status).toBe(400);
    expect((await requireUser(request("/moderation",{}),"protect")).ok).toBe(true);
  });
  it("migrates an existing signed-in account without changing its private age group or bypassing an incident pause",async()=>{
    const email="legacy@example.test", token="a".repeat(64);
    const [u]=await q`INSERT INTO wp_users(email,display_name) VALUES(${email},'Legacy') RETURNING id`;
    await q`INSERT INTO wp_sessions(user_id,token_hash,expires_at) VALUES(${u.id},${createHash("sha256").update(token).digest("hex")},now()+interval '1 day')`;
    fakes.cookie.value=token;
    const mutation=request("/api/social/follow",{});
    expect((await requireUser(mutation)).ok).toBe(false);
    expect((await acceptTerms(request("/api/account/eligibility",{ageBand:"teen",accepted:true,termsVersion:TERMS_VERSION}))).status).toBe(200);
    expect((await requireUser(mutation)).ok).toBe(true);
    expect((await acceptTerms(request("/api/account/eligibility",{ageBand:"adult",accepted:true,termsVersion:TERMS_VERSION}))).status).toBe(409);
    vi.stubEnv("SAFETY_PAUSE_PUBLICATION","true");
    try {
      const paused=await requireUser(mutation);
      expect(!paused.ok && paused.response.status).toBe(503);
      expect((await requireUser(mutation,"protect")).ok).toBe(true);
    } finally {vi.stubEnv("SAFETY_PAUSE_PUBLICATION","false");}
  });
  it("redeems a legacy player's sign-in with fresh consent and preserves their identity",async()=>{
    const email="existing@example.test";
    const [old]=await q`INSERT INTO wp_users(email,display_name) VALUES(${email},'Existing name') RETURNING id`;
    expect((await requestLink(request("/api/auth/request-link",{email,mode:"signin"}))).status).toBe(200);
    const token=new URL(fakes.email.mock.calls[0][1]).hash.slice(1);
    const verify=(body:unknown)=>confirm(request("/api/auth/verify",body));
    expect(await (await verify({token,action:"inspect"})).json()).toMatchObject({needsConsent:true});
    expect((await verify({token,action:"confirm",ageBand:"adult",accepted:true,termsVersion:TERMS_VERSION})).status).toBe(200);
    expect(await q`SELECT id,display_name,age_band,terms_version FROM wp_users WHERE email=${email}`).toEqual([
      {id:old.id,display_name:"Existing name",age_band:"adult",terms_version:TERMS_VERSION}]);
    expect((await requestLink(request("/api/auth/request-link",{email,mode:"signin"}))).status).toBe(200);
    const nextToken=new URL(fakes.email.mock.calls[1][1]).hash.slice(1);
    expect(await (await verify({token:nextToken,action:"inspect"})).json()).toMatchObject({needsConsent:false});
    expect((await verify({token:nextToken,action:"confirm"})).status).toBe(200);
  });
  it("asks again when a legacy account has a terms version but no recorded acceptance", async () => {
    const email = "partial-consent@example.test";
    await q`INSERT INTO wp_users(email,display_name,age_band,terms_version)
      VALUES (${email},'Returning host','adult',${TERMS_VERSION})`;
    await requestLink(request("/api/auth/request-link", { email, mode: "signin", next: "/review-hour" }));
    const token = new URL(fakes.email.mock.calls[0][1]).hash.slice(1);
    const verify = (body: object) => confirm(request("/api/auth/verify", { token, ...body }));

    expect(await (await verify({ action: "inspect" })).json()).toMatchObject({ needsConsent: true, ageBand: "adult" });
    expect((await verify({ action: "confirm" })).status).toBe(410);
    const accepted = await verify({ action: "confirm", ageBand: "adult", termsVersion: TERMS_VERSION, accepted: true });
    expect(await accepted.json()).toMatchObject({ ok: true, returnTo: "/review-hour" });
    const [user] = await q`SELECT terms_accepted_at FROM wp_users WHERE email=${email}`;
    expect(user.terms_accepted_at).toBeTruthy();
    fakes.cookie.value = accepted.headers.get("set-cookie")!.split(";")[0].slice("wp_session=".length);
    expect((await requireUser(request("/contribute", {}))).ok).toBe(true);
    await q`UPDATE wp_users SET terms_accepted_at=NULL WHERE email=${email}`;
    expect((await requireUser(request("/contribute", {}))).ok).toBe(false);
  });
  it("opens a shared thread, confirms a sign-in and publishes a restored phone reply only on submission", async () => {
    const email = "reader@phone-test.invalid";
    const [author] = await q`INSERT INTO wp_users (email,display_name) VALUES ('author@phone-test.invalid','Test partner') RETURNING id`;
    await q`INSERT INTO wp_users (email,display_name,age_band,terms_version,terms_accepted_at,created_at)
      VALUES (${email},'Reader','adult',${TERMS_VERSION},now(),now()-interval '7 days')`;
    const question = "When should our duo recall before dragon?";
    const [post] = await q`INSERT INTO wp_posts (author_id,kind,body,status) VALUES (${author.id},'text',${question},'visible') RETURNING id`;
    await q`INSERT INTO wp_decisions (post_id,champion,role,topic) VALUES (${post.id},'Ashe','Bot','Laning')`;
    const destination = "/post/" + post.id + "#replies-" + post.id;
    const metadata = await discussionMetadata(String(post.id));
    expect(metadata.openGraph).toMatchObject({url:"https://app.test/post/" + post.id,description:question});
    const originalBrowser = memoryStorage(), mailBrowser = memoryStorage(), scope = "reply:" + post.id;
    const body = "I would recall when the cannon wave is under their tower.";
    const login = new URL(beginDraftSignIn(originalBrowser,scope,destination,{body}), "https://app.test");
    const next = login.searchParams.get("next")!;
    expect(hasDraftContinuation(next)).toBe(true);
    expect(await (await requestLink(request("/api/auth/request-link",{mode:"signin",email,next}))).json()).toMatchObject({ok:true});
    const emailed = new URL(fakes.email.mock.calls[0][1]);
    expect(emailed.href).not.toContain(encodeURIComponent(body));
    expect(emailed.pathname).toBe("/signin/confirm");
    const token = emailed.hash.slice(1);
    expect((await confirm(request("/api/auth/verify",{action:"inspect",token}))).headers.get("set-cookie")).toBeNull();
    const confirmed = await confirm(request("/api/auth/verify",{action:"confirm",token}));
    const {returnTo} = await confirmed.json();
    expect(returnTo).toBe(next);
    fakes.cookie.value = confirmed.headers.get("set-cookie")!.split(";")[0].slice("wp_session=".length);
    expect(consumeAuthDraft(mailBrowser, scope, returnTo)).toBeNull();
    expect(copyableDraftText(mailBrowser, returnTo)).toBeNull();
    expect(copyableDraftText(originalBrowser, returnTo.replace("/post/" + post.id, "/me"))).toBeNull();
    expect(copyableDraftText(originalBrowser, returnTo)).toBe(body);
    const recovered = consumeAuthDraft(originalBrowser,scope,returnTo);
    expect(recovered).toEqual({destination,payload:{body}});
    expect(await q`SELECT id FROM wp_comments WHERE post_id=${post.id}`).toHaveLength(0);
    expect(await (await writeReply(request("/api/social/comments",{postId:post.id,body:recovered!.payload.body}))).json())
      .toMatchObject({ok:true,status:"visible"});
    expect(await q`SELECT body FROM wp_comments WHERE post_id=${post.id}`).toEqual([{body}]);
    expect(copyableDraftText(originalBrowser,returnTo)).toBeNull();
  });
  it("enforces a sliding action limit under overlapping attempts",async()=>{
    const granted=await Promise.all(Array.from({length:8},()=>rateLimit(1,"fixture-endorsement",3,1440)));
    expect(granted.filter(Boolean)).toHaveLength(3);
    await q`UPDATE wp_action_windows SET hits=ARRAY[now()-interval '25 hours'] WHERE bucket='user:1:fixture-endorsement'`;
    expect(await rateLimit(1,"fixture-endorsement",3,1440)).toBe(true);
  });
  it("rejects signed-out contributions before validating the post body",async()=>{
    expect((await vote(request("/api/social/vote",null))).status).toBe(401);
  });
});
