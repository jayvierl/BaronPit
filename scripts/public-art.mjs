import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import atlas from "../src/lib/champion-portrait-atlas.json" with { type: "json" };

export const publicArtwork = [
  "baron-emblem.png", "baron-hero.png", "baron-icon-32.png", "baron-icon-180.png",
  "baron-emblem-96.webp", "baron-room-480.webp", "baron-room-960.webp",
  `champions/${atlas.patch}.webp`,
];

export function checkImage(file, bytes) {
  if (file.endsWith(".png")) {
    assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a", file + " has an invalid PNG header");
    assert.equal(bytes.subarray(-8, -4).toString("ascii"), "IEND", file + " has incomplete PNG data");
  } else {
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", file + " has an invalid WebP header");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", file + " is missing WebP data");
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, file + " has incomplete WebP data");
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  for (const file of publicArtwork) {
    checkImage(file, readFileSync(new URL("../public/" + file, import.meta.url)));
  }
  console.log(`Verified ${publicArtwork.length} public images.`);
}
