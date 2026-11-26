import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { once } from "node:events";
import { randomBytes } from "node:crypto";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { checkSubmissions } from "./submissions.mjs";
import { checkCommunityDuo } from "./community-duo.mjs";
import { checkPlayerProfiles } from "./profiles.mjs";
import { checkNavigation } from "./navigation.mjs";
import { checkProfileEditor } from "./profile-editor.mjs";
import { fixturePhotoEnv } from "./photo-scanner.mjs";
import { checkImage, publicArtwork } from "../public-art.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
await access(new URL("../../.next/BUILD_ID", import.meta.url)).catch(() => {
  throw new Error("Run npm run build before npm run smoke.");
});
const reservation = createServer();
reservation.listen(0, "127.0.0.1");
await once(reservation, "listening");
const port = reservation.address().port;
await new Promise((resolve) => reservation.close(resolve));
const origin = "http://localhost:" + port;
const session = randomBytes(32).toString("hex");
const helperSession = randomBytes(32).toString("hex");
const server = spawn(
  process.execPath,
  [
    "--import",
    "./scripts/smoke/transport.mjs",
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: root,
    env: {
      PATH: process.env.PATH,
      HOME: process.env.HOME,
      TMPDIR: process.env.TMPDIR,
      NODE_ENV: "production",
      NEXT_TELEMETRY_DISABLED: "1",
      DATABASE_URL: "postgresql://fixture:fixture@ep-fixture.invalid/ward_smoke",
      SMOKE_ORIGIN: origin,
      SMOKE_SESSION: session,
      SMOKE_HELPER_SESSION: helperSession,
      // A smoke runner never receives real provider keys or a shared database URL.
      RIOT_API_KEY: "fixture-only",
      __NEXT_PROCESSED_ENV: "true",
      CRON_SECRET: "",
      RESEND_API_KEY: "",
      BLOB_READ_WRITE_TOKEN: "",
      ...fixturePhotoEnv,
      VERCEL_ENV: "development",
      DUO_MATCHING_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let output = "";
for (const stream of [server.stdout, server.stderr])
  stream.on("data", (b) => {
    output = (output + b.toString()).slice(-4000);
  });
const signed = { cookie: "wp_session=" + session };
let completed = 0;
async function journey(
  path,
  { status = 200, session = false, includes = [], excludes = [], method = "GET", body, base = origin, signInReturn, html = false, upload, expectWebp = false } = {},
) {
  const res = await fetch(base + path, {
    method,
    headers: {
      ...(session === "helper" ? {cookie: "wp_session=" + helperSession} : session ? signed : {}),
      ...(method !== "GET" ? { origin: base, "content-type": upload ? "image/webp" : "application/json" } : {}),
    },
    body: upload ?? (body === undefined ? undefined : JSON.stringify(body)),
    redirect: "manual",
    signal: AbortSignal.timeout(20000),
  });
  if (expectWebp) {
    assert.equal(res.status, status, path);
    assert.match(res.headers.get("content-type") ?? "", /^image\/webp/);
    assert.match(res.headers.get("cache-control") ?? "", /no-store/);
    const bytes = Buffer.from(await res.arrayBuffer());
    assert.equal(bytes.subarray(0, 4).toString(), "RIFF");
    assert.equal(bytes.subarray(8, 12).toString(), "WEBP");
    completed++;
    return;
  }
  const text = await res.text();
  if (signInReturn) {
    const location = new URL(res.headers.get("location"), base);
    assert.equal(location.pathname, "/signin");
    assert.equal(location.searchParams.get("next"), signInReturn);
  }
  if (status === "missing") {
    // Next can flush a loading boundary before notFound(); its streamed fallback carries this digest.
    assert.ok(
      res.status === 404 || (res.status === 200 && text.includes("NEXT_HTTP_ERROR_FALLBACK;404")),
      path + " did not render a missing thread",
    );
  } else
    assert.equal(
      res.status,
      status,
      path +
        " returned " +
        res.status +
        (res.headers.get("content-type")?.includes("json")
          ? " " + JSON.stringify(JSON.parse(text).error)
          : ""),
    );
  for (const word of includes) assert.ok(text.includes(word), path + " missing " + word);
  for (const word of excludes) assert.ok(!text.includes(word), path + " exposed " + word);
  completed++;
  if (html) {
    assert.match(res.headers.get("content-type") ?? "", /text\/html/);
    return text.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "").replace(/<!--[\s\S]*?-->/g, "");
  }
  return res.headers.get("content-type")?.includes("json") ? JSON.parse(text) : res.status;
}
try {
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) throw new Error("Production server exited");
    if (output.includes("Ready in") || output.includes("Ready on")) {
      ready = true;
      break;
    }
    await delay(100);
  }
  if (!ready) throw new Error("Production server startup timed out");
  await journey("/", {
    includes: [
      "Fixture win condition", "Fixture offrole question", "Fixture blocked discussion",
      "Never take Baron alone.", "/baron-emblem-96.webp", "/baron-icon-32.png",
      "Lobby rally clock", "Community objective progress", "Resets at 00:00 UTC",
      "Hand of Baron · community spotlight", "Fixture Support",
    ],
    excludes: ["BARON IS UP", "Objective progress is temporarily unavailable"],
  });
  await journey("/?tab=following", {
    session: true,
    includes: ["Fixture win condition", "Lobby rally clock"],
    excludes: ["Fixture offrole question", "Fixture blocked discussion", "Never take Baron alone.", "Community objective progress"],
  });
  await journey("/api/social/repost", {session:"helper", method:"POST", body:{postId:523,active:true}, includes:['"active":true']});
  await journey("/?tab=following", {session:true, includes:["Fixture offrole question","Fixture Teammate"], excludes:["Fixture blocked discussion"]});
  await journey("/api/social/repost", {session:"helper", method:"POST", body:{postId:523,active:false}, includes:['"active":false']});
  await journey("/?tab=following", {session:true, excludes:["Fixture offrole question"]});
  await journey("/api/social/follow", {session:true, method:"POST", body:{userId:502,follow:false}, includes:['"active":false']});
  await journey("/?tab=following", {session:true, includes:["Make this feed yours","The Baron Pit","Join room"], excludes:["Fixture blocked discussion"]});
  await journey("/api/social/follow", {session:true, method:"POST", body:{userId:502,follow:true}, includes:['"active":true']});
  await journey("/activity?tab=duos", {session:true, includes:["Duo"], excludes:["Fixture Blocked"]});
  for (const signedOutPage of ["/activity?tab=duos", "/activity?tab=watching&before=42", "/playbook?before=42"]) {
    await journey(signedOutPage, {status:307, signInReturn:signedOutPage});
  }
  await checkPlayerProfiles(journey);
  await checkNavigation(journey);
  await journey("/rooms/general", {
    session: true,
    includes: [
      "Fixture win condition", "Fixture offrole question", "Meet the community, swap stories",
      'media="(max-width: 480px)"', "/baron-room-480.webp 1x, /baron-room-960.webp 2x",
      'src="/baron-room-960.webp"',
    ],
    excludes: ["Fixture blocked discussion", "/baron-hero.png"],
  });
  for (const file of publicArtwork) {
    const image = await fetch(origin + "/" + file, { signal: AbortSignal.timeout(5000) });
    assert.equal(image.status, 200, file + " is missing");
    const type = file.endsWith(".webp") ? "image/webp" : "image/png";
    assert.equal(image.headers.get("content-type"), type, file + " did not return an image");
    const bytes = Buffer.from(await image.arrayBuffer());
    checkImage(file, bytes);
    completed++;
  }
  await journey("/post/521", {
    session: true,
    includes: ["Fixture win condition"],
    excludes: ["Fixture blocked reply"],
  });
  await journey("/api/social/comments?postId=521", {
    session: true,
    includes: ["Fixture followup"],
    excludes: ["Fixture blocked reply"],
  });
  const hidden = await journey("/post/522", {
    session: true,
    status: "missing",
    excludes: ["Fixture blocked discussion"],
  });
  const absent = await journey("/post/599", { session: true, status: "missing" });
  assert.equal(hidden, absent, "Blocked posts should be indistinguishable from missing posts");
  await journey("/api/social/comments", {
    session: true,
    method: "POST",
    body: { postId: 521, body: "Fixture production reply" },
    includes: ['"ok":true'],
  });
  await journey("/api/social/comments?postId=521", { session: true, includes: ["Fixture production reply"] });
  await journey("/api/social/comments", {
    method: "POST",
    status: 401,
    body: { postId: 521, body: "visitor" },
  });
  await journey("/api/social/comments", {
    base: "http://127.0.0.1:" + port,
    session: true,
    method: "POST",
    body: { postId: 521, body: "Fixture alternate loopback origin" },
    includes: ['"ok":true'],
  });
  await journey("/api/cron/patch-watch", { status: 401 });
  await journey("/api/social/upload", { method: "POST", status: 503, includes: ["uploads are paused"] });
  await journey("/lfg", { includes: ["Verified duo matching is coming"] });
  await journey("/questions", {includes:["Matchup notebook"]});
  await journey("/pilot", {includes:["Four weeks with NA players"]});
  await journey("/pilot/phone-test", {includes:["Try a matchup thread on your phone","look for a duo partner"]});
  await journey("/questions/new?puuid=fixture-owner&matchId=NA1_999999&starter=recall", {
    includes:["When should I have recalled?", "Sign in to ask"],
  });
  await journey("/api/pilot", {session:"helper",method:"POST",body:{action:"join",consent:true,channel:"club",role:"BOTTOM"},includes:['"ok":true']});
  await journey("/api/pilot", {session:"helper",method:"POST",body:{action:"visit",kind:"stats"},includes:['"ok":true']});
  await journey("/api/pilot", {session:"helper",method:"POST",body:{action:"leave"},includes:['"ok":true']});
  const question = await journey("/api/questions", {session:true,method:"POST",status:201,
    body:{action:"ask",role:"Bot",topic:"Objective",champion:"Ashe",body:"Should Ashe rotate before the next dragon?",puuid:"fixture-owner",matchId:"NA1_999999"},includes:['"status":"visible"']});
  const postId=question.postId;
  await journey("/post/"+postId, {includes:["Help me frame my answer", "Sign in to reply", "topic=Objective"]});
  await journey("/questions?role=Bot&topic=Objective", {includes:["Should Ashe rotate before the next dragon?","<option selected=\"\">Objective</option>"]});
  await journey("/questions?role=Bot&topic=Laning", {excludes:["Should Ashe rotate before the next dragon?"]});
  await journey("/api/library?kind=post&id="+postId, {session:true,includes:['"replyMode":"direct"','"watching":false']});
  const reply=await journey("/api/social/comments", {session:"helper",method:"POST",
    body:{postId,body:"Spend the gold before dragon and coordinate the wave with your support."},includes:['"ok":true']});
  await journey("/activity", {session:true,includes:["replied to your post","Spend the gold before dragon","Unread"]});
  await journey("/api/library", {session:true,method:"POST",body:{action:"reply-mode",kind:"post",id:postId,mode:"muted"},includes:['"ok":true']});
  await journey("/activity", {session:true,excludes:["Spend the gold before dragon"]});
  await journey("/activity?tab=muted", {session:true,includes:["Should Ashe rotate before the next dragon?","Resume replies to me"]});
  await journey("/api/library", {session:true,method:"POST",body:{action:"mute",kind:"post",id:postId,active:false},includes:['"ok":true']});
  await journey("/activity", {session:true,excludes:["Spend the gold before dragon"]});
  await journey("/api/questions", {session:true,method:"POST",body:{action:"accept",postId,answerId:reply.commentId},includes:['"ok":true']});
  await journey("/api/questions", {session:true,method:"POST",body:{action:"trial",postId,answerId:reply.commentId,outcome:"helped"},includes:['"ok":true']});
  await journey("/api/library", {session:true,method:"POST",body:{action:"save",kind:"comment",id:reply.commentId,active:true},includes:['"ok":true']});
  await journey("/playbook", {session:true,includes:["Spend the gold before dragon"]});
  await journey("/playbook", {session:"helper",excludes:["Spend the gold before dragon"]});
  await journey("/questions?mode=answered&champion=Ashe&topic=Objective", {includes:["Should Ashe rotate before the next dragon?"]});
  await journey("/post/"+postId, {includes:["Spend the gold before dragon","It helped"]});
  await journey("/builds/compare", {includes:["Compare"]});
  await journey("/api/account/riot/start",{session:true,method:"POST",status:503,body:{puuid:"fixture-owner"},includes:["awaiting provider configuration"]});
  await checkSubmissions(journey);
  await checkCommunityDuo(journey);
  await checkProfileEditor(journey);
  console.log(completed + " production HTTP journeys passed against the local PostgreSQL fixture.");
} catch (error) {
  console.error(output);
  throw error;
} finally {
  server.kill("SIGTERM");
  const killTimer = setTimeout(() => server.kill("SIGKILL"), 3500);
  killTimer.unref();
  if (server.exitCode === null && server.signalCode === null) await once(server, "exit");
  clearTimeout(killTimer);
}
