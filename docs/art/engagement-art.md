# Engagement artwork

The mascot and room artwork in `public/` match the approved files served by [Baron Pit](https://baronpit.com). Lyris’s November 26, 2026 handoff records the art-only swap on Vercel deployment `ward-party-pyhoghpoi`. The 20 public derivatives were downloaded and verified on November 27, 2026. Their sizes and SHA-256 digests are in the [production derivative manifest](production-derivatives.json).

| Public derivatives | Runway source recorded in the handoff |
| --- | --- |
| `mascot.png` (160 × 160), `mascot-avatar.png` (112 × 112 head crop) | `ward-mascot-runway.png`, task `6aa54b86` |
| `rooms/new-players-{160,480,960}.webp` | `room-banner-new-players-runway.png`, task `19ccf15d` |
| `rooms/off-meta-lab-{160,480,960}.webp` | `room-banner-off-meta-lab-runway.png`, task `e4ac757c` |
| `rooms/patch-meta-{160,480,960}.webp` | `room-banner-patch-meta-runway.png`, task `be3ec05b` |
| `rooms/baron-pit-winter-{160,480,960}.webp` | `baron-pit-winter-runway.png` with the crop `baron-pit-winter-banner-runway.png`, task `ab899f04` |

The room tiles are 16:9 at 160, 480 and 960 pixels wide. The general room uses the winter painting during December UTC and its original Baron painting the rest of the year. The LFG lobby uses a closer crop of the original Baron painting. See the [game card provenance](game-card-loops.md) for the six motion derivatives.

The eight Runway masters require access to Lyris’s archived source files or Jay’s original attachments. The previous [four-panel painting](community-room-scenes.png) and [golden ward](golden-ward.png) are archived source art from the initial implementation.

Run `node scripts/public-art.mjs` to verify local artwork before building. Confirm any deliberate replacement against the approved source before updating its byte count and digest in the manifest.
