import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { getDb } from '@/lib/drizzle';
import { commits } from '@/lib/drizzle/schema';
import { handleApiError } from '@/lib/api-error';
import { findSimilarPairs } from '@/features/ontology/lib/similarity';

export interface HealthMetrics {
  classes: number;
  instances: number;
  edges: number;
  orphanNodes: number;
  emptyClasses: number;
  duplicateCandidates: number;
  coverage: number; // 0..1 — fraction of classes that have ≥1 instance
  unpushedChanges: number; // committed but not yet pushed to Neo4j
}

interface ClassRow {
  id: string;
  parentId: string | null;
  name: string;
}

export async function GET() {
  try {
    const db = await getDb();
    const [allClasses, allInstances, allEdges, unpushedCommits] = await Promise.all([
      db.query.classes.findMany() as unknown as Promise<ClassRow[]>,
      db.query.instances.findMany() as unknown as Promise<{ id: string; classId: string; name: string }[]>,
      db.query.edges.findMany() as unknown as Promise<{ sourceId: string; targetId: string }[]>,
      db.query.commits.findMany({ where: eq(commits.pushedToNeo4j, false) }),
    ]);

    const connectedIds = new Set<string>();
    for (const e of allEdges) {
      connectedIds.add(e.sourceId);
      connectedIds.add(e.targetId);
    }
    const classIdsWithChildren = new Set(allClasses.filter((c) => c.parentId).map((c) => c.parentId!));
    const classIdsWithInstances = new Set(allInstances.map((i) => i.classId));

    let orphanNodes = 0;
    let emptyClasses = 0;
    for (const c of allClasses) {
      const hasEdge = connectedIds.has(c.id);
      const hasParent = c.parentId !== null;
      const hasChildren = classIdsWithChildren.has(c.id);
      const hasInstances = classIdsWithInstances.has(c.id);
      if (!hasEdge && !hasParent && !hasChildren && !hasInstances) orphanNodes++;
      if (!hasInstances && !hasChildren) emptyClasses++;
    }

    const duplicatePairs = [
      ...findSimilarPairs(allClasses.map((c) => ({ id: c.id, name: c.name }))),
      ...findSimilarPairs(allInstances.map((i) => ({ id: i.id, name: i.name }))),
    ];

    const coverage = allClasses.length === 0 ? 0 : classIdsWithInstances.size / allClasses.length;

    const metrics: HealthMetrics = {
      classes: allClasses.length,
      instances: allInstances.length,
      edges: allEdges.length,
      orphanNodes,
      emptyClasses,
      duplicateCandidates: duplicatePairs.length,
      coverage,
      unpushedChanges: unpushedCommits.length,
    };

    return NextResponse.json({ metrics });
  } catch (err) {
    return handleApiError(err);
  }
}
