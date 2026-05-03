# Atlas (구 PI Wiki) — 기여자 / AI 가이드

이 파일은 **AI 보조 도구(Claude Code 등)가 작업 시 참고할 컨벤션과 컨텍스트**를 담는다.

> 시스템 명칭은 Round 3(2026-05-03)에 **PI Wiki → Atlas (한글: 아틀라스)** 로 변경되었다.
> 이력 보존을 위해 본 문서의 하네스 변경 이력 / Sprint 체크리스트 / 요구사항 정의서 파일명(`PI_Wiki_요구사항정의서_v1.3.md`)은 그대로 유지한다.

## 하네스: PI Wiki 4인 개발팀 (프로젝트 전용)

**목표:** PM(리더) + Designer + Frontend Dev + Backend Dev 4인 팀이 PI Wiki에 신기능 추가 / 기존 기능 수정 / 회귀 점검을 협업으로 수행. API 계약을 매개로 FE/BE 병렬 작업.

**트리거:** PI Wiki 신기능 추가, 기능 수정, 화면 개선, API 추가, 스키마 변경, 디자인 개편, 회귀 점검 요청 시 `wiki-doc-team` 스킬 사용. "다시 실행", "디자인만 수정", "API만 변경", "이전 결과 개선" 같은 후속 요청도 포함. 단일 파일 미세 수정에는 사용하지 않는다. 글로벌 `fullstack-web-orchestrator`보다 우선 — 이 하네스는 PI Wiki 컨텍스트(FR/NFR 매핑, Edit Lock, Sprint 1~4 완료 항목, YAGNI 게이트키퍼)가 프리로드됨.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-05-03 | 초기 구성 (PM 리더 + Designer + FE + BE 4인 팀, API 계약 우선, 에이전트 팀 모드) | 전체 | wiki-doc 프로젝트 전용 팀 요청 |

## 프로젝트 컨텍스트

- **목적**: 사내 IT 시스템 문서 관리(MES / APS / ERP / CRM / 사내 IT 일반 등) 위키. 1차 출범은 PI(Process Innovation) 활동 지원이었으나 Round 3 부터 도메인 범용 위키로 확장. 30명 규모, 4주 4스프린트 일정.
- **스택**: Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui (직접 작성, CLI 미사용) + TipTap (Sprint 2~) + tldraw (Sprint 4~) + PostgreSQL 16 (pgvector + pg_trgm) + Prisma 5.
- **인증**: 1차 미적용. `getCurrentUserServer()` 추상화로 향후 SSO 도입.
- **요구사항 정의서**: `PI_Wiki_요구사항정의서_v1.3.md` (FR-XXX, NFR-XXX 코드로 모든 기능 추적).

## 핵심 설계 원칙

1. **요구사항 정의서를 진실의 원천(SRS)으로**: 새 기능을 추가/수정할 때 반드시 정의서의 FR-XXX 코드를 먼저 식별하고, 코드 주석에 명시.
2. **YAGNI**: 30명 사내 환경에 과도한 인프라/추상화는 도입하지 않는다. (외부 검토 의견 v1.3 §부록 D 참고: 화이트보드 Object Storage 분리, CDN 등 반려된 항목 다수)
3. **점진적 강화**: 마크다운 에디터 → TipTap, ILIKE 검색 → FTS+pg_trgm, 첨부 → PDF.js/SheetJS 통합 — 각 단계가 동작 가능한 상태로 출하.
4. **Edit Lock 우선**: 동시 편집(co-editing)은 명시적 제외. Lock 모델로 충돌 방지 (FR-215/216).

## 디렉터리 컨벤션

| 위치 | 책임 |
| :--- | :--- |
| `src/app/(main)/**` | 3-Column 레이아웃이 적용되는 사용자 라우트. `dynamic = 'force-dynamic'` 필수. |
| `src/app/api/**` | API Routes. `runtime = 'nodejs'` + `dynamic = 'force-dynamic'` 명시. |
| `src/components/ui/**` | shadcn 스타일 primitive. 기능 컴포넌트와 분리 유지. |
| `src/components/{feature}/**` | 기능별 컴포넌트 (`page/`, `tree/`, `editor/`, `whiteboard/` 등). |
| `src/lib/**` | 환경/상태 의존 없는 순수 헬퍼. (`db.ts`, `edit-lock.ts`, `templates.ts`, `api.ts`, `current-user.ts`) |
| `src/server/**` | 서버 전용 데이터/시드 정의 (`pi-default-tree.ts`, `default-templates.ts`). |
| `src/types/index.ts` | UI 공유 타입. Prisma 타입은 `@prisma/client`에서 직접 import. |
| `prisma/schema.prisma` | 단일 진실의 원천. 변경 시 `npm run db:migrate` 로 마이그레이션 생성. |

## 코드 컨벤션

### TypeScript
- `strict: true` 유지.
- 함수형 컴포넌트 + named export 선호 (default export는 페이지/레이아웃에만).
- 에러는 `Error` 또는 도메인 전용 클래스(`LockConflictError` 등)로 던지고, API 라우트는 `handleError()`로 처리.

