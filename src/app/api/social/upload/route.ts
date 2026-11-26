/** A public object is accessible as soon as it is uploaded, even when its post is held. */
export async function POST() {
  return Response.json(
    { ok: false, error: "Photo and video uploads are paused while private media screening is being set up." },
    { status: 503, headers: { "Cache-Control": "private, no-store" } },
  );
}
