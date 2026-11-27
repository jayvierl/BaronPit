import { tagExcerpt } from "./tag-excerpt";
import { buildCatalog, cardItems } from "./build-catalog";
import { buildKeystone } from "./build-sharing";
import { clipLink } from "./clip-link";
import { gameCardMotion } from "./game-card-motion";
import { postDataProjection, questionDecisionPost } from "./match-card-projection";
import { matchRegion, projectMatchContext, safeMatchRiotId } from "./match-context";
import { isPublicMatchQueue, publicQueueSql } from "./public-match-queues";
import { hasBaronCallOptions } from "./poll";
import { briefingText, PATCH_PUBLISHER, publicPatch, storedNotesUrl } from "./patch-notes";
import { queryRows } from "./db";
import { HIDDEN_AUTHORS, canDisplayPost, visibleCommentsFor } from "./community-queries";
import { placedRank, PLAYER_CACHE_TTL_MS, playerFlair, readRankedEntries } from "./player-summary";
import { currentWinStreak } from "./current-win-streak";
import { isPlatform, playerStatsHref } from "./platforms";
import { publicAvatar } from "./avatar";
import { teamBaronFields } from "./pure";
import { followedReposts, repostableContent } from "./reposts";
import { quoteProjectionJoin } from "./quote-queries";
import type { PostView, CommentView } from "./post-types";
import { feedCursor, type FeedCursor, type HomeFeedTab } from "./feed-pagination";

