import { q, dbAvailable } from "./db";
import { scoreContent, bodyFingerprint } from "./moderation";
import { rateLimit, type User } from "./auth";
import { getCachedPlayer, currentPatch, championList, playerFromRow, type Player } from "./riot";
import { SCHEDULE_BLOCKS, fnvHash, REACTION_EMOJIS, ENDORSE_KINDS } from "./pure";

export { REACTION_EMOJIS, ENDORSE_KINDS };

/* ---------------------------------- types --------------------------------- */

export interface Room {
  id: number; slug: string; name: string; kind: string;
  championId: string | null; description: string; members: number;
}
export interface PostView {
  id: number; authorId: number; authorName: string; authorHue: number;
  authorFlair: string | null;
  kind: string; body: string; roomId: number | null; roomSlug: string | null; roomName: string | null;
  data: Record<string, unknown>; status: string; createdAt: string;
  reactions: Record<string, number>; myReactions: string[];
  commentCount: number; pollResults: number[] | null; myVote: number | null;
}
export interface CommentView {
  id: number; postId: number; authorId: number; authorName: string; authorHue: number;
  parentId: number | null; body: string; status: string; createdAt: string; oneFix: boolean;
  reactions: Record<string, number>; myReactions: string[]; replies: CommentView[];
}



/* ---------------------------------- rooms --------------------------------- */

export const BROAD_ROOMS = [
  { slug: "general", name: "The Baron Pit", description: "The main pit — the whole community gathers here. Never take Baron alone." },
  { slug: "patch-meta", name: "Patch & Meta", description: "Patch notes, tier debates, pro meta talk." },
  { slug: "off-meta-lab", name: "Off-Meta Lab", description: "Weird builds and brave picks. Off-meta is first-class here." },
  { slug: "lfg-lobby", name: "LFG Lobby", description: "Find a duo or a five-stack. Listings live on the LFG board." },
  { slug: "new-players", name: "New Players", description: "Questions welcome. Veterans: be the reason someone stays." },
];
export const LAUNCH_CHAMPION_ROOMS = [
  "Ahri", "Yasuo", "Yone", "LeeSin", "KaiSa", "Jinx", "Caitlyn", "Lux", "Thresh",
  "Ezreal", "Viego", "Sylas", "Akali", "Katarina", "MissFortune", "Ashe",
];

let roomsReady: Promise<void> | null = null;

/** Seed rooms once per process (memoized — audit D1) for every champion (audit A2). */
export function ensureRooms(): Promise<void> {
  if (!dbAvailable()) return Promise.resolve();
  if (!roomsReady) roomsReady = seedRooms().catch((e) => { roomsReady = null; throw e; });
  return roomsReady;
}

async function seedRooms(): Promise<void> {
  for (const r of BROAD_ROOMS) {
    await q`INSERT INTO wp_rooms (slug, name, kind, description) VALUES (${r.slug}, ${r.name}, 'general', ${r.description})
            ON CONFLICT (slug) DO NOTHING`;
  }
  // The main room was renamed with the app (General → The Baron Pit, 2026-11-26).
  const main = BROAD_ROOMS[0];
  await q`UPDATE wp_rooms SET name = ${main.name}, description = ${main.description} WHERE slug = ${main.slug}`;
  const count = await q`SELECT count(*)::int AS n FROM wp_rooms WHERE kind = 'champion'`;
  if (Number(count[0].n) >= 150) return;
  let champs = LAUNCH_CHAMPION_ROOMS;
  try {
    const all = await championList();
    if (all.length > champs.length) champs = all.map((c) => c.id);
  } catch { /* Data Dragon unreachable — the launch set still seeds. */ }
  for (const champ of champs) {
    const slug = `champ-${champ.toLowerCase()}`;
    await q`INSERT INTO wp_rooms (slug, name, kind, champion_id, description)
            VALUES (${slug}, ${`${champ} Mains`}, 'champion', ${champ}, ${`For ${champ} players: builds, matchups, clips, and questions.`})
            ON CONFLICT (slug) DO NOTHING`;
  }
}

export async function listRooms(userId?: number): Promise<(Room & { joined: boolean })[]> {
  await ensureRooms();
  const base = await q`SELECT r.*, count(m.user_id)::int AS members FROM wp_rooms r
    LEFT JOIN wp_room_members m ON m.room_id = r.id GROUP BY r.id ORDER BY r.kind, r.name`;
  let joinedIds = new Set<number>();
  if (userId) {
    const j = await q`SELECT room_id FROM wp_room_members WHERE user_id = ${userId}`;
    joinedIds = new Set(j.map((r) => Number(r.room_id)));
  }
  return base.map((r) => ({
    id: Number(r.id), slug: String(r.slug), name: String(r.name), kind: String(r.kind),
    championId: (r.champion_id as string) ?? null, description: String(r.description),
    members: Number(r.members), joined: joinedIds.has(Number(r.id)),
  }));
}

export async function getRoom(slug: string): Promise<Room | null> {
  await ensureRooms();
  const rows = await q`SELECT r.*, count(m.user_id)::int AS members FROM wp_rooms r
    LEFT JOIN wp_room_members m ON m.room_id = r.id WHERE r.slug = ${slug} GROUP BY r.id LIMIT 1`;
  if (!rows.length) return null;
  const r = rows[0];
  return {
    id: Number(r.id), slug: String(r.slug), name: String(r.name), kind: String(r.kind),
    championId: (r.champion_id as string) ?? null, description: String(r.description), members: Number(r.members),
  };
}

