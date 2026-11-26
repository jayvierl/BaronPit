// Private test transport for "next start". The app still uses its production Neon client,
// SQL queries, schema, signed cookies and route handlers. No test hooks are present in src/.
import { createHash } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";

const fixtureDsn = "postgresql://fixture:fixture@ep-fixture.invalid/ward_smoke";
if (process.env.DATABASE_URL !== fixtureDsn || !/^[a-f0-9]{64}$/.test(process.env.SMOKE_SESSION || "")) {
  throw new Error("Smoke transport needs the isolated smoke runner.");
}

const db = new PGlite();
const realFetch = globalThis.fetch;
const rawParsers = Object.fromEntries(
  [
    16, 17, 18, 19, 20, 21, 23, 25, 26, 114, 700, 701, 1043, 1082, 1114, 1184, 1700, 2950, 3802, 1000, 1005,
    1007, 1009, 1014, 1015, 1016, 1115, 1185, 1231, 2951, 3807,
  ].map((oid) => [oid, (value) => value]),
);
let seeded = false;

async function seed(tx) {
  const digest = createHash("sha256").update(process.env.SMOKE_SESSION).digest("hex");
  await tx.exec(`
    INSERT INTO wp_users (id,email,display_name,age_band,terms_version,terms_accepted_at,created_at) VALUES
      (501,'viewer@example.invalid','Fixture Viewer','adult','2026-11-26',now(),now()-interval '3 days'),
      (502,'followed@example.invalid','Fixture Teammate','adult','2026-11-26',now(),now()-interval '3 days'),
      (503,'blocked@example.invalid','Fixture Blocked','adult','2026-11-26',now(),now()-interval '3 days'),
      (504,'other@example.invalid','Fixture Other','adult','2026-11-26',now(),now()-interval '3 days');
    INSERT INTO wp_rooms (id,slug,name,description) VALUES(541,'general','General','General discussion');
    INSERT INTO wp_posts (id,author_id,kind,body,room_id) VALUES
      (521,502,'text','Fixture win condition',541), (522,503,'text','Fixture blocked discussion',541),
      (523,504,'text','Fixture offrole question',541);
    INSERT INTO wp_comments (id,post_id,author_id,body) VALUES
      (531,521,502,'Fixture followup'),(532,521,503,'Fixture blocked reply');
    INSERT INTO wp_follows(follower_id,followee_id) VALUES (501,502);
    INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES (503,501);
  `);
  await tx.query(
    "INSERT INTO wp_sessions(user_id,token_hash,expires_at) VALUES(501,$1,now()+interval '1 hour')",
    [digest],
  );
  const helperDigest = createHash("sha256").update(process.env.SMOKE_HELPER_SESSION).digest("hex");
  await tx.query("INSERT INTO wp_sessions(user_id,token_hash,expires_at) VALUES(502,$1,now()+interval '1 hour')",[helperDigest]);
  const snapshot = {
    games: 1,
    wins: 1,
    losses: 0,
    kda: 9,
    mainChamp: "Ashe",
    roles: { BOTTOM: 1 },
    champPool: [{ champion: "Ashe", games: 1, wins: 1, kda: 9 }],
    matches: [
      {
        matchId: "NA1_999999",
        champion: "Ashe",
        win: true,
        kills: 6,
        deaths: 1,
        assists: 3,
        cs: 160,
        durationSec: 1900,
        playedAt: Date.now() - 1000,
        queueId: 420,
        role: "BOTTOM",
        items: [],
        teammates: [],
      },
    ],
  };
  await tx.query(
    `INSERT INTO wp_players(puuid,platform,game_name,tag_line,rank_tier,rank_div,rank_lp,snapshot)
    VALUES ('fixture-owner','na1','Fixture Archer','NA1','GOLD','IV',23,$1::jsonb)`,
    [JSON.stringify(snapshot)],
  );
  await tx.exec(
    "INSERT INTO wp_links(user_id,puuid,is_primary,verified) VALUES(502,'fixture-owner',true,false)",
  );
}

async function query(tx, statement) {
  const result = await tx.query(statement.query, statement.params, { rowMode: "array", parsers: rawParsers });
  return {
    command: statement.query.trim().split(/\s/)[0].toUpperCase(),
    rows: result.rows,
    fields: result.fields,
    rowCount: result.affectedRows ?? result.rows.length,
  };
}

globalThis.fetch = async function fixtureFetch(input, init) {
  const req = new Request(input, init);
  const url = new URL(req.url);
  if (req.headers.get("neon-connection-string") === fixtureDsn && url.pathname === "/sql") {
    try {
      const input = await req.json();
      if (!Array.isArray(input.queries)) return Response.json(await query(db, input));
      const results = await db.transaction(async (tx) => {
        const output = [];
        for (const statement of input.queries) output.push(await query(tx, statement));
        if (
          !seeded &&
          input.queries.some(
            (s) => s.query.includes("schema_revision") && s.query.includes("INSERT INTO wp_meta"),
          )
        ) {
          await seed(tx);
          seeded = true;
        }
        return output;
      });
      return Response.json({ results });
    } catch (error) {
      return Response.json({ message: error.message, code: error.code ?? "XX000" }, { status: 400 });
    }
  }
  if (url.hostname === "ddragon.leagueoflegends.com") {
    if (url.pathname === "/api/versions.json") return Response.json(["16.23.1"]);
    if (url.pathname === "/cdn/16.23.1/data/en_US/champion.json")
      return Response.json({
        data: {
          Ashe: { id: "Ashe", name: "Ashe", title: "the Frost Archer", tags: ["Marksman", "Support"] },
        },
      });
  }
  if (url.origin === process.env.SMOKE_ORIGIN) return realFetch(input, init);
  throw new Error("A fixture attempted an unconfigured external request.");
};
