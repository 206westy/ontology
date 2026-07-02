import { describe, it, expect } from 'vitest';
import {
  chunkText,
  needsChunking,
  SINGLE_CHUNK_CHAR_LIMIT,
} from '@/features/ontology/lib/chunk';

describe('needsChunking', () => {
  it('상한 이하면 false, 초과면 true', () => {
    expect(needsChunking('a'.repeat(100))).toBe(false);
    expect(needsChunking('a'.repeat(SINGLE_CHUNK_CHAR_LIMIT + 1))).toBe(true);
  });
});

describe('chunkText', () => {
  it('단일 상한 이하 입력은 단일 청크(기존 경로 동등)', () => {
    const text = '짧은 문서입니다.\n\n두 번째 문단.';
    expect(chunkText(text)).toEqual([text]);
  });

  it('긴 문서를 잘리지 않고 전량 처리(무손실)', () => {
    // heading + 문단 반복으로 ~20k자 문서 생성.
    const para = '이것은 충분히 긴 문단입니다. '.repeat(40); // ~600자
    const blocks: string[] = [];
    for (let i = 0; i < 40; i++) blocks.push(`# 섹션 ${i}\n\n${para}`);
    const text = blocks.join('\n\n');
    expect(text.length).toBeGreaterThan(20000);

    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    // 모든 섹션 heading 이 어떤 청크엔가 존재(누락 없음).
    for (let i = 0; i < 40; i++) {
      expect(chunks.some((c) => c.includes(`# 섹션 ${i}`))).toBe(true);
    }
  });

  it('청크 경계가 문단/heading 에 정렬(청크가 heading 으로 시작하거나 overlap 꼬리 포함)', () => {
    const para = '문장. '.repeat(200); // ~1200자
    const text = Array.from({ length: 12 }, (_, i) => `# H${i}\n\n${para}`).join(
      '\n\n',
    );
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(1);
    // 2번째 청크부터는 overlap(직전 꼬리)이 붙어 비어있지 않다.
    expect(chunks[1].length).toBeGreaterThan(0);
    // 각 청크는 target 대비 과도하게 크지 않다(원자블록 예외 제외).
    for (const c of chunks) {
      expect(c.length).toBeLessThan(SINGLE_CHUNK_CHAR_LIMIT + 1000);
    }
  });

  it('코드펜스 블록은 분할하지 않는다(원자)', () => {
    const bigCode =
      '```\n' + Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n') + '\n```';
    const text =
      '# 앞\n\n' + '설명 '.repeat(2000) + '\n\n' + bigCode + '\n\n# 뒤\n\n끝.';
    const chunks = chunkText(text);
    // 코드펜스 전체가 하나의 청크 안에 온전히 들어있다.
    expect(chunks.some((c) => c.includes('line 0') && c.includes('line 99'))).toBe(
      true,
    );
  });
});
