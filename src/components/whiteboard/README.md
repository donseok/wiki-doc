# Whiteboard — tldraw 통합 가이드

본 디렉터리는 화이트보드(브레인스토밍 캔버스) 클라이언트 컴포넌트 위치이다.
서버 측은 `src/app/api/whiteboards/*` (CRUD + convert + vote) 가 담당한다.

## 추가 라이브러리 설치

```bash
npm install @tldraw/tldraw
```

| 라이브러리         | 용도                                       | 관련 FR           |
| :----------------- | :----------------------------------------- | :---------------- |
| `@tldraw/tldraw`   | 무한 캔버스/줌/팬/스냅/포스트잇 기본 제공  | FR-1201 ~ FR-1207 |

## 작성 예정 컴포넌트

| 파일                       | 책임                                                                |
| :------------------------- | :------------------------------------------------------------------ |
| `WhiteboardCanvas.tsx`     | tldraw 캔버스 래퍼 + 서버 동기화 (debounce 후 PUT)                  |
| `StickyToolbar.tsx`        | FR-1202 색상 팔레트(7색) + 포스트잇 추가                            |
| `VoteBadge.tsx`            | FR-1208 투표 수 배지                                                |
| `ConvertToPageDialog.tsx`  | FR-1209 페이지 변환 모달 (트리 위치 선택)                           |
| `MiniMap.tsx`              | FR-1201 우하단 미니맵                                               |

## 데이터 흐름

```
초기 로드   : GET /api/whiteboards/<id>
요소 추가   : POST /api/whiteboards/<id>/elements
요소 변경   : PATCH /api/whiteboards/<id>/elements/<elementId>
요소 삭제   : DELETE /api/whiteboards/<id>/elements/<elementId>
일괄 저장   : PUT /api/whiteboards/<id>     (debounce 1~2초)
투표        : POST/DELETE /api/whiteboards/<id>/vote
페이지 변환 : POST /api/whiteboards/<id>/convert
```

## 매핑 규약 (변환)

| tldraw shape    | DB type   | 변환 결과                |
| :-------------- | :-------- | :----------------------- |
| sticky note     | sticky    | 불릿 리스트 항목         |
| frame/group     | frame     | H2 섹션 제목             |
| arrow           | arrow     | (1차 변환 미반영)        |
| text/shape      | text/shape| 본문 free text (TODO)    |

## 메모

- tldraw 의 snapshot JSON 은 `Whiteboard.viewportJson` 에 그대로 저장 가능하지만,
  현재 스키마는 요소 단위 정규화(WhiteboardElement)로 두어 검색/투표 등 횡단 기능 용이.
- 향후 동시 편집을 도입한다면 yjs/awareness provider 추가가 필요 (1차 범위 외).
