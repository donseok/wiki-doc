/**
 * PI Wiki 초기 시드
 * - FR-104: PI 기본 메뉴 트리 자동 생성
 * - FR-211: 페이지 템플릿 시스템 기본 10종 등록
 * - 기본 칸반 보드 1개 생성
 */

import { PrismaClient } from '@prisma/client';
import { DEFAULT_TEMPLATES } from '../src/server/default-templates';
import { PI_DEFAULT_TREE, type PIDefaultNode } from '../src/server/pi-default-tree';
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

async function seedTree() {
  console.log('▶ PI 기본 트리 시드 시작...');

  const existing = await prisma.treeNode.count();
  if (existing > 0) {
    console.log(`  ⤬ TreeNode 가 이미 ${existing}개 존재함 — 트리 시드 스킵`);
    return;
  }

  const templateMap = new Map(DEFAULT_TEMPLATES.map((t) => [t.key, t]));

  let counter = 0;
  async function createNode(node: PIDefaultNode, parentId: string | null, order: number) {
    counter += 1;

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
          await createNode(child, created.id, i);
        }
      }
      return;
    }

    // page
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
  }

  for (const [i, top] of PI_DEFAULT_TREE.entries()) {
    await createNode(top, null, i);
  }

  console.log(`  ✔ ${counter}개 노드 생성 완료`);
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
  console.log('PI Wiki 초기 시드');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  await seedTemplates();
  await seedTree();
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
