# PI Wiki

**MES / APS PI — 위키 기반 지식 허브**

요구사항 정의서 v1.3 기반의 점진적 개발 프로젝트. 1차 4주(스프린트 4회)로 30명 규모 사내 PI 활동을 지원하는 위키 + 칸반 + 화이트보드 통합 시스템을 구축한다.

> 📄 전체 요구사항: [PI_Wiki_요구사항정의서_v1.3.md](./PI_Wiki_요구사항정의서_v1.3.md)
> 📐 기여자/AI 가이드: [CLAUDE.md](./CLAUDE.md)

---

## 빠른 시작

### 1) 사전 준비
- **Node.js 22.x** (작업 환경 확인 완료)
- **Docker Desktop** ([Windows 다운로드](https://www.docker.com/products/docker-desktop/)) — PostgreSQL + pgvector 컨테이너 구동에 필수
- **Git** (선택)

### 2) 의존성 설치 (이미 완료된 경우 생략)
```powershell
npm install
```

### 3) 환경 변수
`.env` 파일이 이미 생성되어 있습니다. 필요 시 수정:
```env
DATABASE_URL="postgresql://piwiki:piwiki@localhost:5432/piwiki?schema=public"
EDIT_LOCK_TIMEOUT_MINUTES=5
DEFAULT_USER_NAME="익명"
OPENAI_API_KEY=""
OPENAI_MODEL="gpt-5.5"
OPENAI_EMBEDDING_MODEL="text-embedding-3-small"
OPENAI_EMBEDDING_DIMENSIONS=1536
MAX_CHAT_CONTEXT_CHARS=16000
AI_AUTO_INDEX_ON_SAVE=false
```

### 4) 데이터베이스 기동
```powershell
# Docker Desktop 이 실행된 상태에서
npm run docker:up

# 컨테이너 상태 확인
docker compose ps

# (옵션) 로그 보기
npm run docker:logs
```

### 5) DB 마이그레이션 + 시드
```powershell
# 스키마 적용
npm run db:migrate

# PI 기본 트리 + 페이지 템플릿 10종 + 기본 보드 시드
npm run db:seed
```

### 6) 개발 서버
```powershell
npm run dev
# → http://localhost:3000
```

---

## 주요 명령어

| 명령 | 설명 |
| :--- | :--- |
| `npm run dev` | Next.js 개발 서버 (localhost:3000) |
| `npm run build` | 프로덕션 빌드 |
| `npm run start` | 프로덕션 서버 (build 이후) |
| `npm run typecheck` | TypeScript 타입 검사 |
| `npm run lint` | ESLint |
| `npm run db:generate` | Prisma client 재생성 |
| `npm run db:migrate` | 개발 마이그레이션 (`prisma migrate dev`) |
| `npm run db:migrate:deploy` | 프로덕션 마이그레이션 |
| `npm run db:push` | 스키마 강제 동기화 (마이그레이션 미생성) |
| `npm run db:seed` | 초기 시드 (PI 트리/템플릿/보드) |
| `npm run db:studio` | Prisma Studio (브라우저 DB 탐색기) |
| `npm run db:reset` | DB 리셋 + 재시드 |
| `npm run docker:up` | PostgreSQL 컨테이너 기동 |
| `npm run docker:down` | 컨테이너 중지 |
| `npm run docker:logs` | DB 로그 추적 |

---

## 디렉터리 구조

```
wiki-doc/
├── docker/
│   ├── postgres/init.sql        # pgvector + pg_trgm 확장 활성화
│   └── postgres-data/           # DB 볼륨 (gitignore)
├── prisma/
│   ├── schema.prisma            # 전 엔티티 정의 (24개)
│   └── seed.ts                  # PI 기본 트리 + 템플릿 시드
├── src/
│   ├── app/
│   │   ├── (main)/              # 3-Column 레이아웃이 적용되는 라우트
│   │   │   ├── dashboard/
│   │   │   ├── pages/[id]/
│   │   │   │   ├── page.tsx             # 뷰어
│   │   │   │   ├── edit/page.tsx        # 마크다운 에디터
│   │   │   │   └── history/page.tsx     # 버전 이력
│   │   │   ├── search/
│   │   │   ├── tags/
│   │   │   ├── boards/
│   │   │   ├── whiteboards/[id]/
│   │   │   ├── notifications/
│   │   │   └── settings/
│   │   ├── api/
│   │   │   ├── tree/                    # GET/POST, PATCH/DELETE, reorder
│   │   │   ├── pages/[id]/              # GET/PUT/DELETE + lock + versions
│   │   │   ├── templates/
│   │   │   ├── search/
│   │   │   ├── attachments/             # Excel/PDF/PPT 업로드
│   │   │   ├── decisions/, action-items/, watch/, notifications/
│   │   │   ├── tags/, boards/, cards/
│   │   │   ├── whiteboards/[id]/        # PUT/elements/vote/convert
│   │   │   ├── export/                  # FR-1009 AI 친화 JSON
│   │   │   └── dashboard/               # 위젯 집계
│   │   ├── globals.css
│   │   ├── layout.tsx
│   │   └── page.tsx                     # /dashboard 로 redirect
│   ├── components/
│   │   ├── ui/                          # shadcn 스타일 primitive (Button, Dialog 등)
│   │   ├── layout/                      # Header, Sidebar
│   │   ├── tree/                        # SortableTreeMenu (@dnd-kit DnD)
│   │   ├── page/                        # PageHeader, MarkdownView, EditLockBanner ...
│   │   ├── attachments/README.md        # PDF.js, SheetJS 통합 가이드
│   │   ├── whiteboard/README.md         # tldraw 통합 가이드
│   │   └── markdown/mermaid.tsx         # Mermaid 렌더 (FR-214)
│   ├── lib/
│   │   ├── db.ts                        # Prisma client singleton
│   │   ├── edit-lock.ts                 # FR-215/216
│   │   ├── templates.ts                 # FR-213 변수 치환
│   │   ├── search.ts, attachments.ts, action-items.ts, notify.ts
│   │   ├── api.ts                       # NextResponse 헬퍼 (ok/fail/parseJson)
│   │   ├── current-user.ts
│   │   └── utils.ts                     # cn(), formatBytes()
│   ├── server/
│   │   ├── pi-default-tree.ts           # FR-104 기본 메뉴 구조
│   │   └── default-templates.ts         # FR-211 기본 10종 템플릿
│   └── types/index.ts
├── docker-compose.yml
├── Dockerfile
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.mjs
├── components.json                      # shadcn 설정
├── .env, .env.example
└── PI_Wiki_요구사항정의서_v1.3.md
```

---

## 스프린트 진행 현황

| 스프린트 | 상태 | 핵심 성과 |
| :--- | :--- | :--- |
| **S1** MVP 기반 | ✅ 구현 완료 | Docker(pgvector) · 24개 엔티티 스키마 · 3-Column 레이아웃 · 트리 메뉴 (CRUD/우클릭) · 페이지 CRUD · **Edit Lock(FR-215/216)** · 마크다운 에디터(분할 미리보기, 자동저장, Ctrl+S) · **페이지 템플릿 10종** · PI 기본 트리 시드 · 대시보드 · 버전 이력 · 상태 관리 |
| **S2** 위키 핵심 + 첨부 강화 | ✅ 구현 완료 | **TipTap 리치텍스트 에디터** (슬래시 메뉴 / 툴바 / 마크다운 토글 / 클립보드 이미지 / 표·체크박스·코드블록·Decision 블록 · `marked`+`turndown` 양방향 변환) · **Mermaid 다이어그램(FR-214)** · **Excel/PDF/Word/PPT/zip 첨부(FR-1104)** · **PDF.js 인라인 미리보기(FR-1106)** · **SheetJS Excel/CSV 미리보기(FR-1107)** · 라이트박스(FR-1102) · 첨부 패널(FR-1109) · **검색 FTS 강화(to_tsvector + pg_trgm similarity, FR-302)** · **트리 DnD(FR-103, @dnd-kit)** · 태그 자동완성/관리(FR-801~805) · Action Items 자동 추출(FR-1007) · `/api/me`, `/api/healthz` |
| **S3** 협업 기능 | ✅ 구현 완료 | **코멘트(FR-501~506)**: 페이지 + 인라인(TipTap mark) + 스레드 답글 + Resolve + 이모지 반응 + @멘션 자동완성 · **Decision 블록(FR-507/508)**: TipTap NodeView + 상태 변경 + 모아보기 페이지 + 자동 sync · **Action Items 위젯(FR-1007)**: 대시보드 + 전체 페이지 · **버전 Diff(FR-403)**: jsdiff 줄단위 + 복원(FR-404) · **칸반 보드(FR-601~608)**: 4컬럼 DnD + 7색 + 카드 코멘트(FR-606) + 카드→페이지 승격(FR-605) · **Watch(FR-905/906)**: 페이지/폴더 구독 + 자동 알림 발송 + /watches 관리 · **알림(FR-901~903)**: 헤더 벨 폴링(15s) + 미읽음 카운트 + 일괄 읽음 + 인라인 알림 패널 · **단축키(NFR-404)**: Ctrl+K 검색 / Ctrl+/ 도움말 |
| **S4** 화이트보드 + 안정화 | ✅ 구현 완료 | **tldraw v3 무한 캔버스(FR-1201~1213)**: 포스트잇/Frame/화살표/도형/텍스트 · 자동 저장(5s idle) + Ctrl+S · **시작 템플릿 6종**(빈/SWOT/Fishbone/4P/Empathy/2x2) · **PNG 내보내기(FR-1212)** · **화이트보드 → 페이지 변환(FR-1209)** (Frame→H2, Note→불릿) · **사용자 정의 템플릿 UI(FR-212/213)** `/templates` 관리(편집/삭제/변수 자동 추출/미리보기) · **관리자 도구(/admin)**: 태그 병합·삭제(FR-805), 백업/내보내기(NFR-204) JSON+Markdown(zip), 감사 로그 뷰어(NFR-304) · **AI Export 강화(FR-1009)**: include 부분 export + 클립보드 복사 + 샘플 미리보기 · **대시보드 위젯**: Decision 모아보기(FR-1008), 활동 피드(FR-1006), 내 작성 문서(FR-1003), 통계(FR-1005) · 시드에 샘플 화이트보드 포함 |

> ✅ = 모든 FR 항목 통합 완료, build/typecheck pass.

---

## Sprint 4 신규 완성 기능 (FR 매핑)

### 화이트보드 (FR-1201~1213) — `/whiteboards/[id]`
- **FR-1201** tldraw v3 무한 캔버스 — 점 격자, 줌/팬, 미니맵, 모든 기본 도구
- **FR-1202** 포스트잇 (note shape) — 7색 native (yellow/blue/green/red/violet/orange/light-* 변형)
- **FR-1203** 자유 드래그/리사이즈 + 스냅 가이드 (tldraw 내장)
- **FR-1204** 그룹 박스 (Frame shape) — 제목 부여, 그룹 이동 시 내부 함께 이동
- **FR-1205** 화살표/연결선 — 직선/곡선, 자동 추적
- **FR-1206** 텍스트/도형 — 사각형/원/삼각형/오각형/별 등 18종
- **FR-1207** 이모지 스티커 — note 에 이모지 텍스트 형태 (단순화)
- **FR-1209** **화이트보드 → 페이지 변환** — Frame→H2, Note→불릿, Text→인용. 원본 보존, `WhiteboardConversion` 이력 기록
- **FR-1210** TreeNode `type: 'whiteboard'` 로 트리에서 일반 페이지처럼 관리
- **FR-1212** **PNG 내보내기** — `editor.toImage(shapes, { format: 'png' })`
- **FR-1213** **시작 템플릿 6종** — 빈 / SWOT / Fishbone(4M+1E) / 4P / Empathy Map / 2x2 매트릭스. 드롭다운에서 적용

### 사용자 정의 템플릿 (FR-212/213)
- **`/templates` 관리 페이지** — 시스템/사용자 그룹, 카테고리 필터, 편집 폼 + 미리보기
- 변수 자동 추출 — `{{var}}` 패턴 검출
- 시스템 템플릿(`isSystem: true`)은 수정/삭제 보호 (PATCH/DELETE 거부)

### 관리자 도구 (`/admin`) — 탭 3개
- **태그 관리(FR-805)** — 사용 빈도 표시, **이름 변경 / 다른 태그로 병합 / 삭제**. 트랜잭션으로 PageTag 일괄 이전 후 원본 삭제
- **백업/내보내기(NFR-204)**:
  - JSON 일괄 — `GET /api/admin/export?format=json`
  - Markdown ZIP — `GET /api/admin/export?format=markdown` (jszip 동적 import + .md concat fallback)
- **감사 로그 뷰어(NFR-304)** — entity/action/actor 필터, offset 페이지네이션. 태그/페이지 변경 이력

### AI 친화 Export (FR-1009)
- **응답 스키마 v1.3** — `{ exportedAt, version, wiki, tree, pages, decisions, actionItems, comments }`
- **부분 export** `?include=tree,pages,decisions,actionItems,comments`
- **3가지 트리거** — 다운로드 / 클립보드 복사 (외부 AI 즉시 붙여넣기) / 샘플 미리보기 다이얼로그

### 위키 챗봇 MVP
- **전역 챗 패널** — 우하단 [챗봇] 버튼에서 열림. `/pages/[id]` 화면에서는 현재 문서를 우선 문맥으로 사용
- **API** — `POST /api/chat { message, pageId?, history? }`
- **검색 방식** — `PageChunk` 청크 인덱스를 만들고, pgvector 사용 가능 시 벡터 검색을 우선 사용. 벡터 인프라/API Key가 없으면 기존 PostgreSQL FTS + pg_trgm 검색으로 fallback
- **응답 정책** — 제공된 위키 컨텍스트에 근거해 답변하고, 출처 문서 링크를 함께 반환
- **재색인** — `GET /api/chat/reindex` 로 상태 확인, `POST /api/chat/reindex { "limit": 200 }` 로 전체 재색인, `POST /api/chat/reindex { "pageId": "..." }` 로 단일 페이지 재색인
- **자동 재색인** — 저장 시 즉시 재색인하려면 `.env` 에 `AI_AUTO_INDEX_ON_SAVE=true` 설정. 기본값은 비용/저장 지연 방지를 위해 `false`

### 대시보드 위젯 (FR-1003/1005/1006/1008)
- **Decision 모아보기**(FR-1008) — 상태별 카운트 + 최근 5건
- **활동 피드**(FR-1006) — PageStatusLog + DecisionStatusLog + Comment + ActionItem + Page.updatedAt 합성, 최근 30건
- **내 작성 문서**(FR-1003) — Page.authorName=me + 본인 PageVersion 의 distinct 페이지
- **통계**(FR-1005) — 전체/상태별 분포/최근 7일 활동량 (CSS 막대그래프)

### 시드 보강
- 자유 작업공간 폴더 하위에 **샘플 화이트보드** 자동 생성

---

## Sprint 3 신규 완성 기능 (FR 매핑)

### 코멘트 (FR-501~506)
- **FR-501** 페이지 우측 코멘트 패널 — 데스크탑 사이드 / 모바일 토글 (lazy mount)
- **FR-502** 본문 텍스트 선택 → floating toolbar [코멘트 추가] → TipTap **InlineCommentMark** 로 본문 하이라이트(노란 형광펜 / Resolved 시 회색)
- **FR-503** 스레드 답글 (parentId 트리)
- **FR-504** **@멘션 자동완성** — `/api/users` 의 distinct 작성자 + 자유 입력. 멘션 대상에게 알림 자동 생성
- **FR-505** Resolved 토글 — '해결됨 보기' 필터로 숨김/표시
- **FR-506** 이모지 반응 (👍 ❤️ 😄 ✅ ❓ ⚠️) — `reactions` JSON 토글, 본인 클릭 시 추가/제거

### Decision 블록 (FR-507/508)
- **FR-507** TipTap **NodeView** — 헤더(아이콘 + 제목 + 상태 selectbox) + 본문(배경/검토옵션/결정사항/근거/담당자/결정일). 좌측 상태별 색상 띠
- **FR-508** 상태 변경 (Proposed → Accepted / Rejected / Superseded) — `DecisionStatusLog` 자동 기록
- **자동 sync** — `/api/pages/[id]` PUT 시 본문 JSON 의 `decisionBlock` 노드들을 DB와 동기화. 신규 노드는 decisionId 자동 부여 후 클라이언트 응답에 주입.
- **모아보기** — `/decisions` 페이지: 상태/기간/소유자 필터 + 통계
- **슬래시 메뉴** `/decision` 항목으로 즉시 삽입

### Action Items (FR-1007)
- **자동 추출** — 페이지 본문의 `- [ ] @user 내용` 패턴을 `syncActionItems` 가 DB와 동기화 (Sprint 2에서 이미 hook 됨)
- **대시보드 위젯** — 본인에게 멘션된 항목, 완료/미완료 토글, 페이지 바로가기
- **`/action-items` 페이지** — 전체 모아보기 + 일괄 완료 처리, assignee/completed/dueDate 필터

### 버전 Diff / 복원 (FR-403/404)
- **`diffLines` 줄단위 Diff** — 추가(녹), 삭제(적), unchanged 컨텍스트만 일부 표시
- **2개 버전 선택 → [비교]** 모달
- **[복원]** — 해당 버전을 새 버전으로 적용 (`PUT /api/pages/[id]/versions/[versionId] { action: 'restore' }`)

### 칸반 보드 (FR-601~608)
- **4컬럼 DnD** (Idea / Discussing / Pending / Resolved) — `@dnd-kit/sortable`
- **카드 색상** 7색 프리셋 (FR-604)
- **카드 코멘트** (FR-606) — `POST /api/cards/[id]/comments`
- **카드 → 페이지 승격** (FR-605) — 트리 위치 + 템플릿 선택 가능. 카드 본문이 페이지 본문에 결합
- **카드 검색** + 키보드 단축키
- **빈 컬럼 드롭** 지원 + 드래그 인디케이터

### Watch / 구독 (FR-905/906)
- **페이지 헤더 [구독] 버튼** — 페이지만 / 폴더+하위 전체
- **`/watches` 페이지** — 내 구독 목록 + 해제
- **자동 알림 발송** — 페이지 변경 / 상태 변경 시 watcher 와 includeChildren 폴더 watcher 에 일괄 Notification

### 알림 (FR-901~903)
- **헤더 벨 아이콘** — 15초 폴링, 미읽음 카운트(99+ 표시), 알림 뱃지 색상
- **Popover 미니 뷰** — 최근 10건, 클릭 시 페이지 이동, 일괄 읽음
- **`/notifications` 전체 보기**

### 단축키 (NFR-404)
- **Ctrl+K** 검색 포커스
- **Ctrl+/** 단축키 도움말 다이얼로그 (전역/에디터/트리·페이지 분류)

### 멘션 자동완성용 사용자 디렉터리
- **`/api/users`** — 페이지/코멘트 작성자 distinct + 시스템 사용자

---

## Sprint 2 신규 완성 기능 (FR 매핑)

### 에디터 / 본문 (FR-201~214)
- **FR-201** 블록 기반 WYSIWYG (TipTap) — 제목/리스트/체크박스/표/코드블록/구분선/하이라이트/링크/이미지
- **FR-202** 마크다운 ↔ 리치텍스트 양방향 토글 (`marked` + `turndown`)
- **FR-203** 이미지 — 드래그앤드롭 / 클립보드 / 파일선택
- **FR-204** 표 (resizable, header row)
- **FR-205** 코드 블록 + 언어 지정 + lowlight 문법 강조
- **FR-206** (Sprint 3에서 위키 링크 자동완성 도입 예정)
- **FR-208** 자동 저장 (5초 idle, Ctrl+S)
- **FR-214** Mermaid 다이어그램 — 코드블록 ```mermaid 자동 렌더, 다크모드 자동 추적

### 슬래시 명령어 (`/`)
- 제목 1/2/3, 목록, 번호 매기기, 체크박스, 인용, 코드블록, **Mermaid**, 구분선, 표(3x3), **Decision 블록**, 이미지 업로드

### 첨부 파일 (FR-1101~1109)
- **FR-1101** 이미지 업로드 (드래그·클립보드·파일선택, 10MB 제한)
- **FR-1102** 라이트박스 (이미지 클릭 → 모달 + 좌우 화살표)
- **FR-1104** Excel(xlsx/xls/csv) / PDF / Word(docx) / PPT(pptx) / 압축(zip) / 텍스트 첨부, 50MB 제한
- **FR-1105** 첨부 카드 (아이콘 / 파일명 / 크기 / 업로드일시 / 업로더)
- **FR-1106** PDF.js 인라인 미리보기 (페이지 네비게이션)
- **FR-1107** SheetJS Excel/CSV 미리보기 (시트 탭, 상위 100행)
- **FR-1108** 첨부 파일명 검색 통합
- **FR-1109** 페이지 첨부 파일 패널 (사이드 다이얼로그)

### 검색 (FR-301~305)
- **FR-302** PostgreSQL `to_tsvector('simple')` FTS + `pg_trgm` similarity 조합. 한국어 부분 일치 보강 (pg_bigm 미설치 환경에서도 동작)
- **FR-303** 클라이언트 측 검색어 하이라이트
- **FR-304** 상태 / 태그 / 스페이스 필터
- **FR-305** 정렬 옵션 (relevance / recent / title)

### 트리 / 태그 (FR-103, FR-801~805)
- **FR-103** @dnd-kit 기반 정렬 가능 트리 (같은 부모 내 순서 변경, 다른 부모로 이동, 인디케이터)
- **FR-801~805** 태그 자동완성 입력기 (Enter/콤마 추가, X 제거), 페이지 헤더에 인라인 표시

### 운영
- `GET /api/me` — 현재 사용자명 조회 (향후 SSO 도입 지점)
- `GET /api/healthz` — DB 헬스체크 (컨테이너 probe / 모니터링용)

---

## Sprint 1 완성 기능 (FR 매핑)

### 트리 / 네비게이션
- **FR-101** 무제한 깊이 트리 메뉴
- **FR-102** 트리 노드 추가/이름변경/삭제 (우클릭 메뉴)
- **FR-104** PI 기본 템플릿 자동 생성 (시드)
- **FR-105** 사용자 정의 자유 구성
- **FR-106** 트리 펼침 상태 localStorage 저장
- **FR-107** 트리 내 빠른 검색
- **FR-108** 즐겨찾기 (localStorage)
- **FR-109** 최근 본 문서

### 문서 작성
- **FR-201/202** 마크다운 에디터 + 미리보기 (Sprint 2에서 TipTap으로 교체)
- **FR-203** 이미지 첨부 (Sprint 2 UI 통합)
- **FR-207** 메타정보 (작성자/일시/상태/태그)
- **FR-208** 자동 저장 (5초 idle)
- **FR-211** 페이지 템플릿 10종
- **FR-213** 템플릿 변수 ({{date}}, {{author}}, {{title}})
- **FR-215** Edit Lock (5분 timeout, 10초 heartbeat)
- **FR-216** Edit Lock 강제 해제 + 알림

### 버전 / 상태 / 태그
- **FR-401** 자동 버전 저장
- **FR-402** 버전 이력 조회
- **FR-701~705** 상태 5종 (Draft/Review/Approved/Pending/Archived)
- **FR-703** 상태 변경 이력
- **FR-705** Pending 사유 입력
- **FR-801~804** 태그 (Sprint 2~3 UI 통합)

### 대시보드
- **FR-1001/1002/1004** 메인 대시보드 (최근 변경, Pending, 통계)

### 인프라 (NFR)
- **NFR-501** 데이터 규모 — 1만 문서 기준 인덱스 설계
- **NFR-502** 인증 확장 — getCurrentUser() 추상화로 SSO 도입 용이
- **NFR-504** pgvector 확장 활성화 + Page.embedding(vector(1536)) 컬럼 (1차 미사용)

---

## 운영

### 1차 운영 (사내 단일 서버)
```powershell
# 1) 서비스 빌드 및 기동
docker compose --profile app up -d --build

# 2) 마이그레이션 자동 실행 (Dockerfile CMD 에 포함)
# 3) 시드는 수동 실행
docker compose exec app npx tsx prisma/seed.ts
```

### 백업 (NFR-202)
```powershell
# DB 덤프
docker compose exec postgres pg_dump -U piwiki piwiki > backups/piwiki-$(Get-Date -Format yyyyMMdd).sql

# 업로드 디렉터리
Compress-Archive -Path docker/uploads -DestinationPath backups/uploads-$(Get-Date -Format yyyyMMdd).zip
```

### 데이터 내보내기 (NFR-204, FR-1009)
- 관리자가 `/settings` 페이지에서 [JSON 내보내기] 버튼 → `GET /api/export?format=json`
- 외부 AI 도구(Claude Code, Cursor 등)가 표준 스키마로 위키 데이터를 읽을 수 있음

---

## 라이선스 / 기여

- 사내 PI TF 전용 시스템.
- 코드 작성 가이드는 [CLAUDE.md](./CLAUDE.md) 참조.
