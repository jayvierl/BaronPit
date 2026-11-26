import { ImageResponse } from "next/og";
import { APP_NAME } from "@/lib/brand";

export const dynamic = "force-static";

export async function GET() {
  // A shared card gives chat apps a native PNG preview without sending player identities,
  // attachments or private content to an image service.
  return new ImageResponse(
    <div style={{ display: "flex", width: "100%", height: "100%", background: "#181026", color: "#fff", padding: 80, flexDirection: "column", justifyContent: "space-between" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 22, fontSize: 36, color: "#c4b5fd" }}>
        <div style={{ width: 40, height: 40, border: "6px solid #c4b5fd", borderRadius: 12, transform: "rotate(45deg)" }} />
        {APP_NAME}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 70, letterSpacing: -3 }}>League discussions</div>
        <div style={{ fontSize: 33, color: "#d3cedf" }}>Builds, matchups and advice from players.</div>
      </div>
      <div style={{ height: 7, width: 120, background: "#c4b5fd" }} />
    </div>,
    { width: 1200, height: 630 },
  );
}
