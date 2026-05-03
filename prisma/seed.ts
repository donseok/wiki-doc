/**
 * 초기 시드 (도메인 범용화 — Round 3)
 * - FR-104: 기본 메뉴 트리 자동 생성 (PI 예시 + ERP/CRM/사내IT 예시)
 * - FR-211: 페이지 템플릿 시스템 기본 10종 등록
 * - 기본 칸반 보드 1개 생성
 */

import { PrismaClient } from '@prisma/client';
import { DEFAULT_TEMPLATES } from '../src/server/default-templates';
import {
  PI_DEFAULT_TREE,
  EXTRA_SAMPLE_WORKSPACES,
  type PIDefaultNode,
} from '../src/server/pi-default-tree';
import { applyTemplateVariables } from '../src/lib/templates';

const prisma = new PrismaClient();

async function seedTemplates() {
  console.log('▶ Templates 시드 시작...');
  for (const tmpl of DEFAULT_TEMPLATES) {
    await prisma.template.upsert({
      where: { id: `tmpl-${tmpl.key}` },
      update: {
        name: tmpl.name,
        description: tmpl.description,
        category: tmpl.category,
        contentMarkdown: tmpl.contentMarkdown,
        icon: tmpl.icon,
        isSystem: true,
      },
      create: {
        id: `tmpl-${tmpl.key}`,
        name: tmpl.name,
        description: tmpl.description,
        category: tmpl.category,
        contentMarkdown: tmpl.contentMarkdown,
        icon: tmpl.icon,
        isSystem: true,
      },
    });
  }
  console.log(`  ✔ ${DEFAULT_TEMPLATES.length}개 템플릿 등록 완료`);
}

const templateMap = new Map(DEFAULT_TEMPLATES.map((t) => [t.key, t]));

async function createTreeNode(
  node: PIDefaultNode,
  parentId: string | null,
  order: number,
): Promise<number> {
  let count = 1;

  if (node.type === 'folder') {
    const created = await prisma.treeNode.create({
      data: {
        parentId,
        type: 'folder',
        title: node.title,
        icon: node.icon,
        order,
      },
    });
    if (node.children) {
      for (const [i, child] of node.children.entries()) {
        count += await createTreeNode(child, created.id, i);
      }
    }
    return count;
  }

  const tmpl = node.templateKey ? templateMap.get(node.templateKey) : undefined;
  const md = tmpl
    ? applyTemplateVariables(tmpl.contentMarkdown, { author: '시스템', title: node.title })
    : '';

  const created = await prisma.treeNode.create({
    data: {
      parentId,
      type: 'page',
      title: node.title,
      icon: node.icon,
      order,
    },
  });

  await prisma.page.create({
    data: {
      treeNodeId: created.id,
      contentMarkdown: md,
      status: 'Draft',
      authorName: '시스템',
    },
  });
  return count;
}

const PI_SAMPLE_WRAPPER_TITLE = '샘플 워크스페이스 - PI 활동 (MES/APS)';

async function seedTree() {
  console.log('▶ 기본 트리 시드 시작...');

  const existing = await prisma.treeNode.count();
  if (existing > 0) {
    console.log(`  ⤬ TreeNode 가 이미 ${existing}개 존재함 — PI 트리 시드 스킵`);
    return;
  }

  let counter = 0;

  // PI 트리 — 30 노드를 "샘플 워크스페이스 - PI 활동 (MES/APS)" 폴더로 감싸 격상.
  const piWrapper = await prisma.treeNode.create({
    data: {
      parentId: null,
      type: 'folder',
      title: PI_SAMPLE_WRAPPER_TITLE,
      icon: '🗂️',
      order: 0,
    },
  });
  counter += 1;
  for (const [i, top] of PI_DEFAULT_TREE.entries()) {
    counter += await createTreeNode(top, piWrapper.id, i);
  }

  console.log(`  ✔ PI 예시 트리 ${counter}개 노드 생성 완료`);
}

async function seedExtraSampleWorkspaces() {
  console.log('▶ 추가 예시 워크스페이스 시드 시작 (ERP / CRM / 사내 IT)...');

  // 루트 다음 order 값 결정 (멱등 추가용)
  const rootMaxOrder = await prisma.treeNode.aggregate({
    where: { parentId: null },
    _max: { order: true },
  });
  let nextOrder = (rootMaxOrder._max.order ?? -1) + 1;

  let inserted = 0;
  let skipped = 0;
  for (const top of EXTRA_SAMPLE_WORKSPACES) {
    const exists = await prisma.treeNode.findFirst({
      where: { parentId: null, title: top.title, type: 'folder' },
      select: { id: true },
    });
    if (exists) {
      skipped += 1;
      continue;
    }
    inserted += await createTreeNode(top, null, nextOrder);
    nextOrder += 1;
  }

  if (inserted === 0 && skipped > 0) {
    console.log(`  ⤬ 추가 예시 워크스페이스 ${skipped}개 이미 존재 — 스킵`);
  } else {
    console.log(`  ✔ 추가 예시 노드 ${inserted}개 생성 (이미 존재: ${skipped}개)`);
  }
}

async function seedBoard() {
  console.log('▶ 기본 칸반 보드 시드 시작...');
  const existing = await prisma.board.count();
  if (existing > 0) {
    console.log(`  ⤬ Board 가 이미 ${existing}개 존재함 — 보드 시드 스킵`);
    return;
  }
  await prisma.board.create({
    data: {
      name: '기본 아이디어 보드',
      description: '즉흥적 아이디어와 Pending 항목을 칸반 형태로 관리',
    },
  });
  console.log('  ✔ 기본 보드 생성');
}

async function seedWhiteboard() {
  console.log('▶ 샘플 화이트보드 시드 시작...');
  const existing = await prisma.whiteboard.count();
  if (existing > 0) {
    console.log(`  ⤬ Whiteboard 가 이미 ${existing}개 존재함 — 화이트보드 시드 스킵`);
    return;
  }

  // 자유 작업공간 폴더 하위에 샘플 화이트보드 생성
  const freeFolder = await prisma.treeNode.findFirst({
    where: { type: 'folder', title: { contains: '자유 작업공간' } },
  });
  const parentId = freeFolder?.id ?? null;
  const order = await prisma.treeNode.aggregate({
    where: { parentId },
    _max: { order: true },
  });

  const node = await prisma.treeNode.create({
    data: {
      parentId,
      type: 'whiteboard',
      title: '브레인스토밍 캔버스 (샘플)',
      icon: '🎨',
      order: (order._max.order ?? -1) + 1,
    },
  });
  await prisma.whiteboard.create({
    data: {
      treeNodeId: node.id,
      title: '브레인스토밍 캔버스 (샘플)',
    },
  });
  console.log('  ✔ 샘플 화이트보드 생성 (자유 작업공간 하위)');
}

async function main() {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Atlas 초기 시드');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await seedTemplates();
  await seedTree();
  await seedExtraSampleWorkspaces();
  await seedBoard();
  await seedWhiteboard();
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ 시드 완료');
}

main()
  .catch((e) => {
    console.error('❌ 시드 실패:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