export async function setRoomMembership(userId: number, roomId: number, join: boolean): Promise<void> {
  if (join) {
    await q`INSERT INTO wp_room_members (room_id, user_id) VALUES (${roomId}, ${userId}) ON CONFLICT DO NOTHING`;
  } else {
    await q`DELETE FROM wp_room_members WHERE room_id = ${roomId} AND user_id = ${userId}`;
  }
}

/* ------------------------------ trust & flair ------------------------------ */

export async function approvedActionCount(userId: number): Promise<number> {
  const rows = await q`SELECT
    (SELECT count(*) FROM wp_posts WHERE author_id = ${userId} AND status = 'visible') +
    (SELECT count(*) FROM wp_comments WHERE author_id = ${userId} AND status = 'visible') AS n`;
  return Number(rows[0]?.n ?? 0);
}

export async function isLowTrust(user: User): Promise<boolean> {
  const ageMs = Date.now() - new Date(user.createdAt).getTime();
  if (ageMs > 24 * 60 * 60 * 1000) return false;
  return (await approvedActionCount(user.id)) < 3;
}

export async function primaryPlayer(userId: number): Promise<Player | null> {
  const rows = await q`SELECT p.* FROM wp_links l JOIN wp_players p ON p.puuid = l.puuid
    WHERE l.user_id = ${userId} ORDER BY l.is_primary DESC, l.created_at LIMIT 1`;
  return rows.length ? playerFromRow(rows[0]) : null;
}

export function flairFor(player: Player | null): string | null {
  if (!player) return null;
  const rank = player.rankTier ? `${title(player.rankTier)} ${player.rankDiv ?? ""}`.trim() : "Unranked";
  const main = player.snapshot.champPool[0]?.champion;
  return main ? `${rank} · ${main} main` : rank;
}
function title(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

/* ---------------------------------- posts ---------------------------------- */

export type CreatePostInput = {
  kind: "text" | "build" | "poll" | "card" | "clip" | "media";
  body: string;
  roomId?: number | null;
  data?: Record<string, unknown>;
};
export type CreateResult =
  | { ok: true; postId: number; status: "visible" | "held" }
  | { ok: false; error: string };

const CLIP_HOSTS = ["youtube.com", "youtu.be", "twitch.tv", "medal.tv", "streamable.com"];

export async function createPost(user: User, input: CreatePostInput): Promise<CreateResult> {
  if (!(await rateLimit(user.id, "post", 30, 60))) return { ok: false, error: "You're posting too fast — take a breath and try again in a bit." };
  const body = (input.body ?? "").trim();
  if (input.kind === "text" && (body.length < 1 || body.length > 2000)) return { ok: false, error: "Posts are 1–2000 characters." };
  if (input.kind === "poll") {
    const options = (input.data?.options as string[]) ?? [];
    if (body.length < 3 || options.length < 2 || options.length > 4 || options.some((o) => !o || o.length > 60))
      return { ok: false, error: "A poll needs a question and 2–4 short options." };
  }
  if (input.kind === "build") {
    const d = input.data ?? {};
    if (!d.champion || !Array.isArray(d.items) || (d.items as unknown[]).length < 1)
      return { ok: false, error: "A build needs a champion and at least one item." };
  }
  if (input.kind === "clip") {
    const url = String(input.data?.url ?? "");
    let host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); } catch { /* invalid */ }
    if (!CLIP_HOSTS.some((h) => host === h || host.endsWith(`.${h}`)))
      return { ok: false, error: "Clip links must be from YouTube, Twitch, Medal, or Streamable — or upload the clip directly with the Media post type." };
  }
  if (input.kind === "media") {
    if (body.length > 2000) return { ok: false, error: "Captions are up to 2000 characters." };
    const url = String(input.data?.url ?? "");
    const mediaType = String(input.data?.mediaType ?? "");
    let host = "";
    try { host = new URL(url).hostname; } catch { /* invalid */ }
    // Only files uploaded to our own Blob store may be attached to a post.
    if (!host.endsWith(".public.blob.vercel-storage.com"))
      return { ok: false, error: "That file didn't come through our uploader. Pick the photo or clip again." };
    if (mediaType !== "image" && mediaType !== "video")
      return { ok: false, error: "Media posts are a photo or a short video clip." };
  }
  if (input.kind === "card") {
    const puuid = String(input.data?.puuid ?? "");
    const matchId = String(input.data?.matchId ?? "");
    const player = await getCachedPlayer(puuid);
    const match = player?.snapshot.matches.find((m) => m.matchId === matchId);
    if (!player || !match)
      return { ok: false, error: "That match isn't in the player's recent form." };
    // Stats tell the truth: the rendered card is overwritten with the
    // server-side snapshot values, never the client's (audit A5).
    input.data = {
      ...input.data,
      riotId: `${player.gameName}#${player.tagLine}`,
      match: {
        champion: match.champion, win: match.win, kills: match.kills, deaths: match.deaths,
        assists: match.assists, cs: match.cs, items: match.items,
      },
    };
  }

  const lowTrust = await isLowTrust(user);
  const mod = scoreContent(body, { lowTrust });
  if (mod.action === "block") {
    await q`INSERT INTO wp_mod_log (target_kind, author_id, score, action, detail)
            VALUES ('post', ${user.id}, ${mod.score}, 'block', ${mod.hits.join(",")})`;
    return { ok: false, error: "That post can't be published — it trips our community safety filter. If you think this is a mistake, rephrase and try again." };
  }
  // Duplicate spam: identical body three times in an hour -> hold.
  let status: "visible" | "held" = mod.action === "hold" ? "held" : "visible";
  // Media safety: uploads from accounts still on probation are always reviewed first.
  if (status === "visible" && input.kind === "media" && lowTrust) status = "held";
  if (status === "visible" && body.length > 0) {
    const fp = bodyFingerprint(body);
    const recent = await q`SELECT body FROM wp_posts WHERE author_id = ${user.id} AND created_at > now() - interval '1 hour'`;
    if (recent.filter((r) => bodyFingerprint(String(r.body)) === fp).length >= 2) status = "held";
  }

  const rows = await q`INSERT INTO wp_posts (author_id, kind, body, room_id, data, status)
    VALUES (${user.id}, ${input.kind}, ${body}, ${input.roomId ?? null}, ${JSON.stringify(input.data ?? {})}::jsonb, ${status})
    RETURNING id`;
  const postId = Number(rows[0].id);
  if (status === "held") {
    await q`INSERT INTO wp_mod_log (target_kind, target_id, author_id, score, action, detail)
            VALUES ('post', ${postId}, ${user.id}, ${mod.score}, 'hold', ${mod.hits.join(",")})`;
  }
  return { ok: true, postId, status };
}

