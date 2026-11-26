import { randomUUID } from "node:crypto";
import { getSql, q, queryRows } from "./db";
import { TERMS_VERSION } from "./account-policy";
import { HIDDEN_AUTHORS } from "./community-queries";
import { photoScanningEnabled, scanPhoto } from "./profile-photo-scanner";
import { hexDigest } from "./profile-photo-image";

export const validPhotoId=(id: unknown): id is string => typeof id==="string" && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/.test(id);
export const validPhotoHash=(hash: unknown): hash is string => typeof hash==="string" && /^[a-f0-9]{64}$/.test(hash);
const selected = "u.avatar_ref=jsonb_build_object('kind','upload','id',p.id::text,'hash',p.content_hash)";
type Status = "none" | "pending" | "held" | "approved" | "rejected";

export async function photoStatus(userId: number) {
  const [row]=await queryRows(`SELECT p.id,p.content_hash,p.status,s.id AS selected_id,s.content_hash AS selected_hash
    FROM wp_users u LEFT JOIN LATERAL(
      SELECT p.id,p.content_hash,p.status FROM wp_profile_photos p WHERE p.user_id=u.id AND p.active
        AND (p.expires_at>now() OR ${selected}) ORDER BY p.created_at DESC,p.id DESC LIMIT 1
    ) p ON true LEFT JOIN LATERAL(
      SELECT p.id,p.content_hash FROM wp_profile_photos p WHERE p.user_id=u.id AND p.active
        AND p.status='approved' AND p.automated_clear AND ${selected}
    ) s ON true WHERE u.id=$1`,[userId]);
  return {ok:true,enabled:photoScanningEnabled(),status:(row?.status??"none") as Status,
    photoId:row?.id as string??null,photoHash:row?.status==="approved"?String(row.content_hash):null,
    approvedPhotoId:row?.selected_id as string??null,approvedPhotoHash:row?.selected_hash as string??null};
}

