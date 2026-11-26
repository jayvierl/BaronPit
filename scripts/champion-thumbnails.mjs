import { mkdir } from "node:fs/promises";
import sharp from "sharp";
import atlas from "../src/lib/champion-portrait-atlas.json" with { type: "json" };

// Rebuild bundled, patch-versioned single portraits for surfaces showing only a few champions.
const source = new URL(`../public/champions/${atlas.patch}.webp`, import.meta.url);
const directory = new URL(`../public/champions/${atlas.patch}/`, import.meta.url);
const image = sharp(source.pathname);
const { width, height } = await image.metadata();
const size = width / atlas.columns;
if (!Number.isInteger(size) || size !== height / atlas.rows) throw Error("Unexpected portrait atlas dimensions.");
await mkdir(directory, { recursive: true });
for (const [index, id] of atlas.ids.entries()) {
  await image.clone().extract({ left: index % atlas.columns * size, top: Math.floor(index / atlas.columns) * size, width: size, height: size })
    .webp({ quality:82 }).toFile(new URL(id + ".webp", directory).pathname);
}