async function postViews(rows: Record<string, unknown>[], viewerId: number | null): Promise<PostView[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => Number(r.id));
  // Four independent enrichments — one parallel round (audit D6).
  const [reactions, comments, votes, pollCounts] = await Promise.all([
    q`SELECT target_id, emoji, count(*)::int AS n,
        bool_or(user_id = ${viewerId ?? -1}) AS mine
      FROM wp_reactions WHERE target_kind = 'post' AND target_id = ANY(${ids}) GROUP BY target_id, emoji`,
    q`SELECT post_id, count(*)::int AS n FROM wp_comments
      WHERE post_id = ANY(${ids}) AND status = 'visible' GROUP BY post_id`,
    viewerId
      ? q`SELECT post_id, option_idx FROM wp_poll_votes WHERE user_id = ${viewerId} AND post_id = ANY(${ids})`
      : Promise.resolve([]),
    q`SELECT post_id, option_idx, count(*)::int AS n FROM wp_poll_votes WHERE post_id = ANY(${ids}) GROUP BY post_id, option_idx`,
  ]);
  const commentMap = new Map(comments.map((c) => [Number(c.post_id), Number(c.n)]));
  const myVoteMap = new Map(votes.map((v) => [Number(v.post_id), Number(v.option_idx)]));
  return rows.map((r) => {
    const id = Number(r.id);
    const data = (r.data as Record<string, unknown>) ?? {};
    let pollResults: number[] | null = null;
    if (r.kind === "poll" && Array.isArray(data.options)) {
      pollResults = (data.options as string[]).map((_, i) => {
        const row = pollCounts.find((p) => Number(p.post_id) === id && Number(p.option_idx) === i);
        return row ? Number(row.n) : 0;
      });
    }
    const rx: Record<string, number> = {};
    const mine: string[] = [];
    for (const row of reactions.filter((x) => Number(x.target_id) === id)) {
      rx[String(row.emoji)] = Number(row.n);
      if (row.mine) mine.push(String(row.emoji));
    }
    return {
      id, authorId: Number(r.author_id), authorName: String(r.author_name), authorHue: Number(r.author_hue),
      authorFlair: (r.flair as string) ?? null,
      kind: String(r.kind), body: String(r.body),
      roomId: r.room_id == null ? null : Number(r.room_id),
      roomSlug: (r.room_slug as string) ?? null, roomName: (r.room_name as string) ?? null,
      data, status: String(r.status), createdAt: String(r.created_at),
      reactions: rx, myReactions: mine,
      commentCount: commentMap.get(id) ?? 0,
      pollResults, myVote: myVoteMap.get(id) ?? null,
    };
  });
}

