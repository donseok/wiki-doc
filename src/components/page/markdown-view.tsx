'use client';
import { useEffect, useMemo, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import rehypeRaw from 'rehype-raw';
import type { ComponentPropsWithoutRef } from 'react';
import { Mermaid } from '@/components/markdown/mermaid';
import { Lightbox, type LightboxImage } from '@/components/attachments/lightbox';
import { AttachmentCard } from '@/components/attachments/attachment-card';
import type { AttachmentDTO } from '@/components/attachments/upload-dropzone';

interface Props {
  source: string;
  className?: string;
  /** 첨부 메타데이터 조회용 페이지 ID (FR-1105 카드 표시) */
  pageId?: string;
}

const ATT_ID_RE = /^\/api\/attachments\/([a-zA-Z0-9_-]+)/;

function attachmentIdFromUrl(url: string | undefined | null): string | null {
  if (!url) return null;
  const m = ATT_ID_RE.exec(url);
  return m ? m[1] : null;
}

/**
 * 페이지 본문 렌더러 — FR-214 Mermaid 지원.
 *
 * - 마크다운 + GFM(테이블/체크박스) + 코드 하이라이트
 * - ```mermaid 코드블록은 Mermaid 컴포넌트로 렌더링
 * - 그 외 코드블록은 rehype-highlight 로 처리
 * - `/api/attachments/<id>` URL 의 이미지 → 라이트박스 (FR-1102)
 * - `/api/attachments/<id>` URL 의 링크 → 첨부 카드 (FR-1105)
 */
export function MarkdownView({ source, className, pageId }: Props) {
  // 페이지 첨부 메타 (id → DTO)
  const [attMap, setAttMap] = useState<Record<string, AttachmentDTO>>({});

  useEffect(() => {
    if (!pageId) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(
          `/api/attachments?pageId=${encodeURIComponent(pageId)}`,
          { cache: 'no-store' },
        );
        if (!res.ok) return;
        const json = await res.json().catch(() => null);
        if (cancelled || !json?.ok || !Array.isArray(json.data)) return;
        const map: Record<string, AttachmentDTO> = {};
        (json.data as AttachmentDTO[]).forEach((a) => {
          map[a.id] = a;
        });
        setAttMap(map);
      } catch {
        // 무시: 카드 메타 없이도 일반 링크/이미지로 동작
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pageId]);

  // 본문 내 모든 이미지 (라이트박스 순회용)
  const lightboxImages: LightboxImage[] = useMemo(() => {
    const list: LightboxImage[] = [];
    const seen = new Set<string>();
    const re = /!\[([^\]]*)\]\((\/api\/attachments\/[a-zA-Z0-9_-]+|[^)\s]+)\)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(source)) !== null) {
      const original = m[2];
      const id = attachmentIdFromUrl(original);
      const src = id ? `/api/attachments/${id}?disposition=inline` : original;
      if (seen.has(src)) continue;
      seen.add(src);
      const att = id ? attMap[id] : undefined;
      list.push({
        src,
        alt: m[1],
        filename: att?.filename ?? m[1] ?? undefined,
        downloadUrl: id ? `/api/attachments/${id}` : original,
      });
    }
    return list;
  }, [source, attMap]);

  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  const openLightbox = (src: string) => {
    const idx = lightboxImages.findIndex((img) => img.src === src);
    setLightboxIndex(idx >= 0 ? idx : 0);
    setLightboxOpen(true);
  };

  if (!source.trim()) {
    return (
      <div className="text-muted-foreground">
        <p className="text-sm">아직 내용이 없습니다. 우상단 [편집] 버튼을 눌러 작성하세요.</p>
      </div>
    );
  }

  return (
    <>
      <article className={`pi-prose ${className ?? ''}`}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeHighlight]}
          components={{
            code: CodeBlock,
            img: ({ src, alt }) => {
              const url = typeof src === 'string' ? src : '';
              const id = attachmentIdFromUrl(url);
              const renderSrc = id ? `/api/attachments/${id}?disposition=inline` : url;
              return (
                /* eslint-disable-next-line @next/next/no-img-element */
                <img
                  src={renderSrc}
                  alt={alt ?? ''}
                  loading="lazy"
                  className="cursor-zoom-in rounded-md border bg-card"
                  onClick={() => openLightbox(renderSrc)}
                />
              );
            },
            a: ({ href, children, ...rest }) => {
              const url = typeof href === 'string' ? href : '';
              const id = attachmentIdFromUrl(url);
              if (id) {
                const att = attMap[id];
                if (att) {
                  // 카드는 block 레벨로 표시. p 안에 들어가도 깨지지 않도록 inline-block 래핑
                  return (
                    <span className="my-2 block max-w-2xl">
                      <AttachmentCard attachment={att} />
                    </span>
                  );
                }
                // 메타가 아직 없으면 다운로드 링크로
                return (
                  <a href={url} download {...rest}>
                    {children}
                  </a>
                );
              }
              const isExternal = url.startsWith('http://') || url.startsWith('https://');
              return (
                <a
                  href={url}
                  target={isExternal ? '_blank' : undefined}
                  rel={isExternal ? 'noopener noreferrer' : undefined}
                  {...rest}
                >
                  {children}
                </a>
              );
            },
          }}
        >
          {source}
        </ReactMarkdown>
      </article>

      <Lightbox
        images={lightboxImages}
        initialIndex={lightboxIndex}
        open={lightboxOpen}
        onOpenChange={setLightboxOpen}
      />
    </>
  );
}

/**
 * react-markdown v9 의 code renderer.
 * inline 코드는 그대로, fenced ``` 블록은 className 의 language-* 추출.
 *
 * - language-mermaid → Mermaid 다이어그램
 * - 그 외 → 기본 <code className="language-xxx"> 출력 (rehype-highlight 가 hljs 클래스 추가)
 */
function CodeBlock(props: ComponentPropsWithoutRef<'code'> & { inline?: boolean }) {
  const { inline, className, children, ...rest } = props;
  const lang = /language-(\w+)/.exec(className || '')?.[1];
  const value = String(children ?? '').replace(/\n$/, '');

  if (!inline && lang === 'mermaid') {
    return <Mermaid chart={value} />;
  }
  return (
    <code className={className} {...rest}>
      {children}
    </code>
  );
}
