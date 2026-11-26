import Link from "next/link";
import { getCurrentUser } from "@/lib/auth";
import { q } from "@/lib/db";
import { listLfg, primaryPlayer } from "@/lib/social";
import { championList, currentPatch } from "@/lib/riot";
import { CloseListingButton, LfgBoard, LfgForm } from "@/components/lfg-ui";

export const dynamic = "force-dynamic";

export default async function LfgPage() {
  const user = await getCurrentUser().catch(() => null);
  const listings = await listLfg(user).catch(() => []);
  const champions = await championList();
  const patch = await currentPatch();
  const myPlayer = user ? await primaryPlayer(user.id).catch(() => null) : null;
  const myListings = user
    ? await q`SELECT id FROM wp_lfg WHERE user_id = ${user.id} AND status = 'open' AND expires_at > now()`.catch(() => [])
    : [];

  return (
    <div style={{ maxWidth: 820, margin: "0 auto" }}>
      <h1 className="page-title">Find a duo</h1>
      <p className="meta" style={{ maxWidth: 620 }}>
        Every listing&apos;s rank and recent form are pulled from the Riot API — nobody types in their own rank.
        Keep first contact in-app: wave, follow, and add each other in the League client. Listings expire after 4 hours.
      </p>

      {user && myPlayer && <LfgForm champs={champions.map((c) => c.id)} />}
      {user && !myPlayer && (
        <div className="card" style={{ textAlign: "center" }}>
          <strong>Link your Riot ID to post a listing.</strong>
          <p className="meta">Verified-by-API rank is the whole point of this board.</p>
          <Link href="/me" className="btn">Link my Riot ID</Link>
        </div>
      )}
      {!user && (
        <div className="card" style={{ textAlign: "center" }}>
          <Link href="/signin" className="btn">Sign in to post a listing</Link>
        </div>
      )}
      {myListings.length > 0 && (
        <div className="notice ok" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span>Your listing is live.</span>
          <CloseListingButton listingId={Number(myListings[0].id)} />
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <LfgBoard listings={listings} patch={patch} signedIn={Boolean(user)} />
      </div>
    </div>
  );
}