// NOTE: the Neon tagged-template binds every interpolation as a parameter,
// so shared SELECT fragments cannot be interpolated — the full SELECT is
// written out in each query below.
export async function feed(viewer: User | null, tab: "following" | "everyone", roomId?: number, limit = 30): Promise<PostView[]> {
  const viewerId = viewer?.id ?? null;
  let rows: Record<string, unknown>[];
  if (roomId) {
    rows = await q`SELECT p.*, u.display_name AS author_name, u.avatar_hue AS author_hue,
        rm.slug AS room_slug, rm.name AS room_name,
        (SELECT CASE WHEN pl.puuid IS NOT NULL THEN (CASE WHEN pl.rank_tier IS NOT NULL THEN btrim(initcap(lower(pl.rank_tier)) || ' ' || coalesce(pl.rank_div,'')) ELSE 'Unranked' END) || coalesce(' · ' || (pl.snapshot->'champPool'->0->>'champion') || ' main', '') ELSE NULL END
         FROM wp_links l JOIN wp_players pl ON pl.puuid = l.puuid
         WHERE l.user_id = p.author_id ORDER BY l.is_primary DESC LIMIT 1) AS flair
      FROM wp_posts p JOIN wp_users u ON u.id = p.author_id
      LEFT JOIN wp_rooms rm ON rm.id = p.room_id
      WHERE p.room_id = ${roomId} AND p.status = 'visible'
      ORDER BY p.created_at DESC LIMIT ${limit}`;
  } else if (tab === "following" && viewerId) {
    rows = await q`SELECT p.*, u.display_name AS author_name, u.avatar_hue AS author_hue,
        rm.slug AS room_slug, rm.name AS room_name,
        (SELECT CASE WHEN pl.puuid IS NOT NULL THEN (CASE WHEN pl.rank_tier IS NOT NULL THEN btrim(initcap(lower(pl.rank_tier)) || ' ' || coalesce(pl.rank_div,'')) ELSE 'Unranked' END) || coalesce(' · ' || (pl.snapshot->'champPool'->0->>'champion') || ' main', '') ELSE NULL END
         FROM wp_links l JOIN wp_players pl ON pl.puuid = l.puuid
         WHERE l.user_id = p.author_id ORDER BY l.is_primary DESC LIMIT 1) AS flair
      FROM wp_posts p JOIN wp_users u ON u.id = p.author_id
      LEFT JOIN wp_rooms rm ON rm.id = p.room_id
      WHERE p.status = 'visible' AND (
        p.author_id = ${viewerId}
        OR p.author_id IN (SELECT followee_id FROM wp_follows WHERE follower_id = ${viewerId})
        OR p.room_id IN (SELECT room_id FROM wp_room_members WHERE user_id = ${viewerId}))
      ORDER BY p.created_at DESC LIMIT ${limit}`;
  } else {
    rows = await q`SELECT p.*, u.display_name AS author_name, u.avatar_hue AS author_hue,
        rm.slug AS room_slug, rm.name AS room_name,
        (SELECT CASE WHEN pl.puuid IS NOT NULL THEN (CASE WHEN pl.rank_tier IS NOT NULL THEN btrim(initcap(lower(pl.rank_tier)) || ' ' || coalesce(pl.rank_div,'')) ELSE 'Unranked' END) || coalesce(' · ' || (pl.snapshot->'champPool'->0->>'champion') || ' main', '') ELSE NULL END
         FROM wp_links l JOIN wp_players pl ON pl.puuid = l.puuid
         WHERE l.user_id = p.author_id ORDER BY l.is_primary DESC LIMIT 1) AS flair
      FROM wp_posts p JOIN wp_users u ON u.id = p.author_id
      LEFT JOIN wp_rooms rm ON rm.id = p.room_id
      WHERE p.status = 'visible' ORDER BY p.created_at DESC LIMIT ${limit}`;
  }
  const views = await postViews(rows, viewerId);
  if (!viewerId) return views;
  const [blockedRows, mutedRows, blockedMeRows] = await Promise.all([
    q`SELECT blocked_id FROM wp_blocks WHERE blocker_id = ${viewerId}`,
    q`SELECT muted_id FROM wp_mutes WHERE muter_id = ${viewerId}`,
    q`SELECT blocker_id FROM wp_blocks WHERE blocked_id = ${viewerId}`,
  ]);
  const blocked = new Set(blockedRows.map((r) => Number(r.blocked_id)));
  const muted = new Set(mutedRows.map((r) => Number(r.muted_id)));
  const blockedMe = new Set(blockedMeRows.map((r) => Number(r.blocker_id)));
  return views.filter((v) => !blocked.has(v.authorId) && !muted.has(v.authorId) && !blockedMe.has(v.authorId));
}

/** A profile's own posts — a real by-author query (audit A1). */
export async function feedByAuthor(authorId: number, viewer: User | null, limit = 20): Promise<PostView[]> {
  const rows = await q`SELECT p.*, u.display_name AS author_name, u.avatar_hue AS author_hue,
      rm.slug AS room_slug, rm.name AS room_name,
      (SELECT CASE WHEN pl.puuid IS NOT NULL THEN (CASE WHEN pl.rank_tier IS NOT NULL THEN btrim(initcap(lower(pl.rank_tier)) || ' ' || coalesce(pl.rank_div,'')) ELSE 'Unranked' END) || coalesce(' · ' || (pl.snapshot->'champPool'->0->>'champion') || ' main', '') ELSE NULL END
       FROM wp_links l JOIN wp_players pl ON pl.puuid = l.puuid
       WHERE l.user_id = p.author_id ORDER BY l.is_primary DESC LIMIT 1) AS flair
    FROM wp_posts p JOIN wp_users u ON u.id = p.author_id
    LEFT JOIN wp_rooms rm ON rm.id = p.room_id
    WHERE p.author_id = ${authorId} AND p.status = 'visible'
    ORDER BY p.created_at DESC LIMIT ${limit}`;
  return postViews(rows, viewer?.id ?? null);
}

export async function getPost(postId: number, viewer: User | null): Promise<PostView | null> {
  const rows = await q`SELECT p.*, u.display_name AS author_name, u.avatar_hue AS author_hue,
      rm.slug AS room_slug, rm.name AS room_name,
      (SELECT CASE WHEN pl.puuid IS NOT NULL THEN (CASE WHEN pl.rank_tier IS NOT NULL THEN btrim(initcap(lower(pl.rank_tier)) || ' ' || coalesce(pl.rank_div,'')) ELSE 'Unranked' END) || coalesce(' · ' || (pl.snapshot->'champPool'->0->>'champion') || ' main', '') ELSE NULL END
       FROM wp_links l JOIN wp_players pl ON pl.puuid = l.puuid
       WHERE l.user_id = p.author_id ORDER BY l.is_primary DESC LIMIT 1) AS flair
    FROM wp_posts p JOIN wp_users u ON u.id = p.author_id
    LEFT JOIN wp_rooms rm ON rm.id = p.room_id
    WHERE p.id = ${postId} AND (p.status = 'visible' OR p.author_id = ${viewer?.id ?? -1}) LIMIT 1`;
  if (!rows.length) return null;
  const [view] = await postViews(rows, viewer?.id ?? null);
  return view ?? null;
}

export async function votePoll(user: User, postId: number, optionIdx: number): Promise<boolean> {
  const post = await getPost(postId, user);
  if (!post || post.kind !== "poll") return false;
  const options = (post.data.options as string[]) ?? [];
  if (optionIdx < 0 || optionIdx >= options.length) return false;
  await q`INSERT INTO wp_poll_votes (post_id, user_id, option_idx) VALUES (${postId}, ${user.id}, ${optionIdx})
          ON CONFLICT (post_id, user_id) DO UPDATE SET option_idx = EXCLUDED.option_idx`;
  return true;
}

