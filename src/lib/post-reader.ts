import { buildCatalog, cardItems } from "./build-catalog";
import { clipLink } from "./clip-link";
import { hasBaronCallOptions } from "./poll";
import { briefingText, PATCH_PUBLISHER, publicPatch, storedNotesUrl } from "./patch-notes";
import { queryRows } from "./db";
import { HIDDEN_AUTHORS, canDisplayPost, visibleCommentsFor } from "./community-queries";
import { playerFlair } from "./rank";
import { teamBaronFields } from "./pure";
import type { PostView, CommentView } from "./post-types";

type Filter = {
  roomId?: number; authorId?: number; postId?: number; following?: boolean; activeReplies?: boolean;
  builds?: { champion?: string; offMeta?: boolean }; tag?: string;
};
type ReactionGroup = { reactions: Record<string, number>; myReactions: string[] };

const record = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : {};
const itemIds = (value: unknown, max: number) =>
  Array.isArray(value) ? value.filter((id): id is number => Number.isSafeInteger(id) && id > 0).slice(0, max) : [];
const championId = (value: unknown) => typeof value === "string" && /^[A-Za-z0-9]{1,64}$/.test(value) ? value : null;

// Previously stored posts accepted unstructured JSON. Expose only the public fields
// used by each card, and keep malformed legacy payloads from breaking a full page.
function publicPostData(kind: unknown, raw: unknown): Record<string, unknown> {
  const d = record(raw);
  switch (kind) {
    case "poll": {
      if (!Array.isArray(d.options) || d.options.length < 2 || d.options.length > 4 ||
          !d.options.every(option => typeof option === "string" && option.length > 0 && option.length <= 60)) return {};
      // Preserve historical option order. Each stored vote points to an index.
      const options = d.options;
      return d.call === true && hasBaronCallOptions(options) ? {options, call: true} : {options};
    }
    case "build":
      return { champion: championId(d.champion), items: itemIds(d.items, 6),
        patch: typeof d.patch === "string" && /^\d+\.\d+(?:\.\d+)?$/.test(d.patch) ? d.patch : null,
        runes: typeof d.runes === "string" ? d.runes.slice(0,240) : "", offMeta: d.offMeta === true };
    case "card": {
      const m = record(d.match);
      if (!championId(m.champion) || typeof m.win !== "boolean" ||
          ![m.kills,m.deaths,m.assists,m.cs].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) return {};
      return {
        ...(typeof d.matchId === "string" && d.matchId.length <= 70 ? { matchId: d.matchId } : {}),
        ...(typeof d.puuid === "string" && d.puuid.length <= 120 ? { puuid: d.puuid } : {}),
        riotId: typeof d.riotId === "string" ? d.riotId : null,
        match: { champion: m.champion, win: m.win, kills: m.kills, deaths: m.deaths, assists: m.assists, cs: m.cs, items: itemIds(m.items, 7), ...teamBaronFields(m) }};
    }
    case "clip": {
      const url = clipLink(d.url);
      return url ? { url: url.href } : {};
    }
    default: return {};
  }
}

async function reactionsFor(kind: "post" | "comment", ids: number[], viewerId: number | null) {
  const rows = await queryRows(`WITH ${HIDDEN_AUTHORS}
    SELECT target_id, emoji, count(*)::int AS n, bool_or(user_id = $1) AS mine
    FROM wp_reactions WHERE target_kind = $3 AND target_id = ANY($2::int[])
      AND user_id NOT IN (SELECT id FROM hidden)
    GROUP BY target_id, emoji ORDER BY target_id, emoji`, [viewerId, ids, kind]);
  const groups = new Map<number, ReactionGroup>();
  for (const row of rows) {
    const id = Number(row.target_id);
    const group: ReactionGroup = groups.get(id) ?? { reactions: {}, myReactions: [] };
    group.reactions[String(row.emoji)] = Number(row.n);
    if (row.mine) group.myReactions.push(String(row.emoji));
    groups.set(id, group);
  }
  return groups;
}

// The original schema recorded no source marker. Only trust an old match while its
// identity and scoreboard can still be reconstructed from the player's Riot snapshot.
const postDataProjection = `CASE WHEN p.kind = 'card' AND NOT p.card_validated THEN coalesce((
  SELECT jsonb_build_object('puuid', pl.puuid, 'riotId', pl.game_name || '#' || pl.tag_line,
    'matchId', m->>'matchId', 'match', jsonb_build_object(
      'champion', m->'champion', 'win', m->'win', 'kills', m->'kills', 'deaths', m->'deaths',
      'assists', m->'assists', 'cs', m->'cs', 'items', m->'items',
      'teamBaronKills', m->'teamBaronKills', 'baron', m->'baron'))
  FROM wp_players pl CROSS JOIN LATERAL jsonb_array_elements(
    CASE WHEN jsonb_typeof(pl.snapshot->'matches') = 'array' THEN pl.snapshot->'matches' ELSE '[]'::jsonb END
  ) AS recent(m)
  WHERE pl.puuid = p.data->>'puuid' AND m->>'matchId' = p.data->>'matchId' LIMIT 1
), '{}'::jsonb) ELSE p.data END`;

