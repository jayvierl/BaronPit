import { isAdmin,isBanned,type User } from "./auth";
import { getSql,queryRows } from "./db";
import { validPhotoHash,validPhotoId } from "./profile-photo";
import { photoScanningEnabled } from "./profile-photo-scanner";

// Only normalized bytes that already passed all machine checks qualify for human review.
const reviewable = `p.status='held' AND p.active AND p.automated_clear AND p.needs_human AND p.expires_at>now()
  AND p.user_id<>$1 AND u.safety_status='visible' AND (u.banned_until IS NULL OR u.banned_until<=now())
  AND NOT EXISTS(SELECT 1 FROM wp_safety_urgent c WHERE c.target_kind='user' AND c.target_id=u.id AND c.reviewed_at IS NULL)
  AND NOT EXISTS(SELECT 1 FROM wp_reports r WHERE r.target_kind='user' AND r.target_id=u.id AND r.status='open')`;
function staffAccess(staff: User) { return Boolean(staff && isAdmin(staff.email) && !isBanned(staff) && photoScanningEnabled()); }

export async function reviewablePhotos(staff:User,before?:string) {
  if (!staffAccess(staff)) return {items:[],next:null};
  const [micros,id]=typeof before==="string"?before.split("."):[];
  const valid=typeof micros==="string" && /^\d{1,18}$/.test(micros) && validPhotoId(id);
  const rows=await queryRows(`SELECT p.id,p.content_hash,p.created_at,(extract(epoch FROM p.created_at)*1000000)::bigint::text AS micros
    FROM wp_profile_photos p JOIN wp_users u ON u.id=p.user_id WHERE ${reviewable}
    AND ($2::numeric IS NULL OR (extract(epoch FROM p.created_at)*1000000,p.id)>($2::numeric,$3::uuid))
    ORDER BY p.created_at,p.id LIMIT 26`,[staff.id,valid?micros:null,valid?id:null]);
  const items=rows.slice(0,25).map(r=>({id:String(r.id),contentHash:String(r.content_hash),createdAt:new Date(String(r.created_at)).toISOString()}));
  return {items,next:rows.length===26?rows[24].micros+"."+rows[24].id:null};
}
export async function readReviewPhoto(staff:User,id:string,hash:string) {
  if (!staffAccess(staff)||!validPhotoId(id)||!validPhotoHash(hash)) return null;
  const [row]=await queryRows(`SELECT encode(p.image,'base64') AS data FROM wp_profile_photos p JOIN wp_users u ON u.id=p.user_id
    WHERE ${reviewable} AND p.id=$2::uuid AND p.content_hash=$3`,[staff.id,id,hash]);
  return typeof row?.data==="string"?Buffer.from(row.data,"base64"):null;
}
export async function resolvePhoto(staff:User,id:string,hash:string,approve:boolean) {
  if (!staffAccess(staff)||!validPhotoId(id)||!validPhotoHash(hash)||typeof approve!=="boolean") return false;
  const sql=await getSql();
  const rows=await sql(`WITH decision AS (UPDATE wp_profile_photos p SET status=$4,
    original=CASE WHEN $4='rejected' THEN NULL ELSE p.original END,image=CASE WHEN $4='rejected' THEN NULL ELSE p.image END
    FROM wp_users u WHERE u.id=p.user_id AND ${reviewable} AND p.id=$2::uuid AND p.content_hash=$3 RETURNING p.user_id)
    INSERT INTO wp_mod_log(target_kind,target_id,author_id,score,action,detail)
    SELECT 'user',user_id,$1,0,$5,'Profile photo '||$2::text FROM decision RETURNING id`,[staff.id,id,hash,approve?"approved":"rejected",approve?"photo_approve":"photo_reject"]);
  return rows.length===1;
}
