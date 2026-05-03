# Attachments — 첨부 파일 컴포넌트 통합 가이드

본 디렉터리는 첨부 파일의 **클라이언트 측 미리보기/렌더링** 컴포넌트들이 위치할 곳이다.
서버 측 업로드/저장/다운로드는 `src/app/api/attachments/*` 와 `src/lib/attachments.ts` 가 담당한다.

## 추가 라이브러리 설치

```bash
npm install pdfjs-dist xlsx
```

| 라이브러리      | 용도                                  | 관련 FR  |
| :-------------- | :------------------------------------ | :------- |
| `pdfjs-dist`    | PDF 인라인 미리보기 (모달 내 렌더)    | FR-1106  |
| `xlsx` (SheetJS)| Excel/CSV 첫 시트 100행 미리보기      | FR-1107  |

## 작성 예정 컴포넌트

| 파일                       | 책임                                                                |
| :------------------------- | :------------------------------------------------------------------ |
| `AttachmentCard.tsx`       | FR-1105 카드 표시 (파일명/아이콘/크기/업로드일시)                   |
| `PdfViewer.tsx`            | FR-1106 PDF 인라인 뷰어 (`pdfjs-dist` 동적 import + Web Worker)     |
| `ExcelPreview.tsx`         | FR-1107 Excel/CSV 표 미리보기 (SheetJS `read` → 첫 시트 100행)      |
| `AttachmentPanel.tsx`      | FR-1109 페이지 사이드 패널 (페이지별 첨부 목록/검색/관리)           |
| `ImageLightbox.tsx`        | FR-1102 이미지 라이트박스                                           |

## 데이터 흐름

```
업로드      : client(<input type=file>) → POST /api/attachments  (multipart/form-data)
조회/목록   : GET /api/attachments?pageId=<pid>
다운로드    : GET /api/attachments/<id>
인라인 보기 : GET /api/attachments/<id>?disposition=inline   (PDF 뷰어가 사용)
삭제        : DELETE /api/attachments/<id>
```

## 보안/성능 메모

- PDF.js Web Worker 는 `next.config.js` 에서 정적 자원으로 노출 필요.
- SheetJS 는 클라이언트에서 직접 fetch → ArrayBuffer → `XLSX.read` 로 파싱.
  서버에서 파싱하지 않아 백엔드 부하 없음. 100행 제한은 클라이언트에서 잘라낸다.
- 30명 사내 환경 가정으로 별도 CDN 미사용 (NFR-501 참조).
