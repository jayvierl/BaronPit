import { rateLimit, type User } from "./auth";
import { validId } from "./ids";
import { quoteSourceRoom } from "./quote-queries";
import { QUOTE_LIMIT } from "./quote-types";
import { createPost, type CreateResult } from "./social";
import { priorSubmission, submissionHash, validSubmissionId } from "./submissions";

type QuoteResult = CreateResult | { ok: false; error: string; rateLimited: true };

export async function createQuotePost(user: User, input: Record<string, unknown>): Promise<QuoteResult> {
  const { postId, body, submissionId } = input;
  if (!validId(postId) || typeof body !== "string" || !body.trim() || body.length > QUOTE_LIMIT || !validSubmissionId(submissionId)) {
    return { ok: false, error: `Choose an original post and write up to ${QUOTE_LIMIT.toLocaleString("en-US")} characters of your own commentary.` };
  }
  const text = body.trim();
  const hash = submissionHash(["quote", postId, text]);
  const replay = await priorSubmission("post", user.id, submissionId, hash);
  if (replay) return replay;
  if (!(await rateLimit(user.id, "quote", 12, 60))) return { ok: false, error: "You can post up to 12 quotes an hour.", rateLimited: true };
  const source = await quoteSourceRoom(user.id, postId);
  if (!source) return { ok: false, error: "The original post is unavailable to quote." };
  return createPost(user, { kind: "text", body: text, roomId: source.roomId, submissionId, submitForReview: input.submitForReview === true },
    undefined, hash, undefined, postId);
}
