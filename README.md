# Baron Pit

A League of Legends **social app** — social first, recent-form stats second.
Live at [baronpit.com](https://baronpit.com) (also ward-party.vercel.app).

Tagline: *Never take Baron alone.*

## What it is

- Threads-style social platform for League players: feed, posts (text / build / poll / clip / media), comments, positive-only reactions, follows, endorsements, champion rooms, an LFG board, and a daily spotlight.
- Player pages show recent form only (last ~20 games, last-3-games view, duo detection, plain-language comparisons). **Minimal retention by design** — no lifetime archive.
- Moderation is built in from day one: three-band auto-mod, report/block/mute, admin queue, reform cards.

## Stack

- Next.js 16 / React 19 / TypeScript, plain-CSS design system (no Tailwind)
- Neon Postgres via `@neondatabase/serverless` (tables prefixed `wp_`)
- Passwordless email sign-in (magic links via Resend), Vercel Blob for media uploads
- Riot Games API for recent-form snapshots (development key, rotated daily until the production app is approved)

## Working notes

- Environment variables live in Vercel (project `ward-party`) — never commit secrets. The app needs `DATABASE_URL`, `RESEND_API_KEY`, `RIOT_API_KEY`, `BLOB_READ_WRITE_TOKEN`, `ADMIN_EMAILS`, `AUTH_EMAIL_FROM`, `NEXT_PUBLIC_APP_NAME`, `CRON_SECRET`.
- Definition of done: unit tests + production build + live smoke check.
- Read `CODEX-DEEP-AUDIT.md` and `BARON-PIT-AUDIT-FOR-CODEX.md` before making changes — they carry the build history, hard Riot-policy constraints, known audit findings, and the performance backlog.
- Design/ops docs live in `docs/` (build brief, moderation spec, 40-feature deep dive). Art masters are kept outside this repo (binary assets are not in this snapshot).