### React / Next.js
- 페이지는 가능한 한 **Server Component**로. 인터랙션이 필요하면 `'use client'` 컴포넌트를 분리해 children으로 주입.
- `force-dynamic`을 명시 — Sprint 1 기준 캐싱 전략은 도입하지 않음.
- 폼 검증은 Zod (`src/lib/api.ts#parseJson`).

### API 라우트
- 모든 라우트 상단에:
  ```ts
  export const runtime = 'nodejs';
  export const dynamic = 'force-dynamic';
  ```
- 응답은 `ok(data)` / `fail(message, status)` 헬퍼 사용.
- DB 변경은 `prisma.$transaction([...])` 우선 — 부분 실패 방지.

### 스타일
- Tailwind utilities + `cn()` 헬퍼.
- 색상 토큰은 `globals.css` 의 CSS 변수 (`--status-*`, shadcn 표준).
- 한국어 UI 우선 (NFR-403). 마크다운 본문 폰트는 시스템 한글 우선 스택.

### Prisma
- `id`는 `cuid()`. 외부 키는 `String?` (nullable 명시).
- 관계는 양방향 명시 (역방향 필드 누락 금지).
- `Json` 필드는 가능한 한 zod로 검증된 형태로만 저장.

### 마이그레이션 / 시드
- 스키마 변경 시 PR 단위로 1개 마이그레이션. 이름은 `_<purpose>` (예: `_add_edit_session`).
- 시드는 `prisma/seed.ts` 의 `upsert` 패턴으로 멱등성 보장.

## 작업 패턴

### 기능 추가 시
1. 요구사항 정의서에서 FR-XXX 식별.
2. `prisma/schema.prisma` 변경 필요 여부 확인 → 변경 시 `npm run db:migrate -- --name <purpose>`.
3. API 라우트 작성 (`src/app/api/...`) — Zod 스키마 + 트랜잭션.
4. UI 컴포넌트 작성 — Server Component 기본, `'use client'` 최소화.
5. `npx tsc --noEmit` + 수동 동작 확인.

### Edit Lock 사용
- 페이지 본문 수정 API는 반드시 Lock 보유자 검증을 포함 (`src/app/api/pages/[id]/route.ts` 참고).
- 클라이언트는 진입 시 `acquire`, 60초 주기 `heartbeat`, 이탈 시 `release` (sendBeacon).

### 사용자 식별
- 서버: `getCurrentUserServer()` (헤더 → 쿠키 → 환경변수)
- 클라이언트: `getCurrentUser()` (localStorage → 환경변수)
- 향후 SSO 도입은 이 두 함수만 교체.

## 향후 스프린트 시작 시 체크리스트

### Sprint 2 — ✅ 완료 (2026-05-03)
- [x] TipTap 의존성 설치 (8개 익스텐션 + lowlight + marked + turndown)
- [x] `src/components/editor/tiptap-editor.tsx` 신규 — 슬래시 메뉴/툴바/마크다운 토글/이미지 자동 업로드
- [x] `src/lib/markdown-html.ts` — marked/turndown 양방향 변환 (체크박스/표/하이라이트/취소선)
- [x] `src/components/markdown/mermaid.tsx` 동적 import + 다크모드 추적
- [x] `src/components/page/markdown-view.tsx` — `code`(Mermaid) + `img`(Lightbox) + `a`(AttachmentCard) override
- [x] `src/lib/search.ts` — `to_tsvector` FTS + `pg_trgm` similarity raw SQL
- [x] 첨부 컴포넌트 6종 (`upload-dropzone`, `attachment-card`, `lightbox`, `pdf-preview-dialog`, `excel-preview-dialog`, `attachment-panel`)
- [x] `src/components/tree/sortable-tree-menu.tsx` — @dnd-kit flat 트리 + 키보드 sensor
- [x] `src/components/page/tag-editor.tsx` + `/api/pages/[id]/tags`
- [x] `src/lib/action-items.ts` 의 `syncActionItems` 를 `/api/pages/[id]` PUT 에 hook
- [x] `/api/me`, `/api/healthz` 운영 엔드포인트

### Sprint 3 — ✅ 완료 (2026-05-03)
- [x] 코멘트 풀스택 (페이지 + 인라인 TipTap mark + 스레드 + Resolve + 이모지 + @멘션)
- [x] Decision NodeView + 자동 sync + `/decisions` 모아보기 + 슬래시 메뉴 통합
- [x] 칸반 4컬럼 DnD + 7색 + 카드 코멘트 + 카드→페이지 승격(템플릿 옵션)
- [x] 알림 헤더 벨 폴링(15s) + 미읽음 카운트 + 일괄 읽음
- [x] Action Items 대시보드 위젯 + `/action-items` 모아보기
- [x] 버전 Diff(jsdiff 줄단위) + 2개 선택 비교 + 복원
- [x] Watch UI(페이지 헤더 + `/watches`) + 자동 알림 발송
- [x] 단축키 Ctrl+K / Ctrl+/ + 도움말 다이얼로그
- [x] `/api/users` 멘션 자동완성 디렉터리

