# Game card loop provenance

The Victory and Defeat media in `public/game-cards/` match the approved files served by [Baron Pit](https://baronpit.com). Lyris’s November 26, 2026 deployment handoff identifies their sources as `game-card-loop-victory-runway.mp4` (Runway task `64cd3467`) and `game-card-loop-defeat-runway.mp4` (task `64378d6a`). Access to the master files requires the original exports.

Each outcome has a silent, six-second 1280 × 720 loop at 24 frames per second, delivered as VP9 WebM and fast-start H.264 MP4, plus a 640 × 360 WebP still. All four videos fit within the 1.5 MB per-file budget.

| Outcome | WebM | MP4 | WebP still |
| --- | ---: | ---: | ---: |
| Victory | 364,835 bytes | 465,354 bytes | 22,936 bytes |
| Defeat | 243,034 bytes | 425,858 bytes | 9,296 bytes |

The copies retrieved from production on November 27, 2026 decoded successfully and passed the container, resolution, duration and frame-rate checks. The [production derivative manifest](production-derivatives.json) records their SHA-256 digests and exact sizes. `node scripts/public-art.mjs` checks these values during the production build.
