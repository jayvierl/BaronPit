import { authError, requireUser, readObject } from "@/lib/auth-http";
import { publicAvatar, parseAvatar } from "@/lib/avatar";
import { TERMS_VERSION } from "@/lib/account-policy";
import { getSql } from "@/lib/db";
import { scoreContent } from "@/lib/moderation";
import { screenText } from "@/lib/managed-text-screen";
import { parseProfileLink, readProfileLink } from "@/lib/profile-featured-link";

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const { user } = access;
  const data = await readObject(req);
  if (!["displayName", "bio", "avatar", "profileLink"].some(field => Object.hasOwn(data,field)))
    return authError("Choose a profile change to save.",400);
  const revision = user.profileVersion ?? 0;
  if (data.profileVersion !== undefined && data.profileVersion !== revision)
    return authError("Your profile changed. Refresh the editor to see the latest version.",409);

  const name = data.displayName === undefined ? user.displayName : typeof data.displayName === "string" ? data.displayName.trim() : "";
  const bio = data.bio === undefined ? user.bio : typeof data.bio === "string" ? data.bio.trim() : null;
  if (name.length < 2 || name.length > 40) return authError("Display names must be 2–40 characters.",400);
  if (bio === null || bio.length > 280) return authError("Your bio can contain up to 280 characters.",400);

  const hasAvatar = Object.hasOwn(data,"avatar");
  const avatar = hasAvatar ? parseAvatar(data.avatar) : null;
  if (hasAvatar && !avatar) return authError("Choose a picture from the profile editor.",400);
  const oldLink = user.profileLink ?? null;
  const link = Object.hasOwn(data,"profileLink") ? parseProfileLink(data.profileLink, req.headers.get("origin") ?? new URL(req.url).origin) : oldLink;
  if (link === undefined) return authError("Choose a post or room from this site.",400);

  try {
    if (link && link !== oldLink && !await readProfileLink(link,user.id))
      return authError("That post or room is unavailable.",400);
    // Unchanged stored text has already been admitted; outages must not prevent a picture change.
    if (name !== user.displayName || bio !== user.bio) {
      const fields = [name,bio];
      const [nameScore,bioScore] = fields.map(text => scoreContent(text));
      const mod = await screenText(nameScore.score >= bioScore.score ? nameScore : bioScore, fields, user.id, "profile");
      if (mod.hits.includes("screening-unavailable"))
        return authError("Profile screening is temporarily unavailable. Try saving again later.",503);
      if (mod.action !== "publish") return authError("Choose another name or bio to meet the community guidelines.",400);
    }

    const sql = await getSql();
    const serialized = avatar && avatar.kind !== "initials" ? JSON.stringify(avatar) : null;
    const photoId = avatar?.kind === "upload" ? avatar.id : null;
    const photoHash = avatar?.kind === "upload" ? avatar.hash : null;
    const icon = avatar?.kind === "riot-icon" ? avatar.id : null;
    // The photo lifecycle uses this same account lock. Recheck eligibility and the
    // exact content version inside the write; a pending or foreign file cannot be published.
    const [, rows] = await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtext('profile-edits'),${user.id})`,
      sql`UPDATE wp_users u SET display_name=${name}, bio=${bio}, profile_link=${link},
          avatar_ref=CASE WHEN ${hasAvatar} THEN ${serialized}::jsonb ELSE u.avatar_ref END,
          profile_version=profile_version+1
        WHERE u.id=${user.id} AND u.profile_version=${revision}
          AND u.display_name=${user.displayName} AND u.bio=${user.bio} AND u.profile_link IS NOT DISTINCT FROM ${oldLink}
          AND u.safety_status='visible' AND (u.banned_until IS NULL OR u.banned_until<=now())
          AND u.terms_version=${TERMS_VERSION} AND u.terms_accepted_at IS NOT NULL
          AND (${photoId}::uuid IS NULL OR EXISTS(SELECT 1 FROM wp_profile_photos f
            WHERE f.id=${photoId}::uuid AND f.user_id=u.id AND f.content_hash=${photoHash} AND f.active AND f.status='approved' AND f.automated_clear AND f.image IS NOT NULL
              AND (f.expires_at>now() OR u.avatar_ref=${serialized}::jsonb) FOR SHARE))
          AND (${icon}::int IS NULL OR EXISTS(
            SELECT 1 FROM wp_links l JOIN wp_players p ON p.puuid=l.puuid
            WHERE l.user_id=u.id AND p.profile_icon=${icon} FOR SHARE OF l,p))
        RETURNING u.display_name,u.bio,u.avatar_ref,u.profile_link,u.profile_version`,
    ]);
    if (!rows.length) return authError("Your profile or picture is unavailable or changed. Refresh the editor before saving.",409);
    const saved = rows[0];
    return Response.json({
      ok:true,displayName:saved.display_name,bio:saved.bio,avatar:publicAvatar(saved.avatar_ref),
      profileLink:saved.profile_link,profileVersion:Number(saved.profile_version),
    },{headers:{"Cache-Control":"private, no-store"}});
  } catch {
    return authError("Couldn’t save your profile. Your changes can be retried.",503);
  }
}