### 다크모드 (NFR-405) — ✅ 완료 (2026-05-03)
- [x] `src/components/theme-provider.tsx` — Theme Context (light/dark/system) + `themeInitScript` (FOUC 방지)
- [x] `src/components/theme-toggle.tsx` — 헤더 드롭다운, lucide Sun/Moon/Monitor
- [x] `src/app/layout.tsx` — `<head>` 에 inline init script + `<ThemeProvider>` 래핑
- [x] 헤더 `NotificationBell` 옆에 `ThemeToggle` 통합
- [x] 설정 페이지 — 자체 테마 토글을 useTheme hook 으로 통합 (시스템 모드 추가)
- [x] localStorage `pi-wiki:theme` + 쿠키 `pi-wiki-theme` 동기화 → SSR/CSR 일치
- [x] system 모드: `matchMedia('(prefers-color-scheme: dark)')` 변경 자동 추적

### Sprint 4 — ✅ 완료 (2026-05-03)
- [x] `tldraw` v3.15.6 설치 + `html-to-image`, `jszip`
- [x] `src/components/whiteboard/whiteboard-canvas.tsx` — tldraw 통합, 자동 저장(5s idle), Ctrl+S, PNG 내보내기, 시작 템플릿 6종
- [x] `src/components/whiteboard/convert-to-page-dialog.tsx` + `/api/whiteboards/[id]/convert` — Frame→H2, Note→불릿 마크다운 생성
- [x] `src/components/whiteboard/whiteboard-templates.ts` — 빈/SWOT/Fishbone/4P/Empathy/2x2
- [x] `/templates` 페이지 — 시스템/사용자 템플릿 관리 + 변수 자동 추출 + 미리보기 (FR-212/213)
- [x] `/admin` 페이지 (탭 3) — 태그 관리(FR-805) + 백업/내보내기(NFR-204) + 감사 로그(NFR-304)
- [x] `/api/admin/export` (JSON + Markdown ZIP), `/api/admin/audit`, `/api/tags/[id]`, `/api/templates/[id]`
- [x] AI Export 강화 — `?include=...&download=1`, 클립보드 복사, 미리보기
- [x] 대시보드 위젯 4종 — Decision/활동피드/내 작성/통계
- [x] 시드에 샘플 화이트보드 포함 (자유 작업공간 하위)

### 이후 단계 (Sprint 5+ 예비)
- [ ] 동시 편집 — 외부 검토 v1.3 §부록 D 에서 명시 제외. 도입 시 tldraw 의 sync 패키지 활용
- [ ] 사내 SSO 연동 — `getCurrentUserServer()` 와 `getCurrentUser()` 만 교체
- [ ] 모바일 전용 UI — 현재 데스크탑 우선. 태블릿은 가능
- [ ] pgvector 임베딩 적용 — RAG 도입 시 (Page.embedding 컬럼은 이미 준비됨, NFR-504)
- [ ] CI/CD — 사내 GitLab CI 연동
- [ ] 사내 메신저(Teams) webhook — Notification 발행 시 외부 발송

## 절대 하지 말 것 (외부 검토 v1.3 결정 사항)

| 금지 사항 | 사유 |
| :--- | :--- |
| 화이트보드 Object Storage 분리 (S3 등) | 30명 규모에 과도. 사내 로컬 볼륨 충분. |
| LDAP/AD 인증 1차 도입 | 1차 명시적 제외. 2차 SSO. |
| CDN 도입 | 사내 인트라넷 환경. |
| 실시간 동시 편집 | 명시 제외. Edit Lock 으로 충돌 방지. |
| 매크로/플러그인 시스템 | 30명 규모에 과도한 복잡성. |

## 검증 / 테스트

- **타입 검사**: `npm run typecheck` (Sprint 1 통과 보장).
- **수동 시나리오 (Sprint 1 데모)**:
  1. `/dashboard` 진입 → 통계/위젯 표시
  2. 사이드바 트리에서 PI 기본 메뉴 확인
  3. 폴더 우클릭 → 새 페이지 → 회의록 템플릿 선택 → 제목 입력 → 생성
  4. 생성된 페이지 진입 → 편집 → 본문 작성 → 자동 저장 확인
  5. 다른 브라우저로 같은 페이지 접근 → "○○ 님이 편집 중" 안내 확인
  6. 강제 해제 테스트 → 알림 생성 확인

## 외부 도구 / 통합

- **Prisma Studio**: `npm run db:studio` → http://localhost:5555 — 데이터 조회/편집.
- **Docker logs**: `npm run docker:logs` — DB 활동 감시.
- **AI Export**: `GET /api/export?format=json` — 외부 AI 도구가 위키를 읽을 수 있는 표준 스키마.

---

> 본 가이드는 살아있는 문서. 새 컨벤션 도입 시 PR과 함께 업데이트 권장.
