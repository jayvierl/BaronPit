import { TERMS_VERSION } from "./account-policy";
import { queryRows } from "./db";
import { duoEligibilityCte } from "./duo";
import { riotSignOnConfig } from "./riot-ownership";
import { signInHref } from "./signin-return";

type NextStep = { regionOutsidePilot?: true; title: string; detail: string; href?: string; action?: string; availableAt?: string };
export type DuoReadiness = { ready: true; riotId: string } | ({ ready: false } & NextStep);

/** The caller supplies only the current session's user ID. The eligibility CTE is also used by every matching action. */
export async function privateDuoReadiness(userId: number): Promise<DuoReadiness> {
  const [row] = await queryRows(
    duoEligibilityCte +
      `
    SELECT (SELECT platform FROM me) AS eligible_platform, (SELECT game_name||'#'||tag_line FROM me) AS own_riot_id,
      u.safety_status <> 'visible' OR coalesce(u.banned_until > now(),false) AS restricted,
      u.age_band IN ('teen','adult') AND u.terms_version=$2 AND u.terms_accepted_at IS NOT NULL AS consent,
      CASE WHEN u.created_at>now()-interval '24 hours' THEN u.created_at+interval '24 hours' END AS opens_at,
      profile.*
    FROM wp_users u LEFT JOIN LATERAL (
      SELECT k.verified, EXISTS(SELECT 1 FROM wp_links other
        WHERE other.puuid=k.puuid AND other.verified AND other.user_id<>u.id) AS contested,
        p.platform,p.game_name,p.tag_line,p.rank_tier IS NOT NULL AS ranked,
        p.fetched_at>now()-interval '24 hours' AS fresh
      FROM wp_links k JOIN wp_players p ON p.puuid=k.puuid WHERE k.user_id=u.id
      ORDER BY k.verified DESC, contested, ranked DESC, fresh DESC, k.is_primary DESC, k.puuid LIMIT 1
    ) profile ON TRUE WHERE u.id=$1`,
    [userId, TERMS_VERSION],
  );
  if (!row) throw new Error("Account unavailable");
  if (row.eligible_platform === "na1") return { ready: true, riotId:String(row.own_riot_id) };
  if (row.eligible_platform) return {
    ready: false, regionOutsidePilot: true, title: "The first sessions are on North America",
    detail: "Your verified account plays on another server. You can save a private plan or choose a verified NA account.",
    href: "/me", action: "Manage Riot accounts",
  };
  if (row.restricted)
    return {
      ready: false,
      title: "Matching is restricted on this account",
      detail: "Check your safety inbox for notices and review options.",
      href: "/me/safety",
      action: "Open my safety inbox",
    };
  if (!row.consent)
    return {
      ready: false,
      title: "Confirm your eligibility",
      detail: "Choose your private age group and accept the current community terms.",
      href: signInHref("/lfg", "enrol"),
      action: "Confirm and return",
    };
  if (row.opens_at)
    return {
      ready: false,
      title: "Your account is in its first 24 hours",
      detail:
        "You can save your preferences now. Check your matching eligibility again after the waiting period.",
      availableAt: new Date(String(row.opens_at)).toISOString(),
    };
  if (row.verified == null)
    return {
      ready: false,
      title: "Add your Riot ID",
      detail:
        "Add the player you use for ranked games. Linking lets you view recent form and start ownership verification when available.",
      href: "/me",
      action: "Add my Riot ID",
    };
  if (!row.verified)
    return riotSignOnConfig()
      ? {
          ready: false,
          title: "Verify your linked Riot account",
          detail: "Use Riot Sign On beside your linked player to confirm ownership.",
          href: "/me",
          action: "Verify my Riot account",
        }
      : {
          ready: false,
          title: "Riot verification is awaiting activation",
          detail: "Your player is linked. Your private plan will be here when ownership verification opens.",
        };
  if (row.contested)
    return {
      ready: false,
      title: "Your verified link needs review",
      detail: "Contact the safety team to review your account link before you use matching.",
      href: "/safety",
      action: "Contact safety",
    };
  const href =
    "/player?" +
    new URLSearchParams({
      platform: String(row.platform),
      riotId: String(row.game_name) + "#" + String(row.tag_line),
    });
  if (!row.fresh)
    return {
      ready: false,
      title: "Refresh your ranked profile",
      detail:
        "Matching uses a ranked snapshot fetched in the last 24 hours. Open your player stats to refresh it.",
      href,
      action: "Open my player stats",
    };
  if (!row.ranked)
    return {
      ready: false,
      title: "A current ranked placement is needed",
      detail:
        "Riot hasn’t returned a Solo/Duo rank for your linked player. Check your stats after completing placements.",
      href,
      action: "View my ranked profile",
    };
  return {
    ready: false,
    title: "A recent game is needed",
    detail: "Riot hasn’t returned a recent match for this ranked player. Check your stats after a game.",
    href,
    action: "View my recent form",
  };
}
