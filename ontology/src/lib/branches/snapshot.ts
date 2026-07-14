import { eq } from 'drizzle-orm';
import type { getDb } from '@/lib/drizzle';
import {
  classes,
  properties,
  instances,
  instanceValues,
  relationTypes,
  edges,
} from '@/lib/drizzle/schema';

// PRD-J M2: 브랜치 = 분기 시점 그래프 스냅샷(base_snapshot) + 이후 커밋 체인.
// 스냅샷은 store/loadOntology 가 받는 형태와 동일한 엔티티 배열 묶음이다.
export const BRANCH_SNAPSHOT_SCHEMA_VERSION = 1;

/** 온톨로지 main 의 현재 그래프 스냅샷(브랜치 base). 온톨로지 스코프 격리. */
export async function buildMainSnapshot(
  db: Awaited<ReturnType<typeof getDb>>,
  ontologyId: string,
) {
  const [
    allClasses,
    allProperties,
    allInstances,
    allInstanceValues,
    allRelationTypes,
    allEdges,
  ] = await Promise.all([
    db.query.classes.findMany({ where: eq(classes.ontologyId, ontologyId) }),
    db.query.properties.findMany({ where: eq(properties.ontologyId, ontologyId) }),
    db.query.instances.findMany({ where: eq(instances.ontologyId, ontologyId) }),
    db.query.instanceValues.findMany({
      where: eq(instanceValues.ontologyId, ontologyId),
    }),
    db.query.relationTypes.findMany({
      where: eq(relationTypes.ontologyId, ontologyId),
    }),
    db.query.edges.findMany({ where: eq(edges.ontologyId, ontologyId) }),
  ]);

  return {
    schemaVersion: BRANCH_SNAPSHOT_SCHEMA_VERSION,
    classes: allClasses,
    properties: allProperties,
    instances: allInstances,
    instanceValues: allInstanceValues,
    relationTypes: allRelationTypes,
    edges: allEdges,
  };
}
