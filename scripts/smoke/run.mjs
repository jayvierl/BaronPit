import assert from "node:assert/strict";
import { checkSubmissions } from "./submissions.mjs";
import { checkCommunityDuo } from "./community-duo.mjs";
import { checkPlayerProfiles } from "./profiles.mjs";
import { checkPlayerDepth } from "./profile-depth.mjs";
import { checkNavigation } from "./navigation.mjs";
import { checkProfileEditor } from "./profile-editor.mjs";
import { checkPersonalSafety } from "./personal-safety.mjs";
import { checkDuoShortlist } from "./duo-shortlist.mjs";
import { startFixtureServer } from "./fixture-server.mjs";
import { checkImage, publicArtwork } from "../public-art.mjs";

const { origin, port, session, helperSession, stop, output } = await startFixtureServer();
const signed = { cookie: "wp_session=" + session };
let completed = 0;
async function journey(
  path,
  { status = 200, session = false, includes = [], excludes = [], method = "GET", body, base = origin, signInReturn, redirectTo, html = false, upload, expectWebp = false } = {},
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
  if (redirectTo) {
    // Next can send a refresh tag after the route's loading boundary has streamed.
    const location = res.status === 307 ? res.headers.get("location") :
      res.status === 200 ? text.match(/<meta\b[^>]*http-equiv="refresh"[^>]*content="[^"]*?url=([^"]+)"/i)?.[1] : null;
    assert.ok(location, path + " did not redirect to the player");
    assert.equal(new URL(location.replaceAll("&amp;", "&"), base).href, new URL(redirectTo, base).href);
    completed++;
    return;
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
  await journey("/", {
    includes: [
      'aria-label="Conversations"', 'aria-label="Discover"', 'aria-label="Community search"',
      "Fixture win condition", "Fixture offrole question", "Fixture blocked discussion",
      "Never take Baron alone.", "/baron-emblem-96.webp", "/baron-icon-32.png",
      "Lobby rally clock", "Community objective progress", "Resets at 00:00 UTC",
      "Hand of Baron · community spotlight", "Fixture Support", 'href="/?summary=tonight#tonight-in-the-pit-title"',
    ],
    excludes: ["BARON IS UP", "Objective progress is temporarily unavailable", 'id="tonight-in-the-pit-title"'],
  });
  await journey("/?summary=tonight", {
    includes: ['aria-labelledby="tonight-in-the-pit-title"', 'id="tonight-in-the-pit-title">Tonight in the pit', "Fixture win condition"],
    excludes: ["Recent match activity is temporarily unavailable."],
  });
  await journey("/?tab=following", {status:307, signInReturn:"/?tab=following"});
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
  for (const signedOutPage of ["/activity?tab=duos", "/activity?tab=watching&before=42", "/playbook?before=42", "/playbook?tab=replies&before=42"]) {
    await journey(signedOutPage, {status:307, signInReturn:signedOutPage});
  }
  await checkPlayerProfiles(journey);
  await checkPlayerDepth(journey);
  await checkNavigation(journey);
  const pitBanner = new Date().getUTCMonth() === 11 ? "/rooms/baron-pit-winter" : "/baron-room";
  await journey("/rooms/general", {
    session: true,
    includes: [
      "Fixture win condition", "Fixture offrole question", "Meet the community, swap stories",
      'media="(max-width: 480px)"', `${pitBanner}-480.webp 1x, ${pitBanner}-960.webp 2x`,
      `src="${pitBanner}-960.webp"`, 'fetchPriority="high"',
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
  const questionMatch = {platform:"na1",riotId:"Fixture Archer#NA1",matchId:"NA1_999999"};
  const guestPreview = "/questions/new?" + new URLSearchParams({...questionMatch,starter:"recall"});
  await journey(guestPreview, {
    includes:["Public match preview", "When would you recall in this situation?", "Sign in to ask"],
    excludes:["fixture-owner"],
  });
  await journey("/questions/new?puuid=fixture-owner&matchId=NA1_999999&starter=recall", {
    includes:["Public match preview", "When would you recall in this situation?", "Sign in to ask"],
  });
  await journey("/api/pilot", {session:"helper",method:"POST",body:{action:"join",consent:true,channel:"club",role:"BOTTOM"},includes:['"ok":true']});
  await journey("/api/pilot", {session:"helper",method:"POST",body:{action:"visit",kind:"stats"},includes:['"ok":true']});
  await journey("/api/pilot", {session:"helper",method:"POST",body:{action:"leave"},includes:['"ok":true']});
  const question = await journey("/api/questions", {session:true,method:"POST",status:201,
    body:{action:"ask",role:"Bot",topic:"Objective",champion:"Ashe",body:"Should Ashe rotate before the next dragon?",...questionMatch,confirmPublicMatch:true},includes:['"status":"visible"']});
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
  await journey("/playbook?tab=replies", {session:true, includes:["Spend the gold before dragon", `/post/${postId}#reply-${reply.commentId}`, 'aria-label="Saved views"']});
  await journey("/playbook?tab=posts", {session:true, excludes:["Spend the gold before dragon"]});
  await journey("/playbook?tab=replies&before=1", {session:true, includes:["Back to latest saves", 'href="/playbook?tab=replies"']});
  await journey("/playbook", {session:"helper",excludes:["Spend the gold before dragon"]});
  await journey("/questions?mode=answered&champion=Ashe&topic=Objective", {includes:["Should Ashe rotate before the next dragon?"]});
  await journey("/post/"+postId, {includes:["Spend the gold before dragon","It helped"]});
  await journey("/builds/compare", {includes:["Compare"]});
  await journey("/api/account/riot/start",{session:true,method:"POST",status:503,body:{puuid:"fixture-owner"},includes:["awaiting provider configuration"]});
  await checkSubmissions(journey);
  await checkCommunityDuo(journey);
  await checkProfileEditor(journey);
  await checkPersonalSafety(journey);
  await checkDuoShortlist(journey);
  console.log(completed + " production HTTP journeys passed against the local PostgreSQL fixture.");
} catch (error) {
  console.error(output());
  throw error;
} finally {
  await stop();
}