/* --------------------------------- comments -------------------------------- */

export async function listComments(postId: number, viewer: User | null): Promise<CommentView[]> {
  const rows = await q`SELECT c.*, u.display_name AS author_name, u.avatar_hue AS author_hue
    FROM wp_comments c JOIN wp_users u ON u.id = c.author_id
    WHERE c.post_id = ${postId} AND c.status = 'visible' ORDER BY c.created_at`;
  const reactions = await q`SELECT target_id, emoji, count(*)::int AS n, bool_or(user_id = ${viewer?.id ?? -1}) AS mine
    FROM wp_reactions WHERE target_kind = 'comment' AND target_id = ANY(${rows.map((r) => Number(r.id))}) GROUP BY target_id, emoji`;
  const byId = new Map<number, CommentView>();
  for (const r of rows) {
    const id = Number(r.id);
    const rx: Record<string, number> = {}; const mine: string[] = [];
    for (const row of reactions.filter((x) => Number(x.target_id) === id)) {
      rx[String(row.emoji)] = Number(row.n); if (row.mine) mine.push(String(row.emoji));
    }
    byId.set(id, {
      id, postId, authorId: Number(r.author_id), authorName: String(r.author_name), authorHue: Number(r.author_hue),
      parentId: r.parent_id == null ? null : Number(r.parent_id), body: String(r.body),
      status: String(r.status), createdAt: String(r.created_at), oneFix: Boolean(r.one_fix), reactions: rx, myReactions: mine, replies: [],
    });
  }
  const roots: CommentView[] = [];
  for (const c of byId.values()) {
    if (c.parentId && byId.has(c.parentId)) byId.get(c.parentId)!.replies.push(c);
    else roots.push(c);
  }
  return roots;
}

export async function addComment(user: User, postId: number, bodyRaw: string, parentId?: number, oneFix = false): Promise<CreateResult> {
  if (!(await rateLimit(user.id, "comment", 60, 60))) return { ok: false, error: "You're commenting too fast — slow down a little." };
  const body = bodyRaw.trim();
  if (body.length < 1 || body.length > 1000) return { ok: false, error: "Comments are 1–1000 characters." };
  const post = await getPost(postId, user);
  if (!post) return { ok: false, error: "Post not found." };
  if (oneFix && post.kind !== "card") return { ok: false, error: "One-fix comments belong on game cards." };
  if (parentId != null) {
    const parent = await q`SELECT 1 FROM wp_comments WHERE id = ${parentId} AND post_id = ${postId}`;
    if (!parent.length) return { ok: false, error: "That reply target doesn't belong to this post." };
  }
  const lowTrust = await isLowTrust(user);
  const mod = scoreContent(body, { lowTrust });
  if (mod.action === "block") {
    await q`INSERT INTO wp_mod_log (target_kind, author_id, score, action, detail) VALUES ('comment', ${user.id}, ${mod.score}, 'block', ${mod.hits.join(",")})`;
    return { ok: false, error: "That comment can't be published — it trips our community safety filter." };
  }
  const status = mod.action === "hold" ? "held" : "visible";
  const rows = await q`INSERT INTO wp_comments (post_id, author_id, parent_id, body, status, one_fix)
    VALUES (${postId}, ${user.id}, ${parentId ?? null}, ${body}, ${status}, ${oneFix}) RETURNING id`;
  if (status === "held") {
    await q`INSERT INTO wp_mod_log (target_kind, target_id, author_id, score, action, detail)
            VALUES ('comment', ${Number(rows[0].id)}, ${user.id}, ${mod.score}, 'hold', ${mod.hits.join(",")})`;
  }
  return { ok: true, postId: Number(rows[0].id), status };
}

/* --------------------------------- reactions ------------------------------- */

export async function toggleReaction(user: User, kind: "post" | "comment", targetId: number, emoji: string): Promise<boolean> {
  if (!(REACTION_EMOJIS as readonly string[]).includes(emoji)) return false;
  const existing = await q`SELECT 1 FROM wp_reactions WHERE user_id = ${user.id} AND target_kind = ${kind} AND target_id = ${targetId} AND emoji = ${emoji}`;
  if (existing.length) {
    await q`DELETE FROM wp_reactions WHERE user_id = ${user.id} AND target_kind = ${kind} AND target_id = ${targetId} AND emoji = ${emoji}`;
  } else {
    await q`INSERT INTO wp_reactions (user_id, target_kind, target_id, emoji) VALUES (${user.id}, ${kind}, ${targetId}, ${emoji}) ON CONFLICT DO NOTHING`;
  }
  return true;
}

/* ------------------------------ follows/users ------------------------------ */

export async function setFollow(followerId: number, followeeId: number, follow: boolean): Promise<void> {
  if (followerId === followeeId) return;
  if (follow) await q`INSERT INTO wp_follows (follower_id, followee_id) VALUES (${followerId}, ${followeeId}) ON CONFLICT DO NOTHING`;
  else await q`DELETE FROM wp_follows WHERE follower_id = ${followerId} AND followee_id = ${followeeId}`;
}
export async function followCounts(userId: number): Promise<{ followers: number; following: number }> {
  const rows = await q`SELECT
    (SELECT count(*)::int FROM wp_follows WHERE followee_id = ${userId}) AS followers,
    (SELECT count(*)::int FROM wp_follows WHERE follower_id = ${userId}) AS following`;
  return { followers: Number(rows[0]?.followers ?? 0), following: Number(rows[0]?.following ?? 0) };
}
export async function isFollowing(followerId: number, followeeId: number): Promise<boolean> {
  const rows = await q`SELECT 1 FROM wp_follows WHERE follower_id = ${followerId} AND followee_id = ${followeeId}`;
  return rows.length > 0;
}

