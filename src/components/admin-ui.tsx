"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

async function postJson(url: string, body: unknown): Promise<boolean> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => ({}))) as { ok?: boolean };
  return res.ok && data.ok !== false;
}

export function ResolveButtons({ targetKind, targetId, authorId }: { targetKind: "post" | "comment" | "report"; targetId: number; authorId?: number }) {
  const router = useRouter();
  const [done, setDone] = useState("");
  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    const ok = await postJson("/api/admin/resolve", { targetKind, targetId, action, ...extra });
    if (ok) { setDone(action); router.refresh(); }
  };
  if (done) return <span className="meta">✓ {done}</span>;
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
      {targetKind !== "report" && <button type="button" className="btn small" onClick={() => act("approve")}>Approve</button>}
      <button type="button" className="btn small secondary" onClick={() => act(targetKind === "report" ? "dismiss" : "remove")}>
        {targetKind === "report" ? "Dismiss report" : "Remove"}
      </button>
      {targetKind === "report" && <button type="button" className="btn small secondary" onClick={() => act("approve")}>Mark actioned</button>}
      {authorId && (
        <button type="button" className="btn small" style={{ background: "#b3261e", borderColor: "#b3261e", color: "#fff" }}
          onClick={() => { if (window.confirm("Suspend this author for 7 days?")) void act("ban7d", { userId: authorId }); }}>
          Suspend author 7d
        </button>
      )}
    </span>
  );
}
