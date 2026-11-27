import type { CardItem } from "./build-catalog";
import type { AvatarRef } from "./avatar";
import type { LeagueTier } from "./rank";
export interface PostView {
  id: number; authorId: number; authorName: string; authorHue: number;
  authorAvatar?: AvatarRef;
  authorFlair: string | null;
  authorWinStreak?: number;
  authorTier?: LeagueTier | null;
  authorStatsHref?: string;
  kind: string; body: string; roomId: number | null; roomSlug: string | null; roomName: string | null;
  isQuestion?: boolean;
  itemDetails?: CardItem[];
  itemPatch?: string;
  lastReplyAt?: string;
  lastReplyId?: number;
  dailyCall?: { closesAt: string; closed: boolean; finalized: boolean };
  dailyCallPayoffFor?: number;
  canRepost?: boolean;
  myRepost?: boolean;
  repostedBy?: {id: number; name: string; at: string};
  data: Record<string, unknown>; status: string; createdAt: string;
  reactions: Record<string, number>; myReactions: string[];
  commentCount: number; pollResults: number[] | null; myVote: number | null;
}
export interface CommentView {
  id: number; postId: number; authorId: number; authorName: string; authorHue: number;
  authorAvatar?: AvatarRef;
  parentId: number | null; body: string; status: string; createdAt: string; oneFix: boolean;
  reactions: Record<string, number>; myReactions: string[]; replies: CommentView[];
}
