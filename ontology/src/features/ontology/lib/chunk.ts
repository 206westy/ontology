// PRD-F P2-1: 입력 완전성. 8,000자 상한을 제거하고 긴 문서를 heading/문단 경계
// 기준으로 분할한다. 청크 간 overlap 으로 경계에서의 문맥 단절을 줄이고, 표·코드
// 블록은 분할하지 않는다(원자 블록). Critic 전제 = 입력 전체를 본다.

// 단일 청크 상한(자). 이 이하 입력은 청킹 없이 기존 단일 경로로 처리한다(회귀 방지).
export const SINGLE_CHUNK_CHAR_LIMIT = 8000;
// 청크 목표 크기(자). 단일 상한보다 낮춰 per-chunk parse 가 여유 있게 처리되게 한다.
export const TARGET_CHUNK_CHARS = 6000;
// 청크 간 overlap(자). 직전 청크 꼬리를 다음 청크 머리에 덧붙여 경계 문맥을 잇는다.
export const CHUNK_OVERLAP_CHARS = 400;

export function needsChunking(
  text: string,
  limit: number = SINGLE_CHUNK_CHAR_LIMIT,
): boolean {
  return text.length > limit;
}

// 텍스트를 원자 블록으로 분할. 규칙:
// - fenced code block(``` … ```) 은 통째로 한 블록(내부 분할 금지)
// - heading(# … ) 은 새 블록 시작
// - 빈 줄은 블록 경계(연속 표 행은 빈 줄이 없어 한 블록으로 유지됨)
function splitIntoBlocks(text: string): string[] {
  const lines = text.split('\n');
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;

  const flush = () => {
    if (current.length > 0) {
      blocks.push(current.join('\n'));
      current = [];
    }
  };

  for (const line of lines) {
    const isFence = line.trimStart().startsWith('```');
    if (isFence) {
      // 코드펜스 진입/종료. 종료 라인까지 현재 블록에 포함.
      current.push(line);
      if (inFence) {
        inFence = false;
        flush();
      } else {
        inFence = true;
      }
      continue;
    }
    if (inFence) {
      current.push(line);
      continue;
    }
    const isBlank = line.trim() === '';
    const isHeading = /^#{1,6}\s/.test(line.trimStart());
    if (isBlank) {
      flush();
      continue;
    }
    if (isHeading) {
      flush();
      current.push(line);
      continue;
    }
    current.push(line);
  }
  flush();
  return blocks;
}

// 원자 블록이 단일 상한을 넘으면(거대 표/코드) 줄 단위로 하드 분할한다(무손실 우선).
function hardSplitOversized(block: string, limit: number): string[] {
  if (block.length <= limit) return [block];
  const out: string[] = [];
  const lines = block.split('\n');
  let buf: string[] = [];
  let len = 0;
  for (const line of lines) {
    if (len + line.length + 1 > limit && buf.length > 0) {
      out.push(buf.join('\n'));
      buf = [];
      len = 0;
    }
    buf.push(line);
    len += line.length + 1;
  }
  if (buf.length > 0) out.push(buf.join('\n'));
  return out;
}

export interface ChunkOptions {
  targetChars?: number;
  overlapChars?: number;
  hardLimit?: number;
}

// 문서를 청크 배열로 분할. 단일 상한 이하이면 [text] 하나만 반환(기존 경로 동등).
export function chunkText(text: string, opts: ChunkOptions = {}): string[] {
  const target = opts.targetChars ?? TARGET_CHUNK_CHARS;
  const overlap = opts.overlapChars ?? CHUNK_OVERLAP_CHARS;
  const hardLimit = opts.hardLimit ?? SINGLE_CHUNK_CHAR_LIMIT;

  if (!needsChunking(text, hardLimit)) return [text];

  const rawBlocks = splitIntoBlocks(text).flatMap((b) =>
    hardSplitOversized(b, hardLimit),
  );

  const chunks: string[] = [];
  let buf: string[] = [];
  let len = 0;

  const seal = () => {
    if (buf.length === 0) return;
    const body = buf.join('\n\n');
    // overlap: 직전 청크의 꼬리를 이 청크 머리에 덧붙인다(문맥 연속).
    const prev = chunks.length > 0 ? chunks[chunks.length - 1] : '';
    const tail = overlap > 0 && prev ? prev.slice(-overlap) : '';
    chunks.push(tail ? `${tail}\n\n${body}` : body);
    buf = [];
    len = 0;
  };

  for (const block of rawBlocks) {
    const add = block.length + 2;
    if (len + add > target && buf.length > 0) seal();
    buf.push(block);
    len += add;
  }
  seal();

  return chunks;
}