// A fresh answer can surface an older discussion. The same visible-ancestor rules
// used for threads also apply to this ranking, including legacy nested replies.
const recentDiscussionActivity = `, candidates AS (
    SELECT DISTINCT c.post_id FROM wp_comments c WHERE c.status='visible' AND c.created_at>=now()-interval '7 days'
  ), ${visibleCommentsFor("posts", "candidates")}, activity AS (
    SELECT t.post_id,max(c.created_at) AS answered_at FROM thread t
    JOIN wp_comments c ON c.id=t.id JOIN wp_posts original ON original.id=t.post_id
    WHERE c.created_at>=now()-interval '7 days' AND c.author_id<>original.author_id
      AND c.author_id IS DISTINCT FROM (SELECT id FROM wp_users WHERE email=$11)
    GROUP BY t.post_id
  )`;

export async function readPosts(viewerId: number | null, filter: Filter, limit: number): Promise<PostView[]> {
  // Bound expensive flair and legacy-card lookups to the selected page.
  const rows = await queryRows(`WITH RECURSIVE ${HIDDEN_AUTHORS}${filter.activeReplies ? recentDiscussionActivity : ""}, chosen AS (
    SELECT p.*, ${filter.activeReplies ? "a.answered_at" : "NULL::timestamptz"} AS answered_at,
      ${filter.activeReplies ? "greatest(p.created_at,a.answered_at)" : "p.created_at"} AS sort_at
    FROM wp_posts p ${filter.activeReplies ? "LEFT JOIN activity a ON a.post_id=p.id" : ""}
    WHERE ${canDisplayPost}
      AND (p.status = 'visible' OR ($4::int IS NOT NULL AND p.status = 'held' AND p.author_id = $1
        AND NOT EXISTS (SELECT 1 FROM wp_safety_urgent e WHERE e.target_kind = 'post' AND e.target_id = p.id AND e.reviewed_at IS NULL)))
      AND ($2::int IS NULL OR p.room_id = $2) AND ($3::int IS NULL OR p.author_id = $3)
      AND ($4::int IS NULL OR p.id = $4)
      AND (NOT $5::boolean OR p.author_id = $1
        OR EXISTS (SELECT 1 FROM wp_follows WHERE follower_id = $1 AND followee_id = p.author_id)
        OR EXISTS (SELECT 1 FROM wp_room_members WHERE user_id = $1 AND room_id = p.room_id))
      AND (NOT $6::boolean OR p.kind = 'build')
      AND ($7::text IS NULL OR lower(p.data->>'champion') = lower($7))
      AND (NOT $8::boolean OR p.data->'offMeta' = 'true'::jsonb)
      AND ($9::text IS NULL OR strpos(lower(p.body), lower($9)) > 0)
      AND ($2::int IS NOT NULL OR $4::int IS NOT NULL
        OR NOT (p.kind='text' AND p.data @> '{"briefing":true}' AND
          p.author_id IS NOT DISTINCT FROM (SELECT id FROM wp_users WHERE email=$11))
        OR (p.room_id=(SELECT id FROM wp_rooms WHERE slug='patch-meta') AND NOT EXISTS (
          SELECT 1 FROM wp_posts older WHERE older.author_id=p.author_id AND older.room_id=p.room_id
            AND older.kind='text' AND older.data @> '{"briefing":true}' AND older.status='visible' AND older.id<p.id
            AND split_part(older.data->>'patch','.',1)=split_part(p.data->>'patch','.',1)
            AND split_part(older.data->>'patch','.',2)=split_part(p.data->>'patch','.',2))))
    ORDER BY sort_at DESC, p.id DESC LIMIT $10
    )
    SELECT p.id, p.author_id, p.kind, p.room_id, p.answered_at, ${postDataProjection} AS data, p.body, p.status, p.created_at,
      u.email=$11 AS is_publisher, rm.champion_id AS room_champion,
      EXISTS (SELECT 1 FROM wp_decisions d WHERE d.post_id=p.id) AS is_question,
      u.display_name AS author_name, u.avatar_hue AS author_hue, rm.slug AS room_slug, rm.name AS room_name, flair.label
    FROM chosen p JOIN wp_users u ON u.id = p.author_id
    LEFT JOIN wp_rooms rm ON rm.id = p.room_id
    LEFT JOIN LATERAL (
      SELECT jsonb_build_array(pl.rank_tier, pl.rank_div, pl.snapshot #> '{champPool,0,champion}') AS label
      FROM wp_links l JOIN wp_players pl ON pl.puuid = l.puuid WHERE l.user_id = p.author_id AND l.verified
        AND NOT EXISTS (SELECT 1 FROM wp_links other WHERE other.puuid = l.puuid AND other.verified AND other.user_id <> l.user_id)
      ORDER BY l.is_primary DESC, l.created_at, l.puuid LIMIT 1
    ) flair ON TRUE
    ORDER BY p.sort_at DESC, p.id DESC`,
    [viewerId, filter.roomId ?? null, filter.authorId ?? null, filter.postId ?? null,
      Boolean(filter.following), Boolean(filter.builds), filter.builds?.champion || null,
      Boolean(filter.builds?.offMeta), filter.tag ? '#' + filter.tag : null, Math.min(Math.max(limit, 1), 100), PATCH_PUBLISHER]);
  if (!rows.length) return [];
  const ids = rows.map(r => Number(r.id));
  const polls = rows.filter(r => r.kind === "poll").map(r => Number(r.id));
  const [groups, counts, votes, catalog] = await Promise.all([
    reactionsFor("post", ids, viewerId),
    queryRows(`WITH RECURSIVE ${HIDDEN_AUTHORS}, ${visibleCommentsFor("posts")}
      SELECT post_id, count(*)::int AS n FROM thread GROUP BY post_id`, [viewerId, ids]),
    polls.length ? queryRows(`SELECT post_id, option_idx, count(*)::int AS n, bool_or(user_id = $1) AS mine
      FROM wp_poll_votes WHERE post_id = ANY($2::int[]) GROUP BY post_id, option_idx`, [viewerId, polls]) : [],
    rows.some(r => r.kind === "card" || r.kind === "build") ? buildCatalog() : null,
  ]);
  const commentCounts = new Map(counts.map(r => [Number(r.post_id), Number(r.n)]));
  const pollCounts = new Map<number, Map<number, number>>();
  const myVotes = new Map<number, number>();
  for (const row of votes) {
    const id = Number(row.post_id), index = Number(row.option_idx);
    const options = pollCounts.get(id) ?? new Map<number, number>();
    options.set(index, Number(row.n));
    pollCounts.set(id, options);
    if (row.mine) myVotes.set(id, index);
  }
  return rows.map(r => {
    const id = Number(r.id), raw = record(r.data);
    const version = r.is_publisher && r.kind === "text" && raw.briefing === true &&
      typeof raw.patch === "string" && publicPatch(raw.patch) ? raw.patch : null;
    const data = version
      ? { briefing: true, patch: version, notesUrl: storedNotesUrl(version, raw.notesUrl) }
      : publicPostData(r.kind, raw);
    const flair = r.label as [string | null, string | null, unknown] | null;
    return {
      id, authorId: Number(r.author_id), authorName: String(r.author_name), authorHue: Number(r.author_hue),
      isQuestion:r.is_question === true,
      authorFlair: flair ? playerFlair(...flair) : null,
      ...(r.answered_at ? { lastReplyAt: String(r.answered_at) } : {}),
      ...(catalog && (r.kind === "card" || r.kind === "build") ? {itemPatch:catalog.patch,itemDetails:cardItems(catalog,r.kind === "card" ? record(data.match).items : data.items)} : {}),
      kind: String(r.kind), body: version ? briefingText(version, r.room_champion as string | null) : String(r.body), data, status: String(r.status), createdAt: String(r.created_at),
      roomId: r.room_id == null ? null : Number(r.room_id), roomSlug: r.room_slug as string | null, roomName: r.room_name as string | null,
      ...(groups.get(id) ?? { reactions: {}, myReactions: [] }), commentCount: commentCounts.get(id) ?? 0,
      pollResults: r.kind === "poll" && Array.isArray(data?.options) ? data.options.map((_, i) => pollCounts.get(id)?.get(i) ?? 0) : null,
      myVote: myVotes.get(id) ?? null,
    };
  });
}

