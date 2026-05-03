/**
 * Mermaid 다이어그램 — FR-214
 *
 * react-markdown 의 code block 렌더러로 끼워 사용.
 * ```mermaid 코드블록을 동적 import 한 mermaid 라이브러리로 렌더링한다.
 *
 * 동적 import 를 사용해 초기 번들 크기에 영향이 없도록 한다.
 *
 * 사용 예:
 *   import ReactMarkdown from 'react-markdown';
 *   import { MermaidCodeRenderer } from '@/components/markdown/mermaid';
 *
 *   <ReactMarkdown components={{ code: MermaidCodeRenderer }}> {markdown} </ReactMarkdown>
 */

'use client';

import { useEffect, useId, useState } from 'react';
import type { ComponentPropsWithoutRef } from 'react';

interface MermaidProps {
  chart: string;
}

/**
 * documentElement 에 'dark' 클래스가 있는지 검사.
 * Tailwind dark mode (class 전략) 와 맞춤.
 */
function detectDark(): boolean {
  if (typeof document === 'undefined') return false;
  return document.documentElement.classList.contains('dark');
}

export function Mermaid({ chart }: MermaidProps) {
  const rawId = useId();
  // useId 는 ':' 등 CSS selector 에 부적절한 문자를 포함할 수 있어 정리.
  const id = rawId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const [error, setError] = useState<string | null>(null);
  const [svg, setSvg] = useState<string | null>(null);
  const [isDark, setIsDark] = useState<boolean>(false);

  // 다크모드 감지 — documentElement 의 class 변경 감지.
  useEffect(() => {
    setIsDark(detectDark());
    if (typeof document === 'undefined') return;
    const observer = new MutationObserver(() => {
      setIsDark(detectDark());
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class'],
    });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    (async () => {
      try {
        // 동적 import — 초기 번들에 포함되지 않는다.
        const mod = await import('mermaid');
        const mermaid = mod.default;
        mermaid.initialize({
          startOnLoad: false,
          theme: isDark ? 'dark' : 'default',
          securityLevel: 'strict',
          fontFamily: 'inherit',
        });
        const renderId = `mmd-${id}-${isDark ? 'd' : 'l'}`;
        // mermaid 의 parseError 이벤트가 아닌 동기 try/catch 를 사용해도 충분.
        const result = await mermaid.render(renderId, chart);
        if (!cancelled) setSvg(result.svg);
      } catch (e) {
        if (!cancelled) {
          const msg = e instanceof Error ? e.message : 'Mermaid 렌더 실패';
          setError(msg);
          setSvg(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [chart, id, isDark]);

  if (error) {
    return (
      <div className="my-4 rounded border border-red-300 bg-red-50 p-3 dark:border-red-900 dark:bg-red-950">
        <div className="mb-2 text-xs font-semibold text-red-700 dark:text-red-300">
          Mermaid 렌더 오류: {error}
        </div>
        <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-red-900 dark:text-red-200">
          {chart}
        </pre>
      </div>
    );
  }

  if (!svg) {
    return (
      <div className="my-4 flex justify-center rounded border border-dashed py-6 text-xs text-muted-foreground">
        다이어그램 렌더 중…
      </div>
    );
  }

  return (
    <div
      className="my-4 flex justify-center overflow-x-auto"
      // mermaid.render 가 반환한 SVG 문자열을 삽입.
      // securityLevel: 'strict' 로 sanitize 처리됨.
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

/**
 * react-markdown 의 `components.code` 슬롯에 직접 넘길 수 있는 렌더러.
 * 언어가 mermaid 가 아니면 일반 <code> 로 패스스루 한다.
 */
export function MermaidCodeRenderer(
  props: ComponentPropsWithoutRef<'code'> & { inline?: boolean },
) {
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
