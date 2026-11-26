import {afterAll,beforeAll,describe,expect,it,vi} from "vitest";
import sharp from "sharp";
import {postgres} from "../../test/postgres";
import {q} from "./db";
import {TERMS_VERSION} from "./account-policy";
import type {User} from "./auth";
import {normalizePhoto,readPhotoBody,maxOriginalBytes} from "./profile-photo-image";
import {photoStatus,stagePhoto,readPhoto,removePhotos,maintainPhotos} from "./profile-photo";
import {reviewablePhotos,readReviewPhoto,resolvePhoto} from "./profile-photo-review";
import {scanPhoto,photoScanningEnabled} from "./profile-photo-scanner";
vi.mock("@neondatabase/serverless",async()=>({neon:(await import("../../test/postgres")).neonForTests}));
vi.mock("./profile-photo-scanner",()=>({photoScanningEnabled:vi.fn(()=>true),scanPhoto:vi.fn(async()=>"approved")}));
const admin={id:6,email:"staff@example.invalid",bannedUntil:null} as User;
let original:Buffer,image:Buffer;
beforeAll(async()=>{
  vi.stubEnv("DATABASE_URL","postgres://fixture");
  vi.stubEnv("ADMIN_EMAILS",admin.email);
  await q`INSERT INTO wp_users(id,email,display_name,created_at,age_band,terms_version,terms_accepted_at)
    SELECT i,i||'@qa.invalid','Fixture',CASE WHEN i=2 THEN now() ELSE now()-interval '5 days' END,'adult',${TERMS_VERSION},now()
    FROM generate_series(1,6)i`;
  original=await sharp({create:{width:16,height:12,channels:3,background:"#336633"}}).png().withMetadata({density:450}).toBuffer();
  image=(await normalizePhoto(original,"image/png"))!;
},30000);
afterAll(async()=>{await postgres.close();vi.unstubAllEnvs()});
async function stage(userId:number) {
  const out=await stagePhoto(userId,original,image);
  if (!out || "error" in out || !out.photoId) throw Error("Expected a staged photo");
  return {...out,photoId:out.photoId};
}
async function select(userId:number,id:string,hash:string) {
  await q`UPDATE wp_users SET avatar_ref=jsonb_build_object('kind','upload','id',${id}::text,'hash',${hash}::text) WHERE id=${userId}`;
}
describe("private raster photo lifecycle",()=>{
  it("bounds input bytes, decodes supported formats and emits a 256px WebP without input metadata",async()=>{
    expect(await sharp(image).metadata()).toMatchObject({width:256,height:256,format:"webp",hasProfile:false});
    expect((await sharp(image).metadata()).exif).toBeUndefined();
    expect(await normalizePhoto(original,"image/jpeg")).toBeNull();
    expect(await normalizePhoto(Buffer.from("plain text"),"image/png")).toBeNull();
    const wide=await sharp({create:{width:2049,height:1,channels:3,background:"red"}}).png().toBuffer();
    expect(await normalizePhoto(wide,"image/png")).toBeNull();
    expect(await readPhotoBody(new Request("http://test",{method:"POST",body:new Uint8Array(maxOriginalBytes+1)}))).toBeNull();
  });
  it("keeps a cleared stage private until selected, respects blocks, revokes old URLs and survives removal",async()=>{
    const first=await stage(1), hash=first.photoHash!;
    expect(first.status).toBe("approved");expect(first.approvedPhotoId).toBeNull();
    expect(await readPhoto(null,first.photoId,hash)).toBeNull();
    expect(await readPhoto(4,first.photoId,hash,true)).toBeNull();
    expect(await readPhoto(1,first.photoId,hash,true)).toEqual(image);
    await select(1,first.photoId,hash);
    expect(await readPhoto(null,first.photoId,hash)).toEqual(image);
    expect(await readPhoto(null,first.photoId,"0".repeat(64))).toBeNull();
    await q`INSERT INTO wp_blocks(blocker_id,blocked_id) VALUES(1,4)`;
    expect(await readPhoto(4,first.photoId,hash)).toBeNull();
    await q`UPDATE wp_users SET safety_status='held' WHERE id=1`;
    expect(await readPhoto(null,first.photoId,hash)).toBeNull();
    await q`UPDATE wp_users SET safety_status='visible' WHERE id=1`;
    const next=await stage(1);
    expect(next.approvedPhotoId).toBe(first.photoId);
    await select(1,next.photoId,next.photoHash!);
    expect(await readPhoto(null,first.photoId,hash)).toBeNull();
    await removePhotos(1);
    expect(await readPhoto(null,next.photoId,next.photoHash!)).toBeNull();
    expect((await photoStatus(1)).status).toBe("none");
  });
  it("requires a second human on a new account and withholds scanner-held or restricted items from staff",async()=>{
    const newAccount=await stage(2);
    expect(newAccount.status).toBe("held");
    expect(newAccount.photoHash).toBeNull();
    const item=(await reviewablePhotos(admin)).items.find(row=>row.id===newAccount.photoId)!;
    expect(item).toBeTruthy();
    expect(await readReviewPhoto(admin,item.id,item.contentHash)).toEqual(image);
    expect(await readReviewPhoto({...admin,id:2},item.id,item.contentHash)).toBeNull();
    expect(await resolvePhoto(admin,item.id,"0".repeat(64),true)).toBe(false);
    expect(await resolvePhoto(admin,item.id,item.contentHash,true)).toBe(true);
    expect(await resolvePhoto(admin,item.id,item.contentHash,true)).toBe(false);
    expect(await photoStatus(2)).toMatchObject({status:"approved",approvedPhotoId:null});
    vi.mocked(scanPhoto).mockResolvedValueOnce("held");
    const flagged=await stage(3);
    expect(flagged.status).toBe("held");
    expect((await reviewablePhotos(admin)).items).toEqual([]);
    vi.mocked(scanPhoto).mockResolvedValueOnce("restricted");
    const restricted=await stage(3);expect(restricted.status).toBe("rejected");
    await removePhotos(3);
    expect((await q`SELECT uploader_id,source FROM wp_profile_photo_evidence WHERE id=${restricted.photoId}::uuid`)).toEqual([{uploader_id:3,source:"scanner"}]);
    expect((await q`SELECT rule FROM wp_safety_urgent WHERE target_kind='user' AND target_id=3`)).toEqual([{rule:"child_safety"}]);
  });
  it("backs up a selected image on a subsequent child-safety report, and expiry spares protected evidence",async()=>{
    const current=await stage(4);await select(4,current.photoId,current.photoHash!);
    await q`INSERT INTO wp_safety_urgent(receipt,target_kind,target_id,rule,evidence) VALUES
      ('12345678-1234-4123-8123-123456789abc','user',4,'child_safety','Synthetic report')`;
    expect(await readPhoto(null,current.photoId,current.photoHash!)).toBeNull();
    await removePhotos(4);
    expect(await q`SELECT source,legal_hold FROM wp_profile_photo_evidence WHERE id=${current.photoId}::uuid`).toEqual([{source:"profile_report",legal_hold:true}]);
    const staged=await stage(5);
    await q`UPDATE wp_profile_photos SET expires_at=now()-interval '1 minute' WHERE id=${staged.photoId}::uuid`;
    expect(await readPhoto(5,staged.photoId,staged.photoHash!,true)).toBeNull();
    await maintainPhotos();
    expect(await q`SELECT id FROM wp_profile_photos WHERE id=${staged.photoId}::uuid`).toEqual([]);
    expect(await q`SELECT count(*)::int AS count FROM wp_profile_photo_evidence`).toEqual([{count:2}]);
  });
  it("recovers pending attempts via the authorized maintenance runner and checks readiness before accepting bytes",async()=>{
    vi.mocked(scanPhoto).mockResolvedValueOnce("pending");
    const paused=await stage(5);
    expect(paused.status).toBe("pending");
    await q`UPDATE wp_profile_photos SET retry_at=now()-interval '1 minute' WHERE id=${paused.photoId}::uuid`;
    await maintainPhotos();
    expect((await photoStatus(5)).status).toBe("approved");
    vi.mocked(photoScanningEnabled).mockReturnValueOnce(false);
    expect(await stagePhoto(5,original,image)).toBeNull();
  });
  it("does not give the newer tab’s photo to an earlier upload when scan responses arrive in reverse order",async()=>{
    let started!:()=>void, finish!:()=>void;
    const scanning=new Promise<void>(resolve=>{started=resolve});
    const wait=new Promise<void>(resolve=>{finish=resolve});
    vi.mocked(scanPhoto).mockImplementationOnce(async()=>{started();await wait;return "approved"});
    const older=stagePhoto(5,original,image);
    await scanning;
    try {
      const newer=await stage(5);
      expect(newer.status).toBe("approved");
      finish();
      expect(await older).toMatchObject({ok:false});
      expect(await older).not.toHaveProperty("photoId");
      expect((await photoStatus(5)).photoId).toBe(newer.photoId);
    } finally { finish(); }
  });
});
