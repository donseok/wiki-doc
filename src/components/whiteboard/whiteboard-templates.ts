/**
 * 화이트보드 시작 템플릿 — FR-1213
 *
 * 각 템플릿은 tldraw 의 partial snapshot 을 반환한다.
 * 빈 화이트보드에 들어갈 frame + 라벨 + 가이드 sticky 들의 좌표를 사전 정의.
 *
 * 사용 시: editor.createShapes(template.shapes)
 */

export interface WhiteboardTemplate {
  key: string;
  name: string;
  description: string;
  /** tldraw 의 createShapes 인자 형식 (shape descriptors). 미니멀하게 keep simple. */
  build: () => Array<Record<string, unknown>>;
}

/* ---------- 도우미 ---------- */

function frame(x: number, y: number, w: number, h: number, name: string) {
  return {
    type: 'frame',
    x,
    y,
    props: { w, h, name },
  };
}

function note(x: number, y: number, text: string, color: 'yellow' | 'blue' | 'green' | 'red' | 'violet' | 'orange' = 'yellow') {
  return {
    type: 'note',
    x,
    y,
    props: { color, text },
  };
}

function textShape(x: number, y: number, text: string, size: 's' | 'm' | 'l' | 'xl' = 'l') {
  return {
    type: 'text',
    x,
    y,
    props: { text, size, autoSize: true },
  };
}

/* ---------- 템플릿 정의 ---------- */

export const WHITEBOARD_TEMPLATES: WhiteboardTemplate[] = [
  {
    key: 'blank',
    name: '빈 캔버스',
    description: '아무 가이드 없이 시작',
    build: () => [],
  },
  {
    key: 'swot',
    name: 'SWOT 분석',
    description: '강점 · 약점 · 기회 · 위협',
    build: () => [
      textShape(40, 0, 'SWOT 분석', 'xl'),
      frame(0, 80, 600, 400, '강점 (Strengths)'),
      frame(640, 80, 600, 400, '약점 (Weaknesses)'),
      frame(0, 540, 600, 400, '기회 (Opportunities)'),
      frame(640, 540, 600, 400, '위협 (Threats)'),
      note(40, 140, '내부의 강점은?', 'green'),
      note(680, 140, '내부의 약점은?', 'red'),
      note(40, 600, '외부의 기회는?', 'blue'),
      note(680, 600, '외부의 위협은?', 'orange'),
    ],
  },
  {
    key: 'fishbone',
    name: 'Fishbone (특성요인도)',
    description: '문제의 원인을 6개 카테고리로 분석 (4M+1E)',
    build: () => [
      textShape(40, 0, 'Fishbone — 문제: ___', 'xl'),
      // 헤드 (오른쪽)
      frame(900, 200, 280, 120, '문제 (Effect)'),
      // 6개 뼈대
      frame(0, 80, 240, 200, 'Man (사람)'),
      frame(280, 80, 240, 200, 'Machine (장비)'),
      frame(560, 80, 240, 200, 'Material (자재)'),
      frame(0, 360, 240, 200, 'Method (방법)'),
      frame(280, 360, 240, 200, 'Measurement (측정)'),
      frame(560, 360, 240, 200, 'Environment (환경)'),
    ],
  },
  {
    key: '4p',
    name: '4P 마케팅 믹스',
    description: 'Product · Price · Place · Promotion',
    build: () => [
      textShape(40, 0, '4P 마케팅 믹스', 'xl'),
      frame(0, 80, 500, 400, 'Product (제품)'),
      frame(540, 80, 500, 400, 'Price (가격)'),
      frame(0, 540, 500, 400, 'Place (유통)'),
      frame(540, 540, 500, 400, 'Promotion (프로모션)'),
    ],
  },
  {
    key: 'empathy',
    name: 'Empathy Map',
    description: '사용자가 보고/듣고/생각하고/말하고 행동하는 것',
    build: () => [
      textShape(40, 0, '공감 지도 — 페르소나: ___', 'xl'),
      frame(0, 80, 500, 320, 'Says (말)'),
      frame(540, 80, 500, 320, 'Thinks (생각)'),
      frame(0, 460, 500, 320, 'Does (행동)'),
      frame(540, 460, 500, 320, 'Feels (감정)'),
    ],
  },
  {
    key: '2x2',
    name: '2x2 우선순위 매트릭스',
    description: 'Effort × Impact / Urgency × Importance',
    build: () => [
      textShape(40, 0, '우선순위 매트릭스', 'xl'),
      frame(0, 80, 500, 360, '높은 효과 / 적은 노력 (즉시)'),
      frame(540, 80, 500, 360, '높은 효과 / 큰 노력 (계획)'),
      frame(0, 480, 500, 360, '낮은 효과 / 적은 노력 (여유)'),
      frame(540, 480, 500, 360, '낮은 효과 / 큰 노력 (제외)'),
    ],
  },
];

export function getTemplate(key: string): WhiteboardTemplate | undefined {
  return WHITEBOARD_TEMPLATES.find((t) => t.key === key);
}
