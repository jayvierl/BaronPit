# Engineering runbook

First response for a production incident on baronpit.com. Keep to the facts:
every procedure here uses controls that exist today.

## First-response checklist

1. Check liveness: `GET https://baronpit.com/api/health` — expect `{"ok":true}`.
2. Check readiness: `GET https://baronpit.com/api/health?ready=1` — expect
   `{"ok":true,"db":true}`; a 503 means community storage is not configured or
   not reachable from the deployment.
3. Check the Vercel deployment status for project `ward-party` (is the latest
   production deployment Ready, or Building/Error?).
4. Check the latest **Verify** run in GitHub Actions for the current `main`
   commit.

## Rollback

Vercel dashboard → project **ward-party** → **Deployments** → pick the
last-known-good production deployment → **Promote to Production** (Instant
Rollback). This only changes which build serves traffic; a code rollback never
touches the database, and database state is not rolled back with it.

## Database restore

Databases are Neon projects:

- Production: **neon-cerise-island** (project ID `frosty-art-67346263`)
- Preview: **baronpit-preview** (project ID `muddy-salad-56895374`)

To restore: Neon console → project → **Branches** → create a branch from a
point-in-time restore (or restore the branch in place), then point the affected
environment at it. Neon creates a backup branch automatically when restoring in
place. **Warning:** a restore loses all writes made after the restore point —
confirm the point and the blast radius before running it.

## Kill switches

Set in Vercel project **ward-party** → Settings → Environment Variables
(Production), then redeploy for the change to take effect.

| Variable | Effect |
| --- | --- |
| `SAFETY_PAUSE_PUBLICATION=true` | Blocks user-generated-content writes (participate mode). Reports, blocks, mutes, appeals and withdrawals stay open. |
| `MODERATION_RAID_MODE=on` | Tightens new-account holds (raid posture) in the moderation ramp. |
| `DUO_MATCHING_ENABLED` | Duos are enabled only when this is exactly `true`; unset or any other value disables duo matching. |
| `PROFILE_PHOTO_SAFETY_READY` | Photo uploads/scanning are enabled only when this is exactly `true` (and the scanner is configured); unset or any other value keeps uploads gated off. |

## Riot API key rotation

The Riot key in production is a development key and expires roughly every
24 hours. Symptom: player lookups and refreshes start failing and the app
reports the key as unavailable (`key_unavailable`).

Rotation:

1. Sign in to the Riot developer portal and regenerate the development key.
2. In Vercel project **ward-party** → Settings → Environment Variables
   (Production), replace the value of `RIOT_API_KEY`.
3. Redeploy the current production deployment so functions pick up the new key.
4. Confirm with a player lookup on baronpit.com (a refresh should succeed
   instead of reporting the key as unavailable).

## Contacts

All addresses are @baronpit.com and forward to the operator inbox:

- `safety@` — community-safety reports (harassment, threats, child safety)
- `privacy@` — privacy requests, including account deletion
- `support@` — general support
- `security@` — vulnerability disclosure (see `SECURITY.md` and
  `/.well-known/security.txt`); not for community-safety reports
