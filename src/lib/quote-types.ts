export const QUOTE_LIMIT = 1_000;

export type QuotePreview = { postId: number; author: string; body: string; room: string | null };
export type QuotedPost = { original: QuotePreview | null };
