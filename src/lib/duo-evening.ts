import { DUO_STUDY_VERSION } from "./duo-study-version";
import { TERMS_VERSION } from "./account-policy";
import { getSql, q } from "./db";
import { duoEnabled, readDuoBoard } from "./duo";
import { privateDuoReadiness } from "./duo-readiness";
import { loadDuoFit } from "./duo-fit-store";
import { excludedDuoPilotEmails } from "./duo-pilot";

export type EveningRole = "Bottom" | "Support";

// Saturday 02:00 UTC is Friday evening across the mainland North American time zones.
export function proposedEvening(now = new Date()): string {
  const slot = new Date(now);
  slot.setUTCHours(2, 0, 0, 0);
  slot.setUTCDate(slot.getUTCDate() + (6 - slot.getUTCDay() + 7) % 7);
  if (slot <= now) slot.setUTCDate(slot.getUTCDate() + 7);
  return slot.toISOString();
}

export async function eveningChoice(userId: number, start: string): Promise<EveningRole | null> {
  const [row] = await q`SELECT role FROM wp_evening_interest
    WHERE user_id=${userId} AND session_start=${start} AND session_start>now()`;
  return row ? row.role as EveningRole : null;
}

export async function saveEveningChoice(userId: number, role: unknown, start: unknown) {
  if ((role !== "Bottom" && role !== "Support") || start !== proposedEvening()) return false;
  const rows = await q`INSERT INTO wp_evening_interest(user_id,role,session_start)
    SELECT u.id,${role},${start}::timestamptz FROM wp_users u WHERE u.id=${userId}
    AND u.age_band='adult' AND u.safety_status='visible' AND u.terms_version=${TERMS_VERSION}
    AND u.terms_accepted_at IS NOT NULL AND (u.banned_until IS NULL OR u.banned_until<=now()) AND ${start}::timestamptz>now()
    ON CONFLICT(user_id) DO UPDATE SET role=excluded.role,session_start=excluded.session_start RETURNING user_id`;
  return rows.length === 1;
}

export async function clearEveningChoice(userId: number) {
  await q`DELETE FROM wp_evening_interest WHERE user_id=${userId}`;
}

export async function arrivalConsent(userId: number, firstVisitOnly = false): Promise<boolean> {
  const rows = await q`SELECT 1 FROM wp_duo_arrival_consent c JOIN wp_duo_pilot_members m USING(user_id)
    WHERE c.user_id=${userId} AND c.study_start=m.joined_at AND m.study_version=${DUO_STUDY_VERSION} AND m.joined_at>now()-interval '28 days'
    AND (NOT ${firstVisitOnly} OR NOT EXISTS(SELECT 1 FROM wp_duo_arrival_days d WHERE d.user_id=c.user_id AND d.day=(now() AT TIME ZONE 'UTC')::date))`;
  return rows.length > 0;
}

export async function setArrivalConsent(userId: number, enabled: boolean) {
  const sql = await getSql();
  if (!enabled) {
    await sql`DELETE FROM wp_duo_arrival_consent WHERE user_id=${userId}`;
    return true;
  }
  if (!duoEnabled()) return false;
  const [, rows] = await sql.transaction([
    sql`DELETE FROM wp_duo_arrival_consent c USING wp_duo_pilot_members m
       WHERE c.user_id=${userId} AND c.user_id=m.user_id AND c.study_start<>m.joined_at`,
    sql`INSERT INTO wp_duo_arrival_consent(user_id,study_start) SELECT user_id,joined_at FROM wp_duo_pilot_members
       WHERE user_id=${userId} AND study_version=${DUO_STUDY_VERSION} AND joined_at>now()-interval '28 days'
       ON CONFLICT(user_id) DO UPDATE SET study_start=excluded.study_start RETURNING user_id`
  ]);
  return rows.length === 1;
}

export async function recordFitBoardDay(userId: number) {
  if (!duoEnabled()) return;
  const [member] = await q`SELECT c.study_start::text AS study_start,c.consented_at::text AS consented_at FROM wp_duo_arrival_consent c JOIN wp_duo_pilot_members m USING(user_id)
    WHERE c.user_id=${userId} AND c.study_start=m.joined_at AND m.study_version=${DUO_STUDY_VERSION} AND m.joined_at>now()-interval '28 days'
    AND NOT EXISTS(SELECT 1 FROM wp_duo_arrival_days d WHERE d.user_id=c.user_id AND d.day=(now() AT TIME ZONE 'UTC')::date)`;
  if (!member || !await loadDuoFit(userId) || !(await privateDuoReadiness(userId)).ready) return;
  const { listings } = await readDuoBoard(userId, true);
  const available = listings.some(l => !l.own && !l.requested && !l.held);
  // A withdrawal or new enrollment while the board was loading invalidates this observation.
  await q`INSERT INTO wp_duo_arrival_days(user_id,day,available)
    SELECT c.user_id,(now() AT TIME ZONE 'UTC')::date,${available}
    FROM wp_duo_arrival_consent c JOIN wp_duo_pilot_members m USING(user_id)
    WHERE c.user_id=${userId} AND c.study_start=m.joined_at AND m.study_version=${DUO_STUDY_VERSION} AND m.joined_at=${member.study_start} AND c.consented_at=${member.consented_at}
    AND m.joined_at>now()-interval '28 days' ON CONFLICT(user_id,day) DO NOTHING`;
}

export async function eveningTotals(start: string) {
  const excluded = excludedDuoPilotEmails();
  const [counts, arrivals] = await Promise.all([
    q`SELECT count(*) FILTER(WHERE role='Bottom')::int AS bot,count(*) FILTER(WHERE role='Support')::int AS support
      FROM wp_evening_interest i JOIN wp_users u ON u.id=i.user_id WHERE session_start=${start} AND session_start>now()
      AND u.safety_status='visible' AND (u.banned_until IS NULL OR u.banned_until<=now()) AND u.age_band='adult'
      AND u.terms_version=${TERMS_VERSION} AND NOT (lower(u.email)=ANY(${excluded}::text[]))
      AND lower(u.email) !~ '(@example[.](com|net|org)$|[.](test|example|invalid)$)'
      AND NOT EXISTS (SELECT 1 FROM wp_pilot_members p WHERE p.user_id=u.id AND p.kind='host')`,
    q`SELECT count(*)::int AS days,count(*) FILTER(WHERE d.available)::int AS available
      FROM wp_duo_arrival_days d JOIN wp_duo_arrival_consent c USING(user_id) JOIN wp_duo_pilot_members m USING(user_id)
      JOIN wp_users u ON u.id=d.user_id WHERE c.study_start=m.joined_at AND m.study_version=${DUO_STUDY_VERSION} AND m.joined_at>now()-interval '28 days'
      AND d.day >= (now() AT TIME ZONE 'UTC')::date-6 AND NOT(lower(u.email)=ANY(${excluded}::text[]))
      AND lower(u.email) !~ '(@example[.](com|net|org)$|[.](test|example|invalid)$)'
      AND NOT EXISTS (SELECT 1 FROM wp_pilot_members p WHERE p.user_id=u.id AND p.kind='host')`
  ]);
  return {bot:Number(counts[0].bot),support:Number(counts[0].support),days:Number(arrivals[0].days),available:Number(arrivals[0].available)};
}