type Filter = {
  roomId?: number; authorId?: number; postId?: number; following?: boolean; activeReplies?: boolean;
  builds?: { champion?: string; item?: number; offMeta?: boolean }; tag?: string; text?: string;
  kind?: "poll" | "build"; questions?: boolean;
  page?: { asOf: string; before: FeedCursor | null };
};
type PagingPost = PostView & { cursorAt?: string };
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
        runes: typeof d.runes === "string" ? d.runes.slice(0,240) : "", keystone: buildKeystone(d.keystone), offMeta: d.offMeta === true };
    case "card": {
      const m = record(d.match);
      if (!championId(m.champion) || typeof m.win !== "boolean" ||
          ![m.kills,m.deaths,m.assists,m.cs].every(n => typeof n === "number" && Number.isSafeInteger(n) && n >= 0)) return {};
      const matchContext = projectMatchContext(d.matchContext);
      const queueId = matchContext?.queueId ?? (isPublicMatchQueue(m.queueId) ? m.queueId : undefined);
      const platform = matchContext?.platform ?? (typeof d.platform === "string" && isPlatform(d.platform) ? d.platform : null);
      const riotId = platform ? safeMatchRiotId(d.riotId, platform) : null;
      return {
        ...(typeof d.matchId === "string" && matchRegion(d.matchId) && riotId ? { matchId: d.matchId, platform } : {}),
        ...(matchContext ? { matchContext } : {}),
        riotId,
        motion: gameCardMotion(m.win),
        match: { champion: m.champion, win: m.win, kills: m.kills, deaths: m.deaths, assists: m.assists, cs: m.cs, items: itemIds(m.items, 7),
          ...(queueId === undefined ? {} : { queueId }), ...teamBaronFields(m) }};
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

// A fresh answer can surface an older discussion. The same visible-ancestor rules
// used for threads also apply to this ranking, including legacy nested replies.
// Group by the stored comment's post ID so PostgreSQL can use its distinct-value statistics.
function recentDiscussionActivity(asOf: string) { return `, candidates AS (
    SELECT DISTINCT c.post_id FROM wp_comments c WHERE c.status='visible' AND c.created_at BETWEEN ${asOf}-interval '7 days' AND ${asOf}
  ), ${visibleCommentsFor("posts", "candidates")}, activity AS (
    SELECT DISTINCT ON (c.post_id) c.post_id,c.created_at AS answered_at,c.id AS reply_id FROM thread t
    JOIN wp_comments c ON c.id=t.id JOIN wp_posts original ON original.id=c.post_id
    WHERE c.created_at BETWEEN ${asOf}-interval '7 days' AND ${asOf} AND c.author_id<>original.author_id
      AND c.author_id IS DISTINCT FROM (SELECT id FROM wp_users WHERE email=$11)
    ORDER BY c.post_id,c.created_at DESC,c.id DESC
  )`; }

async function queryPosts(viewerId: number | null, filter: Filter, limit: number): Promise<PagingPost[]> {
  const asOfSql = filter.page ? "$12::timestamptz" : "now()";
  const activityAt = `greatest(p.created_at, ${filter.following ? "s.first_shared_at" : filter.activeReplies ? "a.answered_at" : "NULL::timestamptz"})`;
  // Bound expensive flair and legacy-card lookups to the selected page.
  const rows = await queryRows(`WITH RECURSIVE ${HIDDEN_AUTHORS}${filter.activeReplies ? recentDiscussionActivity(asOfSql) : ""}${filter.following ? followedReposts(Boolean(filter.page)) : ""}, chosen AS (
    SELECT p.*, ${filter.activeReplies ? "a.answered_at" : "NULL::timestamptz"} AS answered_at,
      ${filter.activeReplies ? "a.reply_id" : "NULL::int"} AS reply_id,
      ${filter.following ? "s.user_id" : "NULL::int"} AS sharer,
      ${filter.following ? "s.first_shared_at" : "NULL::timestamptz"} AS shared_at,
      ${activityAt} AS sort_at
    FROM wp_posts p ${filter.activeReplies ? "LEFT JOIN activity a ON a.post_id=p.id" : ""}
      ${filter.following ? "LEFT JOIN shared s ON s.post_id=p.id" : ""}
    WHERE ${canDisplayPost}
      AND (p.status = 'visible' OR ($4::int IS NOT NULL AND p.status = 'held' AND p.author_id = $1
        AND NOT EXISTS (SELECT 1 FROM wp_safety_urgent e WHERE e.target_kind = 'post' AND e.target_id = p.id AND e.reviewed_at IS NULL)))
      AND ($2::int IS NULL OR p.room_id = $2) AND ($3::int IS NULL OR p.author_id = $3)
      AND ($4::int IS NULL OR p.id = $4)
      ${filter.page ? `AND p.created_at <= ${asOfSql} AND ($13::timestamptz IS NULL OR (${activityAt},p.id) < ($13::timestamptz,$14::int))` : ""}
      AND (NOT $5::boolean OR p.author_id = $1
        OR EXISTS (SELECT 1 FROM wp_follows WHERE follower_id = $1 AND followee_id = p.author_id)
        OR EXISTS (SELECT 1 FROM wp_room_members WHERE user_id = $1 AND room_id = p.room_id)
        ${filter.following ? "OR s.user_id IS NOT NULL" : ""})
      AND ($6::text IS NULL OR p.kind = $6)
      ${filter.questions ? `AND ${questionDecisionPost} AND EXISTS (SELECT 1 FROM wp_decisions d WHERE d.post_id = p.id)` : ""}
      AND ($7::text IS NULL OR lower(p.data->>'champion') = lower($7))
      AND (NOT $8::boolean OR p.data->'offMeta' = 'true'::jsonb)
      ${filter.builds?.item ? `AND p.data->'items' @> jsonb_build_array(${filter.page ? "$15" : "$12"}::int)` : ""}
      AND ($9::text IS NULL OR strpos(lower(p.body), lower($9)) > 0
        OR (p.kind='build' AND strpos(lower(p.data->>'champion'), lower($9)) > 0)
        OR (p.kind='card' AND p.card_validated AND ${publicQueueSql("(p.data->'matchContext')")}
          AND strpos(lower(p.data#>>'{matchContext,champion}'), lower($9)) > 0))
      AND ($2::int IS NOT NULL OR $4::int IS NOT NULL
        OR NOT (p.kind='text' AND p.data @> '{"briefing":true}' AND
          p.author_id IS NOT DISTINCT FROM (SELECT id FROM wp_users WHERE email=$11))
        OR (p.room_id=(SELECT id FROM wp_rooms WHERE slug='patch-meta') AND NOT EXISTS (
          SELECT 1 FROM wp_posts older WHERE older.author_id=p.author_id AND older.room_id=p.room_id
            AND older.kind='text' AND older.data @> '{"briefing":true}' AND older.status='visible' AND older.id<p.id
            AND split_part(older.data->>'patch','.',1)=split_part(p.data->>'patch','.',1)
            AND split_part(older.data->>'patch','.',2)=split_part(p.data->>'patch','.',2))))
    ORDER BY sort_at DESC, p.id DESC LIMIT $10
    ), flair AS MATERIALIZED (
      SELECT authors.author_id, player.* FROM (SELECT DISTINCT author_id FROM chosen) authors
      LEFT JOIN LATERAL (
        SELECT jsonb_build_array(pl.rank_tier, pl.rank_div, public_games.main, pl.snapshot->'rankedEntries', pl.fetched_at) AS label,
          pl.platform, pl.game_name || '#' || pl.tag_line AS riot_id,
          CASE WHEN pl.fetched_at > now() - (${PLAYER_CACHE_TTL_MS} * interval '1 millisecond') THEN public_games.streak_matches END AS streak_matches
        FROM wp_links l JOIN wp_players pl ON pl.puuid = l.puuid
        LEFT JOIN LATERAL (
          WITH sample AS MATERIALIZED (
            SELECT m,pos FROM jsonb_array_elements(CASE WHEN jsonb_typeof(pl.snapshot->'matches')='array'
              THEN pl.snapshot->'matches' ELSE '[]'::jsonb END) WITH ORDINALITY AS recent(m,pos)
            WHERE pos<=20 AND ${publicQueueSql("m")}
          ) SELECT (SELECT m->>'champion' FROM sample WHERE jsonb_typeof(m->'champion')='string'
            GROUP BY m->>'champion' ORDER BY count(*) DESC,min(pos) LIMIT 1) AS main,
            (SELECT jsonb_agg(jsonb_build_object('matchId',m->'matchId','playedAt',m->'playedAt','win',m->'win') ORDER BY pos)
              FROM sample) AS streak_matches
        ) public_games ON true
        WHERE l.user_id = authors.author_id AND l.verified
          AND NOT EXISTS (SELECT 1 FROM wp_links other WHERE other.puuid = l.puuid AND other.verified AND other.user_id <> l.user_id)
        ORDER BY l.is_primary DESC, l.created_at, l.puuid LIMIT 1
      ) player ON TRUE
    )
    SELECT p.id, p.author_id, p.kind, p.room_id, p.answered_at, p.reply_id, ${postDataProjection} AS data, p.body, p.status, p.replies_closed, p.created_at,
      ${filter.page ? `to_char(p.sort_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at,` : ""}
      ballot.closes_at, ballot.tally AS daily_tally, ballot.closes_at <= now() AS daily_closed, payoff.post_id AS payoff_for,
      p.sharer,p.shared_at,sh.display_name AS sharer_name,
      (p.status='visible' AND p.author_id IS DISTINCT FROM $1 AND ${repostableContent("$11")}) AS can_repost,
      (p.status='visible' AND ${repostableContent("$11")}) AS can_quote,
      quoted.post_id IS NOT NULL AS has_quote,quote_preview.id AS quote_source_id,quote_preview.display_name AS quote_author,
      quote_preview.excerpt AS quote_excerpt,quote_preview.room_name AS quote_room,
      EXISTS (SELECT 1 FROM wp_reposts r WHERE r.user_id=$1 AND r.post_id=p.id AND r.active) AS my_repost,
      u.email=$11 AS is_publisher, rm.champion_id AS room_champion,
      (${questionDecisionPost} AND EXISTS (SELECT 1 FROM wp_decisions d WHERE d.post_id=p.id)) AS is_question,
      u.display_name AS author_name, u.avatar_hue AS author_hue, u.avatar_ref, rm.slug AS room_slug, rm.name AS room_name,
      flair.label, flair.platform, flair.riot_id, flair.streak_matches
    FROM chosen p JOIN wp_users u ON u.id = p.author_id
    LEFT JOIN wp_users sh ON sh.id=p.sharer
    LEFT JOIN wp_rooms rm ON rm.id = p.room_id
    LEFT JOIN wp_daily_calls ballot ON ballot.post_id=p.id
    LEFT JOIN wp_daily_calls payoff ON payoff.payoff_post_id=p.id
    LEFT JOIN flair ON flair.author_id = p.author_id
    ${quoteProjectionJoin}
    ORDER BY p.sort_at DESC, p.id DESC`,
    [viewerId, filter.roomId ?? null, filter.authorId ?? null, filter.postId ?? null,
      Boolean(filter.following), filter.builds ? "build" : filter.kind ?? null, filter.builds?.champion || null,
      Boolean(filter.builds?.offMeta), filter.tag ? '#' + filter.tag : filter.text || null, Math.min(Math.max(limit, 1), 100), PATCH_PUBLISHER,
      ...(filter.page ? [filter.page.asOf, filter.page.before?.before ?? null, filter.page.before?.id ?? null] : []),
      ...(filter.builds?.item ? [filter.builds.item] : [])]);
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
  const streaks = new Map<number, number | null>();
  const asOf = Date.now();
  return rows.map(r => {
    const id = Number(r.id), raw = record(r.data);
    const authorId = Number(r.author_id);
    const version = r.is_publisher && r.kind === "text" && raw.briefing === true &&
      typeof raw.patch === "string" && publicPatch(raw.patch) ? raw.patch : null;
    const data = version
      ? { briefing: true, patch: version, notesUrl: storedNotesUrl(version, raw.notesUrl) }
      : publicPostData(r.kind, raw);
    const dailyTally = Array.isArray(r.daily_tally) ? r.daily_tally.map(Number) : null;
    const flair = r.label as [string | null, string | null, unknown, unknown, string?] | null;
    const rankFields = flair && {rankTier:flair[0], rankDiv:flair[1], rankedEntries:readRankedEntries(flair[3]), fetchedAt:flair[4]};
    if (!streaks.has(authorId)) streaks.set(authorId, flair?.[4] ? currentWinStreak({ matches: r.streak_matches }, flair[4], asOf) : null);
    const authorWinStreak = streaks.get(authorId);
    return {
      id, authorId, authorName: String(r.author_name), authorHue: Number(r.author_hue),
      ...(filter.page ? { cursorAt: String(r.cursor_at) } : {}),
      authorAvatar: publicAvatar(r.avatar_ref),
      isQuestion:r.is_question === true,
      repliesClosed: r.replies_closed === true,
      canRepost: r.can_repost === true, myRepost: r.my_repost === true, canQuote: r.can_quote === true,
      ...(r.has_quote === true ? { quote: { original: r.quote_source_id != null ? {
        postId: Number(r.quote_source_id), author: String(r.quote_author), body: tagExcerpt(String(r.quote_excerpt), 180),
        room: typeof r.quote_room === "string" ? r.quote_room : null,
      } : null } } : {}),
      ...(r.sharer != null ? {repostedBy: {id: Number(r.sharer), name: String(r.sharer_name), at: String(r.shared_at)}} : {}),
      authorFlair: flair && rankFields ? playerFlair(rankFields, flair[2]) : null,
      ...(authorWinStreak ? { authorWinStreak } : {}),
      authorTier: rankFields ? placedRank(rankFields).tier : null,
      ...(flair && r.platform && r.riot_id ? {authorStatsHref:playerStatsHref(String(r.platform), String(r.riot_id))} : {}),
      ...(r.answered_at && r.reply_id ? { lastReplyAt: String(r.answered_at), lastReplyId: Number(r.reply_id) } : {}),
      ...(r.closes_at ? { dailyCall: { closesAt: new Date(String(r.closes_at)).toISOString(),
        closed: r.daily_closed === true || dailyTally !== null, finalized: dailyTally !== null } } : {}),
      ...(r.payoff_for != null ? { dailyCallPayoffFor: Number(r.payoff_for) } : {}),
      ...(catalog && (r.kind === "card" || r.kind === "build") ? {itemPatch:catalog.patch,itemDetails:cardItems(catalog,r.kind === "card" ? record(data.match).items : data.items)} : {}),
      kind: String(r.kind), body: version ? briefingText(version, r.room_champion as string | null) : String(r.body), data, status: String(r.status), createdAt: String(r.created_at),
      roomId: r.room_id == null ? null : Number(r.room_id), roomSlug: r.room_slug as string | null, roomName: r.room_name as string | null,
      ...(groups.get(id) ?? { reactions: {}, myReactions: [] }), commentCount: commentCounts.get(id) ?? 0,
      pollResults: dailyTally ?? (r.kind === "poll" && Array.isArray(data?.options) ? data.options.map((_, i) => pollCounts.get(id)?.get(i) ?? 0) : null),
      myVote: myVotes.get(id) ?? null,
    };
  });
}

export function readPosts(viewerId: number | null, filter: Filter, limit: number): Promise<PostView[]> {
  return queryPosts(viewerId, filter, limit);
}

export async function readHomeFeedPage(viewerId: number | null, tab: HomeFeedTab, before: FeedCursor | null, now: number, limit = 30) {
  if (tab === "following" && viewerId === null) return { posts: [], next: null };
  const asOf = before?.asOf ?? new Date(now).toISOString();
  const rows = await queryPosts(viewerId, { following: tab === "following", activeReplies: tab === "everyone", page: { asOf, before } }, limit + 1);
  const last = rows[limit - 1];
  const next = rows.length > limit && last?.cursorAt ? feedCursor(tab, asOf, last.cursorAt, last.id) : null;
  const posts = rows.slice(0, limit).map(row => {
    const post = { ...row };
    delete post.cursorAt;
    return post;
  });
  return { posts, next };
}

export async function readComments(postId: number, viewerId: number | null): Promise<CommentView[]> {
  const rows = await queryRows(`WITH RECURSIVE ${HIDDEN_AUTHORS}, ${visibleCommentsFor("posts")}
    SELECT c.id, c.author_id, c.parent_id, c.body, c.status, c.created_at, c.one_fix, c.match_ref,
      u.display_name AS author_name, u.avatar_hue AS author_hue, u.avatar_ref
    FROM thread t JOIN wp_comments c ON c.id = t.id JOIN wp_users u ON u.id = c.author_id
    ORDER BY c.created_at, c.id`, [viewerId, [postId]]);
  if (!rows.length) return [];
  const groups = await reactionsFor("comment", rows.map(r => Number(r.id)), viewerId);
  const byId = new Map<number, CommentView>();
  for (const r of rows) {
    const id = Number(r.id);
    byId.set(id, {
      id, postId, authorId: Number(r.author_id), authorName: String(r.author_name), authorHue: Number(r.author_hue),
      authorAvatar: publicAvatar(r.avatar_ref),
      parentId: r.parent_id == null ? null : Number(r.parent_id), body: String(r.body),
      ...(typeof r.match_ref === "string" && { matchRef: r.match_ref }),
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