export async function stagePhoto(userId: number, original: Buffer, image: Buffer) {
  if (!photoScanningEnabled()) return null;
  const sql=await getSql(), id=randomUUID(), originalHash=hexDigest(original), contentHash=hexDigest(image);
  const [,rows]=await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('profile-edits'),${userId})`,
    sql`INSERT INTO wp_profile_photos(id,user_id,uploader_id,original,image,original_hash,content_hash,needs_human,retry_at)
      SELECT ${id}::uuid,id,id,decode(${original.toString("base64")},'base64'),decode(${image.toString("base64")},'base64'),
        ${originalHash},${contentHash},created_at>now()-interval '24 hours' OR strike_count>0,now()+interval '10 minutes'
      FROM wp_users WHERE id=${userId} AND safety_status='visible' AND (banned_until IS NULL OR banned_until<=now())
      AND age_band IN ('adult','teen') AND terms_version=${TERMS_VERSION} AND terms_accepted_at IS NOT NULL RETURNING id`,
    sql(`UPDATE wp_profile_photos p SET active=false FROM wp_users u WHERE u.id=$1 AND p.user_id=u.id AND p.active
      AND p.id<>$2::uuid AND EXISTS(SELECT 1 FROM wp_profile_photos current WHERE current.id=$2::uuid)
      AND NOT coalesce(${selected},false)`,[userId,id]),
  ]);
  if (!rows.length) return null;
  await finishPhoto(id, await scanPhoto({id,image,original,originalHash,contentHash}));
  const outcome=await photoStatus(userId);
  return outcome.photoId===id ? outcome : {ok:false as const,error:"Another photo replaced this upload. Review your latest selection."};
}

type Answer = Awaited<ReturnType<typeof scanPhoto>>;
async function finishPhoto(id: string, answer: Answer) {
  const sql=await getSql();
  if (answer==="restricted") {
    await sql.transaction([
      sql`SELECT pg_advisory_xact_lock(hashtext('wp-review:user:'||uploader_id::text))
        FROM wp_profile_photos WHERE id=${id}::uuid FOR UPDATE`,
      sql`INSERT INTO wp_profile_photo_evidence(id,uploader_id,original,image,original_hash,content_hash,source,receipt)
        SELECT p.id,p.uploader_id,p.original,p.image,p.original_hash,p.content_hash,'scanner',coalesce(u.receipt,${randomUUID()}::uuid)
        FROM wp_profile_photos p LEFT JOIN wp_safety_urgent u ON u.target_kind='user' AND u.target_id=p.uploader_id AND u.reviewed_at IS NULL
        WHERE p.id=${id}::uuid AND p.original IS NOT NULL ON CONFLICT(id) DO NOTHING`,
      sql`INSERT INTO wp_safety_urgent(receipt,target_kind,target_id,rule,evidence)
        SELECT e.receipt,'user',e.uploader_id,'child_safety','Private profile-photo scanner receipt '||e.id::text
        FROM wp_profile_photo_evidence e WHERE e.id=${id}::uuid AND NOT EXISTS (
          SELECT 1 FROM wp_safety_urgent old WHERE old.receipt=e.receipt AND old.reviewed_at IS NOT NULL)
        ON CONFLICT(target_kind,target_id) WHERE reviewed_at IS NULL DO UPDATE SET rule='child_safety'`,
      sql`UPDATE wp_profile_photos p SET status='rejected',original=NULL,image=NULL,checked_at=now()
        WHERE p.id=${id}::uuid AND EXISTS(SELECT 1 FROM wp_profile_photo_evidence e WHERE e.id=p.id)`,
    ]);
    return;
  }
  await sql`UPDATE wp_profile_photos SET checked_at=now(),retry_at=now()+interval '10 minutes',
      automated_clear=${answer==="approved"},status=CASE WHEN ${answer==="approved"} AND needs_human THEN 'held' ELSE ${answer} END,
      original=CASE WHEN ${answer==="rejected"} THEN NULL ELSE original END,image=CASE WHEN ${answer==="rejected"} THEN NULL ELSE image END
    WHERE id=${id}::uuid AND NOT automated_clear AND status IN ('pending','held')`;
}

export async function removePhotos(userId: number) {
  const sql=await getSql();
  await sql.transaction([
    sql`SELECT pg_advisory_xact_lock(hashtext('profile-edits'),${userId})`,
    sql`UPDATE wp_users SET avatar_ref=NULL,profile_version=profile_version+1 WHERE id=${userId} AND avatar_ref->>'kind'='upload'`,
    sql`UPDATE wp_profile_photos SET active=false WHERE user_id=${userId} AND active`,
    // Pending originals remain private until the submitted scan can identify protected evidence.
    sql`DELETE FROM wp_profile_photos WHERE user_id=${userId} AND NOT active AND (automated_clear OR status='rejected')`,
  ]);
}

export async function readPhoto(viewer: number | null, id: string, hash: string, preview=false) {
  if (!photoScanningEnabled() || !validPhotoId(id) || !validPhotoHash(hash)) return null;
  const [row]=await queryRows(`WITH ${HIDDEN_AUTHORS} SELECT encode(p.image,'base64') AS data
    FROM wp_profile_photos p JOIN wp_users u ON p.user_id=u.id WHERE p.id=$2::uuid AND p.content_hash=$3
    AND u.id NOT IN (SELECT id FROM hidden) AND p.active AND p.status='approved' AND p.automated_clear
    AND CASE WHEN $4 THEN u.id=$1 AND (p.expires_at>now() OR ${selected}) ELSE ${selected} END`,[viewer,id,hash,preview]);
  return typeof row?.data==="string"?Buffer.from(row.data,"base64"):null;
}

export async function maintainPhotos() {
  if (photoScanningEnabled()) {
    const jobs=await q`WITH claimed AS (
      SELECT id FROM wp_profile_photos WHERE status IN ('pending','held') AND NOT automated_clear
        AND original IS NOT NULL AND retry_at<=now() AND expires_at>now() ORDER BY retry_at,id LIMIT 5 FOR UPDATE SKIP LOCKED
    ) UPDATE wp_profile_photos p SET retry_at=now()+interval '10 minutes' FROM claimed c WHERE p.id=c.id
      RETURNING p.id,encode(p.original,'base64') AS original,encode(p.image,'base64') AS image,p.original_hash,p.content_hash`;
    await Promise.all(jobs.map(async r=>{
      const id=String(r.id);
      await finishPhoto(id,await scanPhoto({id,original:Buffer.from(String(r.original),"base64"),image:Buffer.from(String(r.image),"base64"),
        originalHash:String(r.original_hash),contentHash:String(r.content_hash)}));
    }));
  }
  await queryRows(`DELETE FROM wp_profile_photos p WHERE p.id IN (SELECT p.id FROM wp_profile_photos p
    LEFT JOIN wp_users u ON u.id=p.user_id WHERE (p.expires_at<=now() OR NOT p.active AND (p.automated_clear OR p.status='rejected'))
    AND NOT coalesce(${selected},false) ORDER BY p.expires_at LIMIT 250 FOR UPDATE OF p SKIP LOCKED)`,[]);
}
