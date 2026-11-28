import { cache } from "react";
import { APP_NAME } from "./brand";
import { q, dbAvailable, queryRows } from "./db";
import { championCatalog } from "./riot";
import { validId } from "./ids";
import { HIDDEN_AUTHORS, visiblePostForInteraction } from "./community-queries";

export interface Room {
  id: number;
  slug: string;
  name: string;
  kind: string;
  championId: string | null;
  description: string;
  members: number;
  latestPost?: { id: number; createdAt: string };
  host: { id: number; name: string } | null;
}
/* ---------------------------------- rooms --------------------------------- */

const featuredSlugs = ["new-players", "off-meta-lab", "patch-meta", "general", "lfg-lobby"];
/** Champion room names come from the champion's display name, never the
 * Data Dragon id: "Aurelion Sol Mains", not "AurelionSol Mains". */
export function championRoomName(championDisplayName: string): string {
  return `${championDisplayName} Mains`;
}

export function featuredRooms<T extends Pick<Room, "slug">>(rooms: T[]): T[] {
  return featuredSlugs.flatMap(slug => rooms.filter(room => room.slug === slug));
}

// Public recognition is a separate opt-in from private pilot participation.
function namedHosts() {
  try {
    const roster: unknown = JSON.parse(process.env.PUBLIC_ROOM_HOSTS || "{}");
    if (!roster || typeof roster !== "object" || Array.isArray(roster)) return {};
    return Object.fromEntries(Object.entries(roster).filter(([slug, id]) => featuredSlugs.includes(slug) && validId(id)));
  } catch {
    return {};
  }
}

const BROAD_ROOMS = [
  { slug: "general", name: `The ${APP_NAME}`, description: "Meet the community, swap stories and find someone for your next game." },
  { slug: "patch-meta", name: "Patch & Meta", description: "Patch notes, tier debates, pro meta talk." },
  {
    slug: "off-meta-lab",
    name: "Off-Meta Lab",
    description: "Weird builds and brave picks. Off-meta is first-class here.",
  },
  {
    slug: "lfg-lobby",
    name: "LFG Lobby",
    description: "Find a duo or a five-stack. Listings live on the LFG board.",
  },
  {
    slug: "new-players",
    name: "New Players",
    description: "Questions welcome. Veterans: be the reason someone stays.",
  },
];
let roomsReady: Promise<void> | undefined;
let recheckRoomsAt = 0;

export function ensureRooms(): Promise<void> {
  if (!dbAvailable()) return Promise.resolve();
  if (!roomsReady || Date.now() >= recheckRoomsAt) {
    recheckRoomsAt = Infinity;
    roomsReady = seedRooms()
      .then((complete) => {
        recheckRoomsAt = Date.now() + (complete ? 6 * 60 : 5) * 60_000;
      })
      .catch((error) => {
        roomsReady = undefined;
        throw error;
      });
  }
  return roomsReady;
}

async function seedRooms() {
  const { list, current } = await championCatalog();
  const rooms = [
    ...BROAD_ROOMS.map((room) => ({ ...room, kind: "general", champion_id: null })),
    // Slugs keep the Data Dragon id; names and descriptions use the display
    // name ("Aurelion Sol Mains", never the squashed internal "AurelionSol").
    ...list.map((champion) => ({
      slug: `champ-${champion.id.toLowerCase()}`,
      name: championRoomName(champion.name),
      kind: "champion",
      champion_id: champion.id,
      description: `For ${champion.name} players: builds, matchups, clips, and questions.`,
    })),
  ];
  await q`WITH seed AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(rooms)}::jsonb)
        AS rows(slug text,name text,kind text,champion_id text,description text)
    ), community_room AS (
      INSERT INTO wp_rooms (slug,name,kind,champion_id,description)
      SELECT slug,name,kind,champion_id,description FROM seed WHERE slug='general'
      ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description
      WHERE wp_rooms.safety_status='visible'
        AND (wp_rooms.name,wp_rooms.description) IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.description)
    )
    INSERT INTO wp_rooms (slug,name,kind,champion_id,description)
    SELECT slug,name,kind,champion_id,description FROM seed WHERE slug<>'general'
    ON CONFLICT (slug) DO NOTHING`;
  return current;
}

