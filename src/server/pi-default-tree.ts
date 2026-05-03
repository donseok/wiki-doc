/**
 * FR-104 PI 기본 메뉴 템플릿
 * 시스템 최초 시드 시 자동 생성되는 트리 구조.
 * 요구사항 정의서 §8 PI 기본 메뉴 템플릿 기준.
 */

export interface PIDefaultNode {
  title: string;
  type: 'folder' | 'page';
  icon?: string;
  /** 페이지 노드인 경우 적용할 템플릿 키 (default-templates.ts 참조) */
  templateKey?: string;
  children?: PIDefaultNode[];
}

export const PI_DEFAULT_TREE: PIDefaultNode[] = [
  {
    title: '1. 현행 분석 (AS-IS)',
    type: 'folder',
    icon: '📁',
    children: [
      {
        title: 'MES 시스템 분석',
        type: 'folder',
        icon: '📁',
        children: [
          { title: '아키텍처 / 구성도', type: 'page', icon: '📄', templateKey: 'as-is-system' },
          { title: '주요 모듈별 분석', type: 'page', icon: '📄', templateKey: 'as-is-system' },
          { title: '데이터 모델', type: 'page', icon: '📄', templateKey: 'as-is-system' },
        ],
      },
      {
        title: 'APS 시스템 분석',
        type: 'folder',
        icon: '📁',
        children: [
          { title: '아키텍처 / 구성도', type: 'page', icon: '📄', templateKey: 'as-is-system' },
          { title: '스케줄링 로직', type: 'page', icon: '📄', templateKey: 'as-is-system' },
          { title: '연동 인터페이스', type: 'page', icon: '📄', templateKey: 'interface-spec' },
        ],
      },
      { title: '업무 프로세스 분석', type: 'folder', icon: '📁' },
    ],
  },
  {
    title: '2. 문제점 및 이슈',
    type: 'folder',
    icon: '📁',
    children: [
      { title: '기술적 문제점', type: 'page', icon: '📄', templateKey: 'issue' },
      { title: '업무적 문제점', type: 'page', icon: '📄', templateKey: 'issue' },
      { title: '성능/안정성 이슈', type: 'page', icon: '📄', templateKey: 'issue' },
      { title: '데이터 품질 이슈', type: 'page', icon: '📄', templateKey: 'issue' },
    ],
  },
  {
    title: '3. 개선 방안',
    type: 'folder',
    icon: '📁',
    children: [
      { title: '단기 개선 (Quick Win)', type: 'page', icon: '📄', templateKey: 'improvement' },
      { title: '중장기 개선', type: 'page', icon: '📄', templateKey: 'improvement' },
      { title: '아키텍처 개선안', type: 'page', icon: '📄', templateKey: 'improvement' },
    ],
  },
  {
    title: '4. 목표 모델 (TO-BE)',
    type: 'folder',
    icon: '📁',
    children: [
      { title: 'TO-BE 프로세스', type: 'page', icon: '📄', templateKey: 'to-be' },
      { title: 'TO-BE 시스템 아키텍처', type: 'page', icon: '📄', templateKey: 'to-be' },
      { title: 'TO-BE 데이터 모델', type: 'page', icon: '📄', templateKey: 'to-be' },
    ],
  },
  {
    title: '5. 의사결정 로그',
    type: 'folder',
    icon: '📁',
    children: [
      { title: '결정된 사항', type: 'page', icon: '📄', templateKey: 'adr' },
      { title: 'Pending 사항', type: 'page', icon: '📄', templateKey: 'pending' },
    ],
  },
  {
    title: '6. 자유 작업공간',
    type: 'folder',
    icon: '📁',
    children: [
      { title: '회의록', type: 'page', icon: '📄', templateKey: 'meeting' },
      { title: '참고 자료', type: 'page', icon: '📄', templateKey: 'blank' },
      { title: '개인 작업 노트', type: 'page', icon: '📄', templateKey: 'blank' },
    ],
  },
];
