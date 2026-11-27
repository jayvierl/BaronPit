"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { buildKeystone, buildsHref } from "@/lib/build-sharing";
import { publicPatch } from "@/lib/patch-notes";
import type { PostView } from "@/lib/post-types";
import { samePatch } from "@/lib/pure";
import { ChampionPortrait } from "./champion-portrait";
import { ItemIcons } from "./item-icons";
import { ActionFeedback, usePostAction } from "./post-action";
import styles from "./thread.module.css";

export function BuildAttachment({ post, patch, canReconfirm }: { post: PostView; patch: string; canReconfirm: boolean }) {
  const data = post.data;
  const [confirmed, setConfirmed] = useState<string | null>(null);
  const action = usePostAction();
  const router = useRouter();
  const buildPatch = confirmed ?? publicPatch(data.patch);
  const currentPatch = publicPatch(patch);
  const itemPatch = publicPatch(post.itemPatch);
  const stale = !!currentPatch && (!buildPatch || !samePatch(buildPatch, currentPatch));
  const champion = typeof data.champion === "string" ? data.champion : null;
  const keystone = buildKeystone(data.keystone);
  const notes = typeof data.runes === "string" ? data.runes : "";
  const compareHref = `/builds/compare?build=${post.id}`;

  return <div className={styles.buildAttachment}>
    <div className={styles.attachmentHeading}>
      {champion && <ChampionPortrait compact id={champion} patch={patch} size={36}/>}
      <div>
        <strong>{champion ? `${champion} build` : "Community build"}</strong>
        <div className="meta">{buildPatch ? `Patch ${buildPatch}` : "Patch unavailable"}
          {data.offMeta === true && <> · <span className="offmeta">Off-meta</span></>}
          {stale && <> · <span className="stale-tag">Unconfirmed for patch {currentPatch}</span>
            {canReconfirm && <button type="button" className={`text-btn ${styles.reconfirm}`} disabled={action.busy}
              onClick={async () => {
                const result = await action.send("/api/social/builds/reconfirm", { postId: post.id });
                if (typeof result?.patch === "string") { setConfirmed(publicPatch(result.patch)); router.refresh(); }
              }}>Re-confirm for this patch</button>}
          </>}
        </div>
      </div>
    </div>
    <ItemIcons ids={Array.isArray(data.items) ? data.items : []} patch={post.itemPatch ?? patch} details={post.itemDetails}/>
    {itemPatch && itemPatch !== buildPatch && post.itemDetails?.length ? <p className="meta">Item details use Riot catalog patch {itemPatch}.</p> : null}
    {keystone && <div className={styles.runes}>Keystone · {keystone.name}</div>}
    {notes && <div className={styles.runes}>Rune notes · {notes}</div>}
    {post.status === "visible" && <div className={styles.discussionLinks}>
      <Link href={compareHref} prefetch={false}>Compare this build</Link>
      {champion && <Link href={buildsHref({ champion })} prefetch={false}>More {champion} builds</Link>}
    </div>}
    <ActionFeedback error={action.error}/>
  </div>;
}
