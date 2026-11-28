/**
 * Ownership state for a linked Riot ID, shown wherever the link renders.
 * Verified means control of the League account was proven (profile-icon
 * challenge, or Riot Sign On when it ships) — never just claimed.
 */
export function RiotLinkBadge({ verified }: { verified: boolean }) {
  return verified
    ? <span className="chip riot-verified" title="Ownership of this Riot account was proven">Verified</span>
    : <span className="chip" title="This Riot account was claimed but ownership hasn't been proven">Unverified</span>;
}
