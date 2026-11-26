import { APP_NAME } from "./brand";
import { getSql } from "./db";
import { briefingText, PATCH_NOTES_INDEX, PATCH_PUBLISHER, publicPatch, resolveNotesUrl } from "./patch-notes";
import { confirmedPatch } from "./riot";
import { ensureRooms } from "./rooms";

/** One discussion per public patch. Every room keeps its original threads and replies. */
export async function runPatchWatch(): Promise<{ patch: string; changed: boolean; briefings: number }> {
  const patch = await confirmedPatch();
  if (!patch || !publicPatch(patch)) throw new Error("Current patch unavailable");
  const [, notes, sql] = await Promise.all([ensureRooms(), resolveNotesUrl(patch), getSql()]);
  const release = patch.split(".").slice(0, 2).join(".");
  const [, , result] = await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('wp_patch_watch'))`,
    sql`INSERT INTO wp_users(email,display_name,avatar_hue) VALUES (${PATCH_PUBLISHER},${APP_NAME},265)
      ON CONFLICT(email) DO UPDATE SET display_name=excluded.display_name,avatar_hue=excluded.avatar_hue
      WHERE wp_users.safety_status='visible'
        AND (wp_users.display_name,wp_users.avatar_hue) IS DISTINCT FROM (excluded.display_name,excluded.avatar_hue)`,
    sql`WITH prior AS MATERIALIZED (SELECT value FROM wp_meta WHERE key='last_patch'),
      advanced AS (
        INSERT INTO wp_meta(key,value) VALUES ('last_patch',${patch})
        ON CONFLICT(key) DO UPDATE SET value=excluded.value WHERE
          CASE WHEN wp_meta.value ~ '^[0-9]{1,3}([.][0-9]{1,3}){1,2}$'
            THEN string_to_array(wp_meta.value,'.')::int[] < string_to_array(excluded.value,'.')::int[] ELSE true END
        RETURNING value
      ), publisher AS (SELECT id FROM wp_users WHERE email=${PATCH_PUBLISHER}),
      canonical AS (SELECT id FROM wp_rooms WHERE slug='patch-meta' AND safety_status='visible'),
      old_notes AS MATERIALIZED (
        SELECT p.id FROM wp_posts p JOIN publisher u ON u.id=p.author_id WHERE p.kind='text' AND
          p.data @> '{"briefing":true}' AND split_part(p.data->>'patch','.',1)||'.'||split_part(p.data->>'patch','.',2)=${release}
      ), repaired AS (
        UPDATE wp_posts p SET data=jsonb_set(p.data,'{notesUrl}',to_jsonb(${notes}::text)),
          body=regexp_replace(p.body,'https://www[.]leagueoflegends[.]com/en-us/news/game-updates/(league-of-legends-)?patch-[0-9]+-[0-9]+-notes/?',${notes},'g')
        FROM old_notes o WHERE o.id=p.id AND p.data->>'notesUrl' IS DISTINCT FROM ${notes}
          AND (${notes}<>${PATCH_NOTES_INDEX} OR p.data->>'notesUrl' IS NULL)
      ), inserted AS (
        INSERT INTO wp_posts(author_id,kind,body,room_id,data,status)
        SELECT u.id,'text',${briefingText(patch)},r.id,jsonb_build_object('briefing',true,'patch',${patch}::text,'notesUrl',${notes}::text),'visible'
          FROM publisher u CROSS JOIN canonical r
          WHERE (EXISTS(SELECT 1 FROM advanced) OR EXISTS(SELECT 1 FROM prior WHERE value=${patch}))
          AND NOT EXISTS(SELECT 1 FROM wp_posts p JOIN old_notes o ON o.id=p.id WHERE p.room_id=r.id)
        RETURNING id
      )
      SELECT EXISTS(SELECT 1 FROM advanced) AND EXISTS(SELECT 1 FROM prior) AS changed,
        (SELECT count(*)::int FROM inserted) AS briefings`,
  ]);
  return { patch, changed: result[0].changed === true, briefings: Number(result[0].briefings) };
}
