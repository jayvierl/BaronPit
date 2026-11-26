import { NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getCurrentUser, isBanned } from "@/lib/auth";

/**
 * Direct-to-Blob upload tokens for post media.
 * Guardrails: signed-in users only, strict type allowlists, size caps
 * (images 10 MB, video clips 50 MB). Files land under posts/<userId>/.
 */
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Bad request" }, { status: 400 });
  try {
    const result = await handleUpload({
      body,
      request: req,
      onBeforeGenerateToken: async (_pathname, clientPayload) => {
        const user = await getCurrentUser();
        if (!user) throw new Error("Sign in first.");
        if (isBanned(user)) throw new Error("Your account is temporarily restricted.");
        let media = "image";
        try { media = (JSON.parse(clientPayload ?? "{}") as { media?: string }).media ?? "image"; } catch { /* default */ }
        const isVideo = media === "video";
        return {
          allowedContentTypes: isVideo ? VIDEO_TYPES : IMAGE_TYPES,
          maximumSizeInBytes: isVideo ? 50 * 1024 * 1024 : 10 * 1024 * 1024,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
      onUploadCompleted: async () => {
        // The post itself is created separately via /api/social/post with the returned URL.
      },
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed." }, { status: 400 });
  }
}
