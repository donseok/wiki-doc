/** UI에서 사용하는 트리 노드 데이터 형태 (API 응답 그대로) */
export interface TreeNodeData {
  id: string;
  parentId: string | null;
  type: 'folder' | 'page' | 'whiteboard';
  title: string;
  icon: string | null;
  order: number;
  page?: { status: 'Draft' | 'Review' | 'Approved' | 'Pending' | 'Archived' } | null;
}

export interface TemplateData {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  contentMarkdown: string;
  icon: string | null;
  isSystem: boolean;
}

export type PageStatus = 'Draft' | 'Review' | 'Approved' | 'Pending' | 'Archived';

export interface PageData {
  id: string;
  treeNodeId: string;
  contentMarkdown: string;
  contentJson: unknown;
  status: PageStatus;
  authorName: string;
  pendingReason: string | null;
  createdAt: string;
  updatedAt: string;
  treeNode: { id: string; title: string; icon: string | null };
  tags: { tag: { id: string; name: string; color: string | null } }[];
}

export interface LockState {
  locked: boolean;
  editor?: string;
  startedAt?: string;
  expiresAt?: string;
  isMine?: boolean;
}
