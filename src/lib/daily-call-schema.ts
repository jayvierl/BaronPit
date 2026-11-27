export const DAILY_CALL_LAUNCH_KEY = "daily_call_launch_v2";

export const dailyCallSchema = [
  `CREATE TABLE IF NOT EXISTS wp_daily_calls (
    day date PRIMARY KEY,
    post_id integer UNIQUE REFERENCES wp_posts(id) ON DELETE SET NULL,
    payoff_post_id integer UNIQUE REFERENCES wp_posts(id) ON DELETE SET NULL,
    payoff_published_at timestamptz,
    title text NOT NULL,
    opens_at timestamptz NOT NULL,
    closes_at timestamptz NOT NULL CHECK (closes_at > opens_at),
    tally integer[] CHECK (tally IS NULL OR cardinality(tally) = 4)
  )`,
  `CREATE OR REPLACE FUNCTION wp_guard_daily_call_vote() RETURNS trigger LANGUAGE plpgsql AS $guard$
    DECLARE ballot wp_daily_calls%ROWTYPE;
    BEGIN
      SELECT * INTO ballot FROM wp_daily_calls WHERE post_id = NEW.post_id FOR SHARE;
      IF FOUND AND (ballot.tally IS NOT NULL OR clock_timestamp() < ballot.opens_at OR clock_timestamp() >= ballot.closes_at) THEN
        RETURN NULL;
      END IF;
      RETURN NEW;
    END;
  $guard$`,
  `CREATE OR REPLACE TRIGGER wp_daily_call_vote_cutoff BEFORE INSERT OR UPDATE ON wp_poll_votes
    FOR EACH ROW EXECUTE FUNCTION wp_guard_daily_call_vote()`,
];