export async function readComments(postId: number, viewerId: number | null): Promise<CommentView[]> {
  const rows = await queryRows(`WITH RECURSIVE ${HIDDEN_AUTHORS}, ${visibleCommentsFor("posts")}
    SELECT c.*, u.display_name AS author_name, u.avatar_hue AS author_hue
    FROM thread t JOIN wp_comments c ON c.id = t.id JOIN wp_users u ON u.id = c.author_id
    ORDER BY c.created_at, c.id`, [viewerId, [postId]]);
  if (!rows.length) return [];
  const groups = await reactionsFor("comment", rows.map(r => Number(r.id)), viewerId);
  const byId = new Map<number, CommentView>();
  for (const r of rows) {
    const id = Number(r.id);
    byId.set(id, {
      id, postId, authorId: Number(r.author_id), authorName: String(r.author_name), authorHue: Number(r.author_hue),
      parentId: r.parent_id == null ? null : Number(r.parent_id), body: String(r.body),
      status: String(r.status), createdAt: String(r.created_at), oneFix: Boolean(r.one_fix),
      ...(groups.get(id) ?? { reactions: {}, myReactions: [] }), replies: [],
    });
  }
  const roots: CommentView[] = [];
  for (const comment of byId.values()) {
    if (comment.parentId == null) roots.push(comment);
    else byId.get(comment.parentId)?.replies.push(comment);
  }
  return roots;
}
