import { APP_NAME } from "./brand";
import { q, dbAvailable } from "./db";
import { championCatalog } from "./riot";
import { validId } from "./ids";

export interface Room {
  id: number;
  slug: string;
  name: string;
  kind: string;
  championId: string | null;
  description: string;
  members: number;
  host: { id: number; name: string } | null;
}
/* ---------------------------------- rooms --------------------------------- */

const featuredSlugs = ["new-players", "off-meta-lab", "patch-meta", "general"];
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
  const ids = list.map((c) => c.id);
  const rooms = [
    ...BROAD_ROOMS.map((room) => ({ ...room, kind: "general", champion_id: null })),
    ...ids.map((id) => ({
      slug: `champ-${id.toLowerCase()}`,
      name: `${id} Mains`,
      kind: "champion",
      champion_id: id,
      description: `For ${id} players: builds, matchups, clips, and questions.`,
    })),
  ];
  await q`WITH seed AS MATERIALIZED (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(rooms)}::jsonb)
        AS rows(slug text,name text,kind text,champion_id text,description text)
    ), community_room AS (
      INSERT INTO wp_rooms (slug,name,kind,champion_id,description)
      SELECT slug,name,kind,champion_id,description FROM seed WHERE slug='general'
      ON CONFLICT (slug) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description
      WHERE (wp_rooms.name,wp_rooms.description) IS DISTINCT FROM (EXCLUDED.name,EXCLUDED.description)
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
    raidUntil: r.raid_until && new Date(String(r.raid_until)).getTime() > Date.now() ? String(r.raid_until) : null,
  };
}

async function readRooms(userId: number | undefined, limit: number, slug: string | null, featuredOnly = false) {
  await ensureRooms();
  const rows = await q`SELECT r.*,h.id AS host_id,h.display_name AS host_name,count(m.user_id)::int AS members,
    coalesce(bool_or(m.user_id=${userId ?? null}::int),false) AS joined FROM wp_rooms r
    LEFT JOIN wp_room_members m ON m.room_id=r.id
    LEFT JOIN wp_users h ON h.id=((${JSON.stringify(namedHosts())}::jsonb)->>r.slug)::int AND h.age_band='adult' AND h.safety_status='visible'
      AND (h.banned_until IS NULL OR h.banned_until<=now())
      AND NOT EXISTS (SELECT 1 FROM wp_blocks b WHERE
        (b.blocked_id=h.id AND b.blocker_id=${userId ?? null}) OR (b.blocker_id=h.id AND b.blocked_id=${userId ?? null}))
      AND NOT EXISTS (SELECT 1 FROM wp_mutes m WHERE m.muted_id=h.id AND m.muter_id=${userId ?? null})
    WHERE r.safety_status='visible' AND (${slug}::text IS NULL OR r.slug=${slug})
      AND (NOT ${featuredOnly} OR r.slug=ANY(${featuredSlugs}::text[]))
    GROUP BY r.id,h.id ORDER BY r.kind DESC,r.name LIMIT ${limit}`;
  return rows.map(roomFromRow);
}

export function listRooms(userId?: number, limit = 500) {
  return readRooms(userId, limit, null);
}

export async function listFeaturedRooms(userId?: number) {
  return featuredRooms(await readRooms(userId, featuredSlugs.length, null, true));
}

export async function getRoom(slug: string, userId?: number) {
  const rows = await readRooms(userId, 1, slug);
  return rows[0] ?? null;
}

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