/* ------------------------------- endorsements ------------------------------ */

export async function endorse(from: User, toUserId: number, kind: string): Promise<{ ok: boolean; error?: string }> {
  if (from.id === toUserId) return { ok: false, error: "You can't endorse yourself." };
  if (!ENDORSE_KINDS.some((k) => k.id === kind)) return { ok: false, error: "Unknown endorsement." };
  if (!(await rateLimit(from.id, "endorse", 3, 24 * 60))) return { ok: false, error: "You've used today's endorsements — they mean more when they're scarce." };
  await q`INSERT INTO wp_endorsements (from_user, to_user, kind) VALUES (${from.id}, ${toUserId}, ${kind}) ON CONFLICT DO NOTHING`;
  return { ok: true };
}
export async function endorsementCounts(userId: number): Promise<Record<string, number>> {
  const rows = await q`SELECT kind, count(*)::int AS n FROM wp_endorsements WHERE to_user = ${userId} GROUP BY kind`;
  const out: Record<string, number> = {};
  for (const r of rows) out[String(r.kind)] = Number(r.n);
  return out;
}

/* ------------------------------- reports etc ------------------------------- */

export async function reportTarget(user: User, kind: string, targetId: number, reason: string): Promise<{ ok: boolean }> {
  if (!(await rateLimit(user.id, "report", 20, 24 * 60))) return { ok: false };
  await q`INSERT INTO wp_reports (reporter_id, target_kind, target_id, reason)
          VALUES (${user.id}, ${kind}, ${targetId}, ${reason.slice(0, 300)})`;
  const open = await q`SELECT count(*)::int AS n FROM wp_reports WHERE target_kind = ${kind} AND target_id = ${targetId} AND status = 'open'`;
  if (Number(open[0]?.n ?? 0) >= 3) {
    if (kind === "post") await q`UPDATE wp_posts SET status = 'held' WHERE id = ${targetId} AND status = 'visible'`;
    if (kind === "comment") await q`UPDATE wp_comments SET status = 'held' WHERE id = ${targetId} AND status = 'visible'`;
    await q`INSERT INTO wp_mod_log (target_kind, target_id, score, action, detail) VALUES (${kind}, ${targetId}, 0, 'auto-hold', '3+ open reports')`;
  }
  return { ok: true };
}

export async function myReports(userId: number): Promise<{ id: number; targetKind: string; targetId: number; status: string; createdAt: string }[]> {
  const rows = await q`SELECT * FROM wp_reports WHERE reporter_id = ${userId} ORDER BY created_at DESC LIMIT 20`;
  return rows.map((r) => ({ id: Number(r.id), targetKind: String(r.target_kind), targetId: Number(r.target_id), status: String(r.status), createdAt: String(r.created_at) }));
}

/** Reform-card notices: what was held/removed of yours, and why (spec §1.1). */
export async function myNotices(userId: number): Promise<{ id: number; action: string; detail: string; createdAt: string }[]> {
  const rows = await q`SELECT * FROM wp_mod_log WHERE author_id = ${userId} AND action IN ('hold','block','remove') ORDER BY created_at DESC LIMIT 10`;
  return rows.map((r) => ({ id: Number(r.id), action: String(r.action), detail: String(r.detail), createdAt: String(r.created_at) }));
}

export async function setBlock(userId: number, otherId: number, block: boolean): Promise<void> {
  if (block) {
    await q`INSERT INTO wp_blocks (blocker_id, blocked_id) VALUES (${userId}, ${otherId}) ON CONFLICT DO NOTHING`;
    await setFollow(userId, otherId, false);
    await setFollow(otherId, userId, false);
  } else {
    await q`DELETE FROM wp_blocks WHERE blocker_id = ${userId} AND blocked_id = ${otherId}`;
  }
}
export async function setMute(userId: number, otherId: number, mute: boolean): Promise<void> {
  if (mute) await q`INSERT INTO wp_mutes (muter_id, muted_id) VALUES (${userId}, ${otherId}) ON CONFLICT DO NOTHING`;
  else await q`DELETE FROM wp_mutes WHERE muter_id = ${userId} AND muted_id = ${otherId}`;
}

/* ----------------------------------- LFG ----------------------------------- */

export interface LfgListing {
  id: number; userId: number; userName: string; userHue: number; puuid: string;
  riotId: string; rank: string | null; recentForm: string;
  roles: string[]; champs: string[]; playTimes: string; voice: boolean; vibe: string;
  blocks: string[];
  note: string; createdAt: string; expiresAt: string;
}

export async function createLfg(user: User, input: { roles: string[]; champs: string[]; playTimes: string; voice: boolean; vibe: string; note: string; blocks?: string[] }): Promise<CreateResult> {
  const player = await primaryPlayer(user.id);
  if (!player) return { ok: false, error: "Link your Riot ID first — LFG ranks come from the API, never self-reported." };
  if (!(await rateLimit(user.id, "lfg", 3, 24 * 60))) return { ok: false, error: "You already have recent listings — close one first." };
  const mod = scoreContent(input.note, {});
  if (mod.hasContactHandle) return { ok: false, error: "Keep first contact in-app: listings can't include Discord or other off-platform handles." };
  if (mod.action === "block") return { ok: false, error: "That note can't be published." };
  const blocks = (input.blocks ?? []).filter((b) => (SCHEDULE_BLOCKS as readonly string[]).includes(b)).slice(0, 8);
  await q`UPDATE wp_lfg SET status = 'closed' WHERE user_id = ${user.id} AND status = 'open'`;
  const rows = await q`INSERT INTO wp_lfg (user_id, puuid, roles, champs, play_times, voice, vibe, note, blocks)
    VALUES (${user.id}, ${player.puuid}, ${input.roles}, ${input.champs}, ${input.playTimes.slice(0, 120)}, ${input.voice}, ${input.vibe}, ${input.note.slice(0, 300)}, ${blocks})
    RETURNING id`;
  return { ok: true, postId: Number(rows[0].id), status: "visible" };
}

