/**
 * 코멘트 UI 공통 타입 정의 — FR-501 ~ FR-506
 */

export interface CommentAnchorRange {
  from: number;
  to: number;
  quote?: string;
}

export interface CommentDTO {
  id: string;
  pageId: string;
  parentId: string | null;
  body: string;
  anchorRange: CommentAnchorRange | null;
  authorName: string;
  resolved: boolean;
  reactions: Record<string, string[]> | null;
  createdAt: string;
  updatedAt: string;
}

/** 트리 구성용 — replies 가 추가된 형태 */
export interface CommentNode extends CommentDTO {
  replies: CommentNode[];
}

/** 사용 가능한 이모지 셋 — FR-506 */
export const EMOJI_PALETTE = ['👍', '❤️', '😄', '✅', '❓', '⚠️'] as const;
export type EmojiKind = (typeof EMOJI_PALETTE)[number];

/** flat → tree 변환 */
export function buildCommentTree(flat: CommentDTO[]): CommentNode[] {
  const map = new Map<string, CommentNode>();
  flat.forEach((c) => map.set(c.id, { ...c, replies: [] }));
  const roots: CommentNode[] = [];
  flat.forEach((c) => {
    const node = map.get(c.id);
    if (!node) return;
    if (c.parentId && map.has(c.parentId)) {
      map.get(c.parentId)!.replies.push(node);
    } else {
      roots.push(node);
    }
  });
  // createdAt 오름차순 (서버에서 이미 정렬돼 옴)
  return roots;
}
