import type { GlossarySource, TermGlossaryEntry } from './types';

// PRD-H (H4/M3): 용어집 DB row → TermGlossaryEntry 매퍼(PURE).
// drizzle 를 import 하지 않도록 구조적 타입만 받는다(클라이언트 번들 오염 방지).
export interface TermGlossaryRow {
  id: string;
  domain: string;
  partitionId: string | null;
  term: string;
  meaning: string;
  source: string;
  confidence: number | null;
  evidence: string | null;
  createdAt: Date | string;
}

export function rowToTermGlossaryEntry(row: TermGlossaryRow): TermGlossaryEntry {
  return {
    id: row.id,
    domain: row.domain,
    partitionId: row.partitionId,
    term: row.term,
    meaning: row.meaning,
    source: row.source as GlossarySource,
    confidence: row.confidence,
    evidence: row.evidence,
    createdAt:
      row.createdAt instanceof Date
        ? row.createdAt.toISOString()
        : String(row.createdAt),
  };
}