export async function listLfg(viewer: User | null): Promise<LfgListing[]> {
  const rows = await q`SELECT l.*, u.display_name AS user_name, u.avatar_hue AS user_hue,
      p.game_name, p.tag_line, p.rank_tier, p.rank_div, p.rank_lp, p.snapshot
    FROM wp_lfg l JOIN wp_users u ON u.id = l.user_id JOIN wp_players p ON p.puuid = l.puuid
    WHERE l.status = 'open' AND l.expires_at > now()
    ORDER BY l.created_at DESC LIMIT 40`;
  return rows.map((r) => {
    const snap = (r.snapshot as { wins?: number; games?: number }) ?? {};
    return {
      id: Number(r.id), userId: Number(r.user_id), userName: String(r.user_name), userHue: Number(r.user_hue),
      puuid: String(r.puuid), riotId: `${r.game_name}#${r.tag_line}`,
      rank: r.rank_tier ? `${title(String(r.rank_tier))} ${r.rank_div ?? ""} · ${r.rank_lp ?? 0} LP` : "Unranked",
      recentForm: snap.games ? `${snap.wins ?? 0}W–${(snap.games ?? 0) - (snap.wins ?? 0)}L last ${snap.games}` : "No recent games",
      roles: (r.roles as string[]) ?? [], champs: (r.champs as string[]) ?? [],
      blocks: (r.blocks as string[]) ?? [],
      playTimes: String(r.play_times), voice: Boolean(r.voice), vibe: String(r.vibe),
      note: String(r.note), createdAt: String(r.created_at), expiresAt: String(r.expires_at),
    };
  }).filter((l) => !viewer || l.userId !== viewer.id);
}

/* --------------------------- builds: patch expiry --------------------------- */

/** Author re-confirms their build for the current patch (#17). */
export async function reconfirmBuild(user: User, postId: number): Promise<{ ok: boolean; error?: string }> {
  const post = await getPost(postId, user);
  if (!post || post.kind !== "build") return { ok: false, error: "Build not found." };
  if (post.authorId !== user.id) return { ok: false, error: "Only the author can re-confirm a build." };
  const patch = await currentPatch();
  await q`UPDATE wp_posts SET data = data || ${JSON.stringify({ patch })}::jsonb WHERE id = ${postId}`;
  return { ok: true };
}

/* ------------------------- patch-day room briefings ------------------------- */

async function systemUserId(): Promise<number> {
  const rows = await q`INSERT INTO wp_users (email, display_name, avatar_hue)
    VALUES ('team@wardparty.local', 'Baron Pit', 43)
    ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
    RETURNING id`;
  return Number(rows[0].id);
}

/**
 * Patch watch (#21): when Data Dragon reports a new patch, post a briefing in
 * every champion room (plus a General summary) so each room wakes up on patch
 * day. Idempotent — the last-seen patch is stored in wp_meta. First run only
 * sets the baseline. Returns what happened for logging/verification.
 */
export async function runPatchWatch(): Promise<{ patch: string; changed: boolean; briefings: number }> {
  const patch = await currentPatch();
  const seen = await q`SELECT value FROM wp_meta WHERE key = 'last_patch'`;
  const last = seen.length ? String(seen[0].value) : null;
  if (last === patch) return { patch, changed: false, briefings: 0 };
  await q`INSERT INTO wp_meta (key, value) VALUES ('last_patch', ${patch})
          ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value`;
  if (last === null) return { patch, changed: false, briefings: 0 };
  const [maj, min] = patch.split(".");
  const notesUrl = `https://www.leagueoflegends.com/en-us/news/game-updates/patch-${maj}-${min}-notes/`;
  const authorId = await systemUserId();
  const rooms = await q`SELECT id, name, champion_id FROM wp_rooms ORDER BY kind DESC, name`;
  let briefings = 0;
  for (const r of rooms) {
    const champ = r.champion_id ? String(r.champion_id) : null;
    const body = champ
      ? `Patch ${maj}.${min} is live, ${champ} mains — this is your room's patch-day briefing. What changed for ${champ}, what's feeling strong, what are we building now? Official notes: ${notesUrl} · Builds stamped with an older patch are now marked outdated until their authors re-confirm them. First impressions below.`
      : `Patch ${maj}.${min} is live. Champion rooms each have their own briefing — check your main's room for what changed, and Patch & Meta for the wider picture. Official notes: ${notesUrl}`;
    await q`INSERT INTO wp_posts (author_id, kind, body, room_id, data, status)
            VALUES (${authorId}, 'text', ${body}, ${Number(r.id)}, ${JSON.stringify({ briefing: true, patch })}::jsonb, 'visible')`;
    briefings++;
  }
  return { patch, changed: true, briefings };
}

/* --------------------------------- spotlight ------------------------------- */

const seedFrom = fnvHash;

/** A profile's highlight slot: rotates daily among the player's best games; never empty when they have games. */
export function dailyHighlight(player: Player, dateStr: string) {
  const games = [...player.snapshot.matches].sort((a, b) =>
    (b.kills + b.assists) / Math.max(1, b.deaths) - (a.kills + a.assists) / Math.max(1, a.deaths));
  if (!games.length) return null;
  const pick = games[seedFrom(`${player.puuid}:${dateStr}`) % Math.min(games.length, 5)];
  return pick;
}

