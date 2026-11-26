import { createHash } from "node:crypto";
import sharp from "sharp";

export const maxOriginalBytes = 1024 * 1024;
export const photoMimeTypes = ["image/png","image/jpeg","image/webp"];
export const hexDigest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

export async function readPhotoBody(request: Request): Promise<Buffer | null> {
  if (Number(request.headers.get("content-length")) > maxOriginalBytes || !request.body) return null;
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const {done,value} = await reader.read();
      if (done) return size > 0 ? Buffer.concat(chunks,size) : null;
      size += value.length;
      if (size > maxOriginalBytes) { await reader.cancel(); return null; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
}

function isStaticPng(bytes: Buffer) {
  if (!bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return false;
  for (let at=8; at+12<=bytes.length;) {
    const kind=bytes.toString("ascii",at+4,at+8), end=at+12+bytes.readUInt32BE(at);
    if (kind==="acTL" || end>bytes.length) return false;
    if (kind==="IEND") return end===bytes.length;
    at=end;
  }
  return false;
}

export async function normalizePhoto(original: Buffer, type: string): Promise<Buffer | null> {
  if (!original.length || original.length>maxOriginalBytes) return null;
  const allowed = type==="image/png" && isStaticPng(original)
    || type==="image/jpeg" && original[0]===255 && original[1]===216 && original[2]===255
    || type==="image/webp" && original.toString("ascii",0,4)==="RIFF"
      && original.toString("ascii",8,12)==="WEBP" && original.readUInt32LE(4)+8===original.length;
  if (!allowed) return null;
  try {
    const image=sharp(original,{failOn:"warning",limitInputPixels:2048*2048});
    const info=await image.metadata();
    if (type!=="image/"+info.format || !info.width || !info.height || info.width>2048 || info.height>2048
      || (info.pages??1)!==1 || info.delay?.length) return null;
    // Sharp discards EXIF/GPS, comments and other input metadata unless explicitly requested.
    const output=await image.rotate().resize(256,256,{fit:"cover"}).webp({quality:80}).toBuffer();
    return output.length<=131072 ? output : null;
  } catch { return null; }
}
