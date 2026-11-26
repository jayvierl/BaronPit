/** Cohort membership and consented daily flags. No viewed object IDs, URLs, match IDs, or device identifiers. */
export const pilotSchema = [
  `CREATE TABLE IF NOT EXISTS wp_duo_pilot_members (
    user_id integer PRIMARY KEY REFERENCES wp_users(id) ON DELETE CASCADE,
    joined_at timestamptz NOT NULL DEFAULT now())`,
  "CREATE INDEX IF NOT EXISTS wp_duo_requests_recent ON wp_duo_requests(created_at DESC)",

  `CREATE TABLE IF NOT EXISTS wp_pilot_members (
    user_id integer PRIMARY KEY REFERENCES wp_users(id) ON DELETE CASCADE,
    kind text NOT NULL CHECK (kind IN ('host','participant')),
    channel text NOT NULL CHECK (channel IN ('club','community')),
    role text CHECK (role IN ('BOTTOM','UTILITY')),
    joined_at timestamptz NOT NULL DEFAULT now(),
    CHECK (kind='host' OR role IS NOT NULL))`,
  `CREATE TABLE IF NOT EXISTS wp_pilot_days (
    user_id integer NOT NULL REFERENCES wp_pilot_members(user_id) ON DELETE CASCADE,
    day_no smallint NOT NULL CHECK (day_no BETWEEN 0 AND 27),
    social boolean NOT NULL DEFAULT false, stats boolean NOT NULL DEFAULT false, answer boolean NOT NULL DEFAULT false,
    PRIMARY KEY(user_id,day_no))`,
  `CREATE TABLE IF NOT EXISTS wp_pilot_interest (
    user_id integer PRIMARY KEY REFERENCES wp_users(id) ON DELETE CASCADE,
    audience text NOT NULL CHECK(audience IN ('coach','club')),
    intent text NOT NULL CHECK(intent IN ('discuss','trial')),
    budget text NOT NULL CHECK(budget IN ('unknown','free','1-10','11-25','26+')),
    updated_at timestamptz NOT NULL DEFAULT now())`,
  `CREATE TABLE IF NOT EXISTS wp_pilot_reviews (
    week_start date PRIMARY KEY, host_minutes integer NOT NULL CHECK(host_minutes BETWEEN 0 AND 10080),
    safety_minutes integer NOT NULL CHECK(safety_minutes BETWEEN 0 AND 10080),
    cost_cents integer NOT NULL CHECK(cost_cents BETWEEN 0 AND 10000000),
    interviews integer NOT NULL CHECK(interviews BETWEEN 0 AND 1000),
    sampled integer NOT NULL CHECK(sampled BETWEEN 0 AND 10000),
    useful integer NOT NULL CHECK(useful BETWEEN 0 AND sampled),
    drill text NOT NULL CHECK(drill IN ('unrun','pass','fail')))`,
];
