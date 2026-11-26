// One replaceable selection, shared across workers. A removed link clears the identity in place.
export const spotlightSchema = [
  `CREATE TABLE IF NOT EXISTS wp_daily_spotlight (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    day date NOT NULL,
    owner_id integer, puuid text,
    FOREIGN KEY(owner_id,puuid) REFERENCES wp_links(user_id,puuid) ON DELETE SET NULL)`,
  `CREATE OR REPLACE VIEW wp_spotlight_eligible AS
    SELECT l.user_id,l.puuid FROM wp_links l JOIN wp_users u ON u.id=l.user_id
    JOIN wp_players p ON p.puuid=l.puuid
    WHERE l.verified AND u.safety_status='visible' AND (u.banned_until IS NULL OR u.banned_until <= now())
      AND NOT EXISTS (SELECT 1 FROM wp_links other WHERE other.puuid=l.puuid AND other.verified AND other.user_id<>l.user_id)
      AND jsonb_typeof(p.snapshot->'matches')='array'
      AND jsonb_path_exists(p.snapshot,'lax $.matches[0 to 19] ? (
        @.type() == "object" && @.matchId.type() == "string" && @.champion.type() == "string" && @.win.type() == "boolean"
        && @.kills.type() == "number" && @.deaths.type() == "number" && @.assists.type() == "number"
        && @.cs.type() == "number" && @.durationSec.type() == "number" && @.playedAt.type() == "number")', '{}', true)`,
  `CREATE OR REPLACE FUNCTION wp_spotlight_for_day(wanted date)
    RETURNS TABLE(owner_id integer, puuid text) LANGUAGE plpgsql ROWS 1 AS $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM wp_daily_spotlight s WHERE s.day >= wanted) THEN
        INSERT INTO wp_daily_spotlight AS slot (day,owner_id,puuid)
        SELECT wanted,e.user_id,e.puuid FROM wp_spotlight_eligible e
        ORDER BY md5(to_char(wanted,'YYYY-MM-DD') || ':' || e.puuid),e.user_id,e.puuid LIMIT 1
        ON CONFLICT (singleton) DO UPDATE SET day=excluded.day,owner_id=excluded.owner_id,puuid=excluded.puuid
        WHERE slot.day < excluded.day;
      END IF;
      RETURN QUERY SELECT s.owner_id,s.puuid FROM wp_daily_spotlight s WHERE s.day=wanted AND s.owner_id IS NOT NULL;
    END $$`,
];
