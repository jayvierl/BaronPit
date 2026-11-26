import type { CardItem } from "./build-catalog";
export interface PostView {
  id: number; authorId: number; authorName: string; authorHue: number;
  authorFlair: string | null;
  authorStatsHref?: string;
  kind: string; body: string; roomId: number | null; roomSlug: string | null; roomName: string | null;
  isQuestion?: boolean;
  itemDetails?: CardItem[];
  itemPatch?: string;
  lastReplyAt?: string;
  canRepost?: boolean;
  myRepost?: boolean;
  repostedBy?: {id: number; name: string; at: string};
  data: Record<string, unknown>; status: string; createdAt: string;
  reactions: Record<string, number>; myReactions: string[];
  commentCount: number; pollResults: number[] | null; myVote: number | null;
}
export interface CommentView {
  id: number; postId: number; authorId: number; authorName: string; authorHue: number;
  parentId: number | null; body: string; status: string; createdAt: string; oneFix: boolean;
  reactions: Record<string, number>; myReactions: string[]; replies: CommentView[];
}