/** Home-page spotlight: one linked player per day, chosen by date seed. */
export async function todaysSpotlight(dateStr: string): Promise<{ player: Player; ownerName: string | null; ownerId: number | null } | null> {
  const rows = await q`SELECT p.*, u.display_name AS owner_name, u.id AS owner_id
    FROM wp_players p JOIN wp_links l ON l.puuid = p.puuid JOIN wp_users u ON u.id = l.user_id
    WHERE p.snapshot <> '{}'::jsonb AND (p.snapshot->>'games')::int > 0`;
  const candidates = rows;
  if (!candidates.length) return null;
  const r = candidates[seedFrom(`spotlight:${dateStr}`) % candidates.length];
  const player = await getCachedPlayer(String(r.puuid));
  if (!player) return null;
  return { player, ownerName: String(r.owner_name), ownerId: Number(r.owner_id) };
}

/* ---------------------------------- search --------------------------------- */

export async function searchAll(term: string, viewer: User | null) {
  const t = term.trim();
  const users = t.length >= 2
    ? await q`SELECT id, display_name, avatar_hue FROM wp_users WHERE display_name ILIKE ${"%" + t + "%"} LIMIT 8`
    : [];
  const players = t.length >= 2
    ? await q`SELECT puuid, platform, game_name, tag_line, rank_tier, rank_div FROM wp_players WHERE game_name ILIKE ${"%" + t + "%"} LIMIT 8`
    : [];
  const rooms = await listRooms(viewer?.id);
  const roomHits = rooms.filter((r) => r.name.toLowerCase().includes(t.toLowerCase()));
  const tags = t.replace(/^#/, "");
  const tagPosts = tags.length >= 2
    ? await feed(viewer, "everyone", undefined, 50).then((posts) => posts.filter((p) => p.body.toLowerCase().includes(`#${tags.toLowerCase()}`)))
    : [];
  return {
    users: users.map((u) => ({ id: Number(u.id), name: String(u.display_name), hue: Number(u.avatar_hue) })),
    players: players.map((p) => ({
      puuid: String(p.puuid), platform: String(p.platform),
      riotId: `${p.game_name}#${p.tag_line}`,
      rank: p.rank_tier ? `${title(String(p.rank_tier))} ${p.rank_div ?? ""}` : "Unranked",
    })),
    rooms: roomHits,
    tagPosts,
  };
}

/* ---------------------------------- admin ---------------------------------- */

export async function modQueue() {
  const posts = await q`SELECT p.*, u.display_name AS author_name FROM wp_posts p JOIN wp_users u ON u.id = p.author_id
    WHERE p.status = 'held' ORDER BY p.created_at LIMIT 50`;
  const comments = await q`SELECT c.*, u.display_name AS author_name FROM wp_comments c JOIN wp_users u ON u.id = c.author_id
    WHERE c.status = 'held' ORDER BY c.created_at LIMIT 50`;
  const reports = await q`SELECT r.*, u.display_name AS reporter_name FROM wp_reports r JOIN wp_users u ON u.id = r.reporter_id
    WHERE r.status = 'open' ORDER BY r.created_at LIMIT 50`;
  return {
    posts: posts.map((p) => ({ id: Number(p.id), kind: String(p.kind), body: String(p.body), authorName: String(p.author_name), authorId: Number(p.author_id), createdAt: String(p.created_at) })),
    comments: comments.map((c) => ({ id: Number(c.id), body: String(c.body), authorName: String(c.author_name), authorId: Number(c.author_id), postId: Number(c.post_id), createdAt: String(c.created_at) })),
    reports: reports.map((r) => ({ id: Number(r.id), targetKind: String(r.target_kind), targetId: Number(r.target_id), reason: String(r.reason), reporterName: String(r.reporter_name), createdAt: String(r.created_at) })),
  };
}

export async function adminResolve(input: {
  targetKind: "post" | "comment" | "report";
  targetId: number;
  action: "approve" | "remove" | "dismiss";
}): Promise<void> {
  const { targetKind, targetId, action } = input;
  if (targetKind === "report") {
    await q`UPDATE wp_reports SET status = ${action === "dismiss" ? "dismissed" : "actioned"}, resolved_at = now(),
            resolution = ${action} WHERE id = ${targetId}`;
    return;
  }
  const table = targetKind === "post" ? "wp_posts" : "wp_comments";
  if (action === "approve") {
    if (table === "wp_posts") await q`UPDATE wp_posts SET status = 'visible' WHERE id = ${targetId}`;
    else await q`UPDATE wp_comments SET status = 'visible' WHERE id = ${targetId}`;
  } else {
    if (table === "wp_posts") await q`UPDATE wp_posts SET status = 'removed' WHERE id = ${targetId}`;
    else await q`UPDATE wp_comments SET status = 'removed' WHERE id = ${targetId}`;
    const authorRows = table === "wp_posts"
      ? await q`SELECT author_id FROM wp_posts WHERE id = ${targetId}`
      : await q`SELECT author_id FROM wp_comments WHERE id = ${targetId}`;
    const authorId = authorRows.length ? Number(authorRows[0].author_id) : null;
    await q`INSERT INTO wp_mod_log (target_kind, target_id, author_id, score, action, detail)
            VALUES (${targetKind}, ${targetId}, ${authorId}, 0, 'remove', 'Removed by a moderator after review')`;
    await q`UPDATE wp_reports SET status = 'actioned', resolved_at = now(), resolution = 'content removed'
            WHERE target_kind = ${targetKind} AND target_id = ${targetId} AND status = 'open'`;
  }
}
