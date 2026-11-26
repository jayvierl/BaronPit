import { NextResponse } from "next/server";
import { readObject, requireUser } from "@/lib/auth-http";
import { askDecision, acceptDecision, recordTrial, setQuestionPreference } from "@/lib/decisions";
import { validId } from "@/lib/ids";

export async function POST(req: Request) {
  const access = await requireUser(req);
  if (!access.ok) return access.response;
  const input = await readObject(req);
  try {
    if (input.action === "preference") {
      const ok = await setQuestionPreference(access.user.id, input);
      return NextResponse.json(
        ok ? { ok: true } : { ok: false, error: "Choose an available role and champion." },
        { status: ok ? 200 : 400 },
      );
    }
    if (input.action === "ask") {
      const result = await askDecision(access.user, input);
      return NextResponse.json(result, {
        status: result.ok ? 201 : "reconsider" in result && result.reconsider ? 422 : 400,
      });
    }
    if (!validId(input.postId) || !validId(input.answerId))
      return NextResponse.json(
        { ok: false, error: "Choose an available question and reply." },
        { status: 400 },
      );
    const ok =
      input.action === "accept"
        ? await acceptDecision(access.user.id, input.postId, input.answerId)
        : input.action === "trial" &&
          (await recordTrial(access.user.id, input.postId, input.answerId, input.outcome, input.matchId));
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json(
          {
            ok: false,
            error: "This question, answer or recent match is unavailable. Refresh the thread and try again.",
          },
          { status: 400 },
        );
  } catch {
    return NextResponse.json(
      { ok: false, error: "Questions are temporarily unavailable. Your changes could not be confirmed." },
      { status: 503 },
    );
  }
}
