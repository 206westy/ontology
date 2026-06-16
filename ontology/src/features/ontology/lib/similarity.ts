// Shared name-similarity utilities (used by /api/validate similar_names and
// /api/entity-resolution/candidates). Pure functions — safe on server or client.

export function levenshtein(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= a.length; i++) matrix[i] = [i];
  for (let j = 0; j <= b.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost,
      );
    }
  }
  return matrix[a.length][b.length];
}

// Normalize for comparison: trim, lowercase, collapse internal whitespace,
// and strip spaces/underscores/hyphens so "Dry Asher" ≈ "DryAsher".
export function normalizeName(s: string): string {
  return s.trim().toLowerCase().replace(/[\s_-]+/g, '');
}

export interface NamedEntity {
  id: string;
  name: string;
}

export interface SimilarPair<T extends NamedEntity> {
  a: T;
  b: T;
  score: number; // 0..1
  distance: number;
  exact: boolean; // normalized names identical
}

export interface SimilarityOptions {
  minScore?: number; // default 0.8
  maxDistance?: number; // default 2
}

// All unordered pairs whose names are exact (normalized) or close enough.
export function findSimilarPairs<T extends NamedEntity>(
  items: T[],
  opts: SimilarityOptions = {},
): SimilarPair<T>[] {
  const minScore = opts.minScore ?? 0.8;
  const maxDistance = opts.maxDistance ?? 2;
  const pairs: SimilarPair<T>[] = [];

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      const na = normalizeName(a.name);
      const nb = normalizeName(b.name);

      if (na.length === 0 || nb.length === 0) continue;

      if (na === nb) {
        pairs.push({ a, b, score: 1, distance: 0, exact: true });
        continue;
      }

      const distance = levenshtein(na, nb);
      const maxLen = Math.max(na.length, nb.length);
      const score = 1 - distance / maxLen;

      if (score >= minScore && distance <= maxDistance) {
        pairs.push({ a, b, score, distance, exact: false });
      }
    }
  }

  // Strongest matches first.
  return pairs.sort((x, y) => y.score - x.score);
}