function roomFromRow(r: Record<string, unknown>) {
  return {
    id: Number(r.id),
    slug: String(r.slug),
    name: String(r.name),
    kind: String(r.kind),
    championId: (r.champion_id as string) ?? null,
    description: String(r.description),
    members: Number(r.members),
    host: r.host_id == null ? null : { id: Number(r.host_id), name: String(r.host_name) },
    joined: r.joined === true,
    ...(r.latest_post_id != null ? { latestPost: { id: Number(r.latest_post_id), createdAt: String(r.latest_post_at) } } : {}),
    raidUntil: r.raid_until && new Date(String(r.raid_until)).getTime() > Date.now() ? String(r.raid_until) : null,
  };
}

async function readRooms(userId: number | undefined, limit: number, slug: string | null, featuredOnly = false, nameContains: string | null = null) {
  await ensureRooms();
  const includeActivity = slug === null && nameContains === null;
  // Search keeps the text and member lookup only. Featured room rows also get their latest visible post.
  const rows = await queryRows(`WITH ${HIDDEN_AUTHORS}, rooms AS (
    SELECT r.* FROM wp_rooms r WHERE r.safety_status='visible' AND ($3::text IS NULL OR r.slug=$3)
      AND ($4::text IS NULL OR strpos(lower(r.name),lower($4)) > 0)
      AND (NOT $5::boolean OR r.slug=ANY($6::text[]))
    ORDER BY r.kind DESC,r.name,r.id LIMIT $7
  ) SELECT r.*,h.id AS host_id,h.display_name AS host_name,m.members,m.joined
    ${includeActivity ? ",activity.id AS latest_post_id,activity.created_at AS latest_post_at" : ""}
    FROM rooms r
    LEFT JOIN wp_users h ON h.id=(($2::jsonb)->>r.slug)::int AND h.age_band='adult' AND h.id NOT IN (SELECT id FROM hidden)
    CROSS JOIN LATERAL (
      SELECT count(*) FILTER (WHERE m.user_id NOT IN (SELECT id FROM hidden))::int AS members,
        coalesce(bool_or(m.user_id=$1::int),false) AS joined
      FROM wp_room_members m WHERE m.room_id=r.id
    ) m
    ${includeActivity ? `LEFT JOIN LATERAL (
      SELECT p.id,p.created_at FROM wp_posts p WHERE r.slug=ANY($6::text[]) AND p.room_id=r.id
        AND ${visiblePostForInteraction} ORDER BY p.created_at DESC,p.id DESC LIMIT 1
    ) activity ON TRUE` : ""}
    ORDER BY r.kind DESC,r.name,r.id`, [userId ?? null, JSON.stringify(namedHosts()), slug, nameContains, featuredOnly, featuredSlugs, limit]);
  return rows.map(roomFromRow);
}

export function listRooms(userId?: number, limit = 500, nameContains: string | null = null) {
  return readRooms(userId, limit, null, false, nameContains);
}

export async function listFeaturedRooms(userId?: number) {
  return featuredRooms(await readRooms(userId, featuredSlugs.length, null, true));
}

export async function visibleChampionRoomSlugs(championIds?: readonly string[]): Promise<string[]> {
  if (!dbAvailable() || championIds?.length === 0) return [];
  const slugs = championIds?.map(id => `champ-${id.toLowerCase()}`) ?? null;
  await ensureRooms();
  const rows = await q`SELECT slug FROM wp_rooms WHERE kind='champion' AND safety_status='visible'
    AND slug='champ-' || lower(champion_id) AND (${slugs}::text[] IS NULL OR slug=ANY(${slugs}::text[]))`;
  return rows.map(row => String(row.slug));
}

export async function joinedRoomIds(userId: number): Promise<number[]> {
  return (await q`SELECT r.id FROM wp_room_members m JOIN wp_rooms r ON r.id=m.room_id
    WHERE m.user_id=${userId} AND r.safety_status='visible'`).map(row => Number(row.id));
}

export const getRoom = cache(async function getRoom(slug: string, userId?: number) {
  const rows = await readRooms(userId, 1, slug);
  return rows[0] ?? null;
});

export async function setRoomMembership(userId: number, roomId: number, join: boolean): Promise<boolean> {
  if (!join) {
    await q`DELETE FROM wp_room_members WHERE room_id = ${roomId} AND user_id = ${userId}`;
    return true;
  }
  const rows = await q`WITH available AS (
    SELECT id FROM wp_rooms WHERE id=${roomId} AND safety_status='visible' FOR SHARE
  ), joined AS (
    INSERT INTO wp_room_members(room_id,user_id) SELECT id,${userId} FROM available ON CONFLICT DO NOTHING
  ) SELECT id FROM available`;
  return rows.length > 0;
}
