import { NextResponse } from "next/server";
import { authError, readObject, requireUser } from "@/lib/auth-http";
import { createQuotePost } from "@/lib/quote-posts";

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const input = await readObject(req);
  if (input.expectedAuthorId !== undefined && input.expectedAuthorId !== access.user.id) {
    return authError("Your signed-in account changed. Refresh before posting.", 409);
  }
  try {
    const result = await createQuotePost(access.user, input);
    if ("rateLimited" in result) return authError(result.error, 429);
    return NextResponse.json(result, { status: result.ok ? 201 : result.reconsider ? 422 : 400,
      headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return authError("The quote could not be confirmed. Try again.", 503);
  }
}
