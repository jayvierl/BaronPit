import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import productionDerivatives from "../docs/art/production-derivatives.json" with { type: "json" };
import atlas from "../src/lib/champion-portrait-atlas.json" with { type: "json" };

const approvedImages = [
  "mascot.png", "mascot-avatar.png",
  ...["new-players", "off-meta-lab", "patch-meta", "baron-pit-winter"].flatMap(room =>
    [160, 480, 960].map(width => `rooms/${room}-${width}.webp`)),
  "game-cards/victory.webp", "game-cards/defeat.webp",
];

export const publicArtwork = [
  "baron-emblem.png", "baron-hero.png", "baron-icon-32.png", "baron-icon-180.png",
  "baron-emblem-96.webp", "baron-duo.webp", "baron-room-480.webp", "baron-room-960.webp",
  "rooms/general-160.webp", "rooms/lfg-lobby-480.webp", "rooms/lfg-lobby-960.webp",
  ...approvedImages,
  `champions/${atlas.patch}.webp`,
];

function checkProductionDerivative(file, bytes) {
  const expected = productionDerivatives.files[file];
  if (!expected) return;
  assert.equal(bytes.length, expected.bytes, file + " does not match its approved production size");
  assert.equal(createHash("sha256").update(bytes).digest("hex"), expected.sha256,
    file + " does not match its approved production SHA-256");
}

export function checkImage(file, bytes) {
  if (file.endsWith(".png")) {
    assert.equal(bytes.toString("hex", 0, 8), "89504e470d0a1a0a", file + " has an invalid PNG header");
    assert.equal(bytes.subarray(-8, -4).toString("ascii"), "IEND", file + " has incomplete PNG data");
  } else {
    assert.equal(bytes.toString("ascii", 0, 4), "RIFF", file + " has an invalid WebP header");
    assert.equal(bytes.toString("ascii", 8, 12), "WEBP", file + " is missing WebP data");
    assert.equal(bytes.readUInt32LE(4) + 8, bytes.length, file + " has incomplete WebP data");
  }
  checkProductionDerivative(file, bytes);
}

const gameVideos = ["victory", "defeat"].flatMap(result => [`game-cards/${result}.webm`, `game-cards/${result}.mp4`]);

function checkGameVideo(file, bytes) {
  assert.ok(bytes.length > 128 && bytes.length <= 1_500_000, file + " must fit the 1.5 MB video budget");
  if (file.endsWith(".webm")) {
    assert.equal(bytes.toString("hex", 0, 4), "1a45dfa3", file + " has an invalid WebM header");
    assert.ok(bytes.subarray(0, 96).includes(Buffer.from("webm")), file + " must use the WebM container");
  } else {
    assert.equal(bytes.toString("ascii", 4, 8), "ftyp", file + " has an invalid MP4 header");
    const index = bytes.indexOf(Buffer.from("moov"));
    assert.ok(index > 8 && index < bytes.indexOf(Buffer.from("mdat")), file + " must support progressive playback");
  }
  checkProductionDerivative(file, bytes);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const approved = [...approvedImages, ...gameVideos].sort();
  assert.deepEqual(Object.keys(productionDerivatives.files).sort(), approved,
    "The production derivative manifest must cover all approved artwork");
  const all = [...publicArtwork, ...atlas.ids.map(id => `champions/${atlas.patch}/${id}.webp`)];
  for (const file of all) {
    checkImage(file, readFileSync(new URL("../public/" + file, import.meta.url)));
  }
  for (const file of gameVideos) {
    checkGameVideo(file, readFileSync(new URL("../public/" + file, import.meta.url)));
  }
  console.log(`Verified ${all.length} public images, ${gameVideos.length} game videos and ${approved.length} production hashes.`);
}
