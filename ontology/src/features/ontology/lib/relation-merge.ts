// PRD-F P2-3: 전역 관계 병합. 청크별 Stage2 결과를 합치며 중복을 제거한다.
// 동일 (source, target, type, category) 는 1건으로, confidence 는 최댓값을 유지한다.
// 별모양·섬 방지는 grounding(Stage2 프롬프트)이 이미 담당 — 여기선 병합만.
import type { ParsedRelation } from './schemas';
import { normalizeName } from './similarity';

export function relationKey(
  r: Pick<ParsedRelation, 'source' | 'target' | 'type' | 'category'>,
): string {
  return `${normalizeName(r.source)}|${normalizeName(r.target)}|${normalizeName(r.type)}|${r.category}`;
}

export function mergeRelationsAcrossChunks(relations: ParsedRelation[]): {
  merged: ParsedRelation[];
  dedupedCount: number;
} {
  const byKey = new Map<string, ParsedRelation>();
  let dedupedCount = 0;
  for (const r of relations) {
    const key = relationKey(r);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, r);
      continue;
    }
    dedupedCount += 1;
    byKey.set(key, {
      ...existing,
      // confidence 는 최댓값(둘 중 더 확신한 근거를 남긴다).
      confidence: Math.max(existing.confidence, r.confidence),
      // evidence 는 non-empty 우선, 둘 다 있으면 더 긴 스팬 유지.
      evidence:
        r.evidence.trim().length > existing.evidence.trim().length
          ? r.evidence
          : existing.evidence,
    });
  }
  return { merged: [...byKey.values()], dedupedCount };
}
