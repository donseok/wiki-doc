/**
 * FR-104 기본 샘플 메뉴 템플릿
 * 시스템 최초 시드 시 자동 생성되는 트리 구조.
 * 요구사항 정의서 §8 PI 기본 메뉴 템플릿 기준 (PI 트리는 예시로 보존).
 *
 * Round 3(2026-05-03) 도메인 범용화:
 * - PI_DEFAULT_TREE 30노드는 그대로 보존 (회귀 위험 회피)
 * - 추가 예시 워크스페이스(ERP / CRM / 사내 IT)를 EXTRA_SAMPLE_WORKSPACES 로 제공
 * - 시드는 두 컬렉션을 합쳐 "샘플 워크스페이스" 형태로 등록
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

/**
 * Round 3 도메인 범용화 — PI 외 다른 사내 시스템 예시 워크스페이스.
 * 시드 시 PI 트리와 같은 레벨(또는 샘플 워크스페이스 컨테이너 하위)로 등록.
 * 실제 운영에서는 사용자가 자유롭게 추가/삭제 가능한 "예시" 데이터.
 */
export const EXTRA_SAMPLE_WORKSPACES: PIDefaultNode[] = [
  {
    title: 'ERP 도입 영역 (예시)',
    type: 'folder',
    icon: '🏢',
    children: [
      {
        title: '모듈',
        type: 'folder',
        icon: '📁',
        children: [
          { title: 'FI / CO (재무·관리회계)', type: 'page', icon: '📄', templateKey: 'as-is-system' },
          { title: 'MM (구매/자재)', type: 'page', icon: '📄', templateKey: 'as-is-system' },
          { title: 'SD (영업/유통)', type: 'page', icon: '📄', templateKey: 'as-is-system' },
          { title: 'PP (생산계획)', type: 'page', icon: '📄', templateKey: 'as-is-system' },
        ],
      },
      {
        title: '배포 / 마이그레이션',
        type: 'folder',
        icon: '📁',
        children: [
          { title: '데이터 마이그레이션 계획', type: 'page', icon: '📄', templateKey: 'to-be' },
          { title: '커스터마이징 / 확장 정책', type: 'page', icon: '📄', templateKey: 'improvement' },
          { title: '인터페이스 매핑', type: 'page', icon: '📄', templateKey: 'interface-spec' },
        ],
      },
      {
        title: '운영',
        type: 'folder',
        icon: '📁',
        children: [
          { title: '운영 매뉴얼', type: 'page', icon: '📄', templateKey: 'blank' },
          { title: '월말 마감 절차', type: 'page', icon: '📄', templateKey: 'meeting' },
        ],
      },
      {
        title: '이슈 / 변경관리',
        type: 'folder',
        icon: '📁',
        children: [
          { title: '운영 이슈 로그', type: 'page', icon: '📄', templateKey: 'issue' },
          { title: 'Pending 변경 요청', type: 'page', icon: '📄', templateKey: 'pending' },
        ],
      },
    ],
  },
  {
    title: 'CRM 운영 (예시)',
    type: 'folder',
    icon: '📇',
    children: [
      { title: '고객 데이터 표준', type: 'page', icon: '📄', templateKey: 'as-is-system' },
      { title: '영업 파이프라인 정의', type: 'page', icon: '📄', templateKey: 'to-be' },
      { title: '캠페인 운영 가이드', type: 'page', icon: '📄', templateKey: 'blank' },
      { title: '운영 이슈', type: 'page', icon: '📄', templateKey: 'issue' },
    ],
  },
  {
    title: '사내 IT 일반 (예시)',
    type: 'folder',
    icon: '🛠️',
    children: [
      { title: '보안 정책 개요', type: 'page', icon: '📄', templateKey: 'blank' },
      { title: '네트워크 / 인프라 구성', type: 'page', icon: '📄', templateKey: 'as-is-system' },
      { title: '장비 / 자산 관리', type: 'page', icon: '📄', templateKey: 'blank' },
      { title: '헬프데스크 FAQ', type: 'page', icon: '📄', templateKey: 'blank' },
    ],
  },
];
