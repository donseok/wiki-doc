/**
 * FR-211 페이지 템플릿 시스템 - 기본 10종
 * 요구사항 정의서 §8.1 기준
 *
 * 템플릿 변수 (FR-213):
 *   {{date}}    : YYYY-MM-DD (시드 시점 또는 페이지 생성 시점)
 *   {{author}}  : 작성자 이름
 *   {{title}}   : 페이지 제목
 */

export interface DefaultTemplate {
  key: string;
  name: string;
  description: string;
  category: string;
  icon: string;
  contentMarkdown: string;
  variables?: { name: string; description: string }[];
}

export const DEFAULT_TEMPLATES: DefaultTemplate[] = [
  {
    key: 'blank',
    name: '빈 문서',
    description: '자유 형식의 빈 페이지로 시작합니다.',
    category: '기본',
    icon: '📄',
    contentMarkdown: '',
  },
  {
    key: 'meeting',
    name: '회의록',
    description: 'PI 회의 기록용. 일시·참석자·안건·논의·Decision·Action Items 구조.',
    category: '회의',
    icon: '📝',
    contentMarkdown: `# 회의록

| 항목 | 내용 |
| :---- | :---- |
| **일시** | {{date}} |
| **장소** | (회의실 또는 온라인) |
| **작성자** | {{author}} |
| **참석자** | (이름, 이름, ...) |

## 안건
- 안건 1
- 안건 2

## 논의 내용
### 안건 1
-

### 안건 2
-

## Decision (의사결정)
> **Decision**: 결정 사항 요약
> - **배경**:
> - **검토 옵션**:
> - **결정 사항**:
> - **근거**:
> - **담당자**: @
> - **결정일**: {{date}}

## Action Items
- [ ] @담당자 - 액션 1 (기한: YYYY-MM-DD)
- [ ] @담당자 - 액션 2 (기한: YYYY-MM-DD)

## 다음 회의
- **일시**:
- **안건**:
`,
  },
  {
    key: 'as-is-system',
    name: 'AS-IS 시스템 분석',
    description: '레거시 시스템 분석용. 개요·아키텍처·모듈·데이터 모델·문제점·기술부채.',
    category: '분석',
    icon: '🔍',
    contentMarkdown: `# {{title}} (AS-IS 시스템 분석)

> 작성자: {{author}} · 작성일: {{date}}

## 1. 개요
- **시스템명**:
- **분석 범위**:
- **분석 방법**: 소스코드 분석 / 인터뷰 / 문서 검토

## 2. 아키텍처
\`\`\`mermaid
flowchart LR
  Client --> WAS --> DB[(Database)]
\`\`\`

## 3. 주요 모듈
| 모듈 | 책임 | 핵심 기술 | 비고 |
| :---- | :---- | :---- | :---- |
|  |  |  |  |

## 4. 데이터 모델
- 핵심 엔티티:
- ER 다이어그램:

## 5. 문제점
- [ ] 문제점 1
- [ ] 문제점 2

## 6. 기술부채
- 항목 / 영향도 / 해소 방향

## 7. 참고 자료
-
`,
  },
  {
    key: 'issue',
    name: '이슈 분석',
    description: '문제점 정리용. 현상·원인·영향·심각도·재현·관련 문서.',
    category: '분석',
    icon: '🐞',
    contentMarkdown: `# {{title}} (이슈 분석)

> 작성자: {{author}} · 작성일: {{date}}

## 현상
-

## 원인 (Root Cause)
-

## 영향 범위
- 영향받는 시스템/사용자/데이터:
- 비즈니스 영향:

## 심각도
- [ ] Critical
- [ ] High
- [ ] Medium
- [ ] Low

## 재현 절차
1.
2.
3.

## 관련 문서
-
`,
  },
  {
    key: 'improvement',
    name: '개선안 제안',
    description: '개선 방안 제안용. 배경·제안·기대효과·비용·리스크·Decision 요청.',
    category: '개선',
    icon: '💡',
    contentMarkdown: `# {{title}} (개선안 제안)

> 작성자: {{author}} · 작성일: {{date}}

## 배경
- 현재 문제점:
- 개선 필요성:

## 제안 내용
-

## 기대 효과
| 항목 | 정량 효과 | 정성 효과 |
| :---- | :---- | :---- |
| 성능 |  |  |
| 비용 |  |  |
| 사용성 |  |  |

## 예상 비용
- 인력:
- 기간:
- 인프라:

## 리스크
-

## Decision 요청
> **Decision**: 본 개선안 채택 여부
> - **검토 옵션**: A) 즉시 추진 / B) 추후 검토 / C) 반려
> - **결정 사항**:
> - **근거**:
> - **담당자**: @
> - **결정일**:
`,
  },
  {
    key: 'to-be',
    name: 'TO-BE 설계',
    description: '목표 모델 정의용. 목표·아키텍처·프로세스·데이터·전환계획.',
    category: '설계',
    icon: '🎯',
    contentMarkdown: `# {{title}} (TO-BE 설계)

> 작성자: {{author}} · 작성일: {{date}}

## 목표
-

## 아키텍처
\`\`\`mermaid
flowchart TB
  subgraph TO-BE
    A[Service A] --> B[Service B]
  end
\`\`\`

## 프로세스 흐름
\`\`\`mermaid
sequenceDiagram
  Actor User
  User->>Service: 요청
  Service-->>User: 응답
\`\`\`

## 데이터 흐름
-

## AS-IS → TO-BE 전환 계획
| 단계 | 기간 | 활동 | 산출물 |
| :---- | :---- | :---- | :---- |
| 1 |  |  |  |
| 2 |  |  |  |

## 리스크 및 대응
-
`,
  },
  {
    key: 'adr',
    name: '의사결정 기록 (ADR)',
    description: 'Architecture Decision Record. 컨텍스트·결정·근거·결과·대안.',
    category: '의사결정',
    icon: '⚖️',
    contentMarkdown: `# ADR-XXX: {{title}}

> 작성자: {{author}} · 작성일: {{date}} · 상태: Proposed

## 컨텍스트
-

## 결정 (Decision)
> **Decision**:
> - **배경**:
> - **검토 옵션**:
>   - 옵션 A:
>   - 옵션 B:
>   - 옵션 C:
> - **결정 사항**:
> - **근거**:
> - **담당자**: @{{author}}
> - **결정일**: {{date}}
> - **상태**: Proposed

## 결과 (Consequences)
- 긍정:
- 부정:

## 대안 비교
| 옵션 | 장점 | 단점 | 비고 |
| :---- | :---- | :---- | :---- |
| A |  |  |  |
| B |  |  |  |
`,
  },
  {
    key: 'pending',
    name: 'Pending 항목',
    description: '보류 사안 정리용. 사안·사유·결정필요·기한·책임자.',
    category: '의사결정',
    icon: '⏸️',
    contentMarkdown: `# {{title}} (Pending)

> 작성자: {{author}} · 작성일: {{date}}

## 사안
-

## 보류 사유
-

## 결정 필요 사항
- [ ] 항목 1
- [ ] 항목 2

## 기한
-

## 책임자
- @
`,
  },
  {
    key: 'interface-spec',
    name: '인터페이스 명세',
    description: '시스템 연동 인터페이스 명세서.',
    category: '설계',
    icon: '🔌',
    contentMarkdown: `# {{title}} (인터페이스 명세)

> 작성자: {{author}} · 작성일: {{date}}

## 인터페이스 ID
- IF-XXX

## 송수신
- **송신**:
- **수신**:
- **방식**: REST / SOAP / Kafka / DB Link / 파일

## 데이터 형식
- Content-Type:
- 스키마:

\`\`\`json
{
  "field1": "string",
  "field2": 0
}
\`\`\`

## 전송 주기
- 실시간 / 배치 (yyyy-mm-dd hh:mm)

## 예외 처리
- 재시도 정책:
- 알림:
- 로깅:
`,
  },
  {
    key: 'data-mapping',
    name: '데이터 매핑',
    description: '데이터 변환 정의용. 원천·대상·룰·변환·검증.',
    category: '설계',
    icon: '🔁',
    contentMarkdown: `# {{title}} (데이터 매핑)

> 작성자: {{author}} · 작성일: {{date}}

## 원천 / 대상
- **Source 시스템**:
- **Target 시스템**:

## 매핑 룰
| Source 필드 | Target 필드 | 변환 룰 | 비고 |
| :---- | :---- | :---- | :---- |
|  |  |  |  |

## 변환 로직
-

## 검증
- 건수 비교:
- 합계 검증:
- 샘플 검증:
`,
  },
];
