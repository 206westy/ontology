import { NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { handleApiError } from '@/lib/api-error';
import { findSimilarPairs } from '@/features/ontology/lib/similarity';

export interface MergeCandidate {
  id: string; // stable pair id
  kind: 'class' | 'instance';
  a: { id: string; name: string };
  b: { id: string; name: string };
  score: number;
  reason: string;
}

function reasonFor(exact: boolean, score: number): string {
  return exact
    ? '이름이 동일합니다.'
    : `이름이 유사합니다 (유사도 ${Math.round(score * 100)}%).`;
}

export async function GET() {
  try {
    const db = await getDb();
    const [allClasses, allInstances] = await Promise.all([
      db.query.classes.findMany() as unknown as Promise<{ id: string; name: string }[]>,
      db.query.instances.findMany() as unknown as Promise<{ id: string; name: string }[]>,
    ]);

    const classPairs = findSimilarPairs(allClasses.map((c) => ({ id: c.id, name: c.name })));
    const instancePairs = findSimilarPairs(allInstances.map((i) => ({ id: i.id, name: i.name })));

    const candidates: MergeCandidate[] = [
      ...classPairs.map(({ a, b, score, exact }) => ({
        id: `${a.id}:${b.id}`,
        kind: 'class' as const,
        a: { id: a.id, name: a.name },
        b: { id: b.id, name: b.name },
        score,
        reason: reasonFor(exact, score),
      })),
      ...instancePairs.map(({ a, b, score, exact }) => ({
        id: `${a.id}:${b.id}`,
        kind: 'instance' as const,
        a: { id: a.id, name: a.name },
        b: { id: b.id, name: b.name },
        score,
        reason: reasonFor(exact, score),
      })),
    ];

    return NextResponse.json({ candidates });
  } catch (err) {
    return handleApiError(err);
  }
}
