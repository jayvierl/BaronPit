import type { NeonQueryFunction } from "@neondatabase/serverless";
// The conditional UPSERT serializes two ordinary posts, two replies or a post and a reply
// for one player in one room. It runs inside the insert transaction so failed writes refund their turn.
export function roomSafetySchema(sql: NeonQueryFunction<false, false>) {
  return [
    sql`ALTER TABLE wp_rooms ADD COLUMN IF NOT EXISTS raid_until timestamptz`,
    sql`CREATE TABLE IF NOT EXISTS wp_room_turns(room_id integer NOT NULL REFERENCES wp_rooms(id) ON DELETE CASCADE,
      user_id integer NOT NULL REFERENCES wp_users(id) ON DELETE CASCADE,available_at timestamptz NOT NULL, PRIMARY KEY(room_id,user_id))`,
    sql`CREATE INDEX IF NOT EXISTS wp_room_turns_expiry ON wp_room_turns(available_at)`,
    sql`CREATE OR REPLACE FUNCTION wp_reserve_room_turn(room integer, participant integer, contains_link boolean)
    RETURNS boolean LANGUAGE plpgsql VOLATILE AS $body$
      DECLARE deadline timestamptz;
      BEGIN
        IF room IS NULL THEN RETURN true; END IF;
        SELECT raid_until INTO deadline FROM wp_rooms WHERE id=room AND safety_status='visible' FOR SHARE;
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PWR03',MESSAGE='Room unavailable'; END IF;
        IF deadline IS NULL OR deadline<=clock_timestamp() THEN RETURN true; END IF;
        IF contains_link THEN RAISE EXCEPTION USING ERRCODE='PWR01',MESSAGE='Room links paused'; END IF;
        INSERT INTO wp_room_turns(room_id,user_id,available_at)
        VALUES(room,participant,clock_timestamp()+interval '15 seconds')
        ON CONFLICT(room_id,user_id) DO UPDATE SET available_at=EXCLUDED.available_at
        WHERE wp_room_turns.available_at<=clock_timestamp();
        IF NOT FOUND THEN RAISE EXCEPTION USING ERRCODE='PWR02',MESSAGE='Room slowmode active'; END IF;
        RETURN true;
      END
    $body$`,
  ];
}
