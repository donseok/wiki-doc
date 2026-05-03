/**
 * 화이트보드 → 페이지 변환 — FR-1209
 *
 * POST /api/whiteboards/[id]/convert   { parentId?, title? }
 *
 * tldraw snapshot (Whiteboard.viewportJson) 을 walk 해서 마크다운 생성:
 *  - frame 셰이프    → H2 섹션 (frame.props.name 이 헤딩)
 *  - note 셰이프     → 해당 frame 안에 있으면 그 그룹의 불릿, 아니면 "분류 미정"
 *  - text 셰이프     → 별도 line 으로 표시 (제목/주석 역할)
 *  - geo + arrow     → 화이트보드의 시각 정보. 페이지 변환 시 별도 표기 없이 무시.
 *
 * 화이트보드 원본은 유지 (FR-1209). WhiteboardConversion 이력 기록.
 */

import { NextRequest } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getCurrentUserServer } from '@/lib/current-user';
import { ok, parseJson, handleError, fail } from '@/lib/api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const Schema = z.object({
  parentId: z.string().nullable().optional(),
  title: z.string().min(1).max(200).optional(),
});

/* ---------- tldraw snapshot 파서 ---------- */

interface TLShape {
  id: string;
  type: string;
  parentId?: string;
  x: number;
  y: number;
  props: Record<string, unknown>;
  meta?: Record<string, unknown>;
}

interface ParsedShape {
  id: string;
  type: 'frame' | 'note' | 'text' | 'other';
  parentId: string | null;
  x: number;
  y: number;
  text: string;
}

/** tldraw v3 snapshot 의 store 객체에서 모든 shape 레코드를 추출 */
function extractShapes(snapshot: unknown): ParsedShape[] {
  if (!snapshot || typeof snapshot !== 'object') return [];
  const root = snapshot as Record<string, unknown>;
  // tldraw v3: getSnapshot() 결과는 { document: { store: { ... } }, session?: ... } 또는
  //           구버전 호환의 { store: { ... } } 형태일 수 있음. 둘 다 지원.
  const store =
    (root.document as { store?: Record<string, unknown> } | undefined)?.store ??
    (root.store as Record<string, unknown> | undefined) ??
    (root as Record<string, unknown>);
  if (!store || typeof store !== 'object') return [];

  const shapes: ParsedShape[] = [];
  for (const value of Object.values(store)) {
    if (!value || typeof value !== 'object') continue;
    const v = value as Record<string, unknown>;
    if (v.typeName !== 'shape') continue;
    const s = v as unknown as TLShape;
    const baseType = s.type;
    let kind: ParsedShape['type'] = 'other';
    let text = '';
    if (baseType === 'frame') {
      kind = 'frame';
      const props = s.props as { name?: string };
      text = (props?.name || '').trim() || '(무제 그룹)';
    } else if (baseType === 'note') {
      kind = 'note';
      const props = s.props as { text?: string };
      text = (props?.text || '').trim();
    } else if (baseType === 'text') {
      kind = 'text';
      const props = s.props as { text?: string };
      text = (props?.text || '').trim();
    }
    // parentId 가 page 객체 ID 면 부모 없음 처리
    const parent = typeof s.parentId === 'string' && s.parentId.startsWith('shape:') ? s.parentId : null;
    shapes.push({
      id: s.id,
      type: kind,
      parentId: parent,
      x: typeof s.x === 'number' ? s.x : 0,
      y: typeof s.y === 'number' ? s.y : 0,
      text,
    });
  }
  return shapes;
}

/** 마크다운 생성 — H1 + (Frame 별 H2 + Notes 불릿) + 분류 미정 */
function buildMarkdown(opts: {
  title: string;
  whiteboardTitle: string;
  shapes: ParsedShape[];
  author: string;
}): string {
  const { title, whiteboardTitle, shapes, author } = opts;
  const lines: string[] = [];
  lines.push(`# ${title}`, '');
  lines.push(`> 화이트보드 "${whiteboardTitle}" 에서 자동 변환됨 · 변환자: @${author}`, '');

  // 텍스트 박스(설명/제목 역할) → 상단 인용으로 모아서 표시
  const textShapes = shapes.filter((s) => s.type === 'text' && s.text);
  if (textShapes.length > 0) {
    for (const t of textShapes) {
      lines.push(`> ${t.text}`);
    }
    lines.push('');
  }

  const frames = shapes.filter((s) => s.type === 'frame').sort((a, b) => a.y - b.y || a.x - b.x);
  const notes = shapes.filter((s) => s.type === 'note');

  // frame.id → notes 매핑 — note.parentId 가 frame.id 인 경우
  const grouped = new Map<string | null, ParsedShape[]>();
  for (const n of notes) {
    const key = n.parentId && frames.some((f) => f.id === n.parentId) ? n.parentId : null;
    const arr = grouped.get(key) ?? [];
    arr.push(n);
    grouped.set(key, arr);
  }

  for (const f of frames) {
    lines.push(`## ${f.text}`, '');
    const items = (grouped.get(f.id) ?? []).sort((a, b) => a.y - b.y || a.x - b.x);
    if (items.length === 0) {
      lines.push('_(아직 항목 없음)_', '');
    } else {
      for (const i of items) {
        lines.push(`- ${i.text || '(빈 포스트잇)'}`);
      }
      lines.push('');
    }
  }

  const orphan = grouped.get(null) ?? [];
  if (orphan.length > 0) {
    lines.push('## 분류 미정', '');
    for (const i of orphan.sort((a, b) => a.y - b.y || a.x - b.x)) {
      lines.push(`- ${i.text || '(빈 포스트잇)'}`);
    }
    lines.push('');
  }

  if (frames.length === 0 && notes.length === 0 && textShapes.length === 0) {
    lines.push('_(화이트보드에 변환할 컨텐츠가 없습니다)_', '');
  }

  return lines.join('\n');
}

/* ---------- 라우트 ---------- */

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await parseJson(req, Schema);
    const author = getCurrentUserServer();

    const wb = await prisma.whiteboard.findUnique({
      where: { id: params.id },
      include: { treeNode: true },
    });
    if (!wb) return fail('화이트보드를 찾을 수 없습니다', 404);

    const shapes = extractShapes(wb.viewportJson);
    const finalTitle = (body.title ?? wb.title).trim();

    const markdown = buildMarkdown({
      title: finalTitle,
      whiteboardTitle: wb.title,
      shapes,
      author,
    });

    const created = await prisma.$transaction(async (tx) => {
      const maxOrder = await tx.treeNode.aggregate({
        where: { parentId: body.parentId ?? null },
        _max: { order: true },
      });
      const node = await tx.treeNode.create({
        data: {
          parentId: body.parentId ?? null,
          type: 'page',
          title: finalTitle,
          order: (maxOrder._max.order ?? -1) + 1,
        },
      });
      const page = await tx.page.create({
        data: {
          treeNodeId: node.id,
          contentMarkdown: markdown,
          authorName: author,
        },
      });
      await tx.whiteboardConversion.create({
        data: {
          whiteboardId: wb.id,
          pageId: page.id,
          convertedBy: author,
        },
      });
      return { node, page };
    });

    return ok(
      {
        node: created.node,
        page: created.page,
        pageId: created.page.id,
        shapeCounts: {
          frames: shapes.filter((s) => s.type === 'frame').length,
          notes: shapes.filter((s) => s.type === 'note').length,
          text: shapes.filter((s) => s.type === 'text').length,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return handleError(err);
  }
}
