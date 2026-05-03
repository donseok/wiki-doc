import 'server-only';

export interface MarkdownChunk {
  chunkIndex: number;
  heading: string | null;
  content: string;
  tokenEstimate: number;
}

interface ChunkMarkdownInput {
  title: string;
  markdown: string;
  maxChars?: number;
  overlapChars?: number;
}

const DEFAULT_MAX_CHARS = 1800;
const DEFAULT_OVERLAP_CHARS = 180;

export function chunkMarkdown(input: ChunkMarkdownInput): MarkdownChunk[] {
  const maxChars = Math.max(input.maxChars ?? DEFAULT_MAX_CHARS, 800);
  const overlapChars = Math.min(input.overlapChars ?? DEFAULT_OVERLAP_CHARS, Math.floor(maxChars / 4));
  const sections = splitByHeadings(input.markdown);
  const chunks: MarkdownChunk[] = [];

  for (const section of sections) {
    const prefix = section.heading ? `${section.heading}\n\n` : `${input.title}\n\n`;
    const normalized = section.content.trim();
    if (!normalized) continue;

    let start = 0;
    while (start < normalized.length) {
      const room = Math.max(maxChars - prefix.length, 400);
      const end = findChunkEnd(normalized, start, room);
      const content = `${prefix}${normalized.slice(start, end).trim()}`.trim();
      if (content) {
        chunks.push({
          chunkIndex: chunks.length,
          heading: section.heading,
          content,
          tokenEstimate: estimateTokens(content),
        });
      }
      if (end >= normalized.length) break;
      start = Math.max(end - overlapChars, start + 1);
    }
  }

  if (chunks.length === 0 && input.markdown.trim()) {
    const content = input.markdown.trim().slice(0, maxChars);
    chunks.push({
      chunkIndex: 0,
      heading: null,
      content,
      tokenEstimate: estimateTokens(content),
    });
  }

  return chunks;
}

function splitByHeadings(markdown: string): { heading: string | null; content: string }[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');
  const sections: { heading: string | null; lines: string[] }[] = [{ heading: null, lines: [] }];

  for (const line of lines) {
    const heading = /^(#{1,4})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      sections.push({ heading: heading[2], lines: [line] });
    } else {
      sections[sections.length - 1].lines.push(line);
    }
  }

  return sections.map((section) => ({
    heading: section.heading,
    content: section.lines.join('\n'),
  }));
}

function findChunkEnd(content: string, start: number, maxLength: number): number {
  const hardEnd = Math.min(content.length, start + maxLength);
  if (hardEnd >= content.length) return content.length;

  const window = content.slice(start, hardEnd);
  const paragraphBreak = window.lastIndexOf('\n\n');
  if (paragraphBreak > maxLength * 0.45) return start + paragraphBreak;

  const sentenceBreak = Math.max(window.lastIndexOf('. '), window.lastIndexOf('다. '));
  if (sentenceBreak > maxLength * 0.45) return start + sentenceBreak + 1;

  const lineBreak = window.lastIndexOf('\n');
  if (lineBreak > maxLength * 0.45) return start + lineBreak;

  return hardEnd;
}

function estimateTokens(content: string): number {
  return Math.max(1, Math.ceil(content.length / 4));
}
