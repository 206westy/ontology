import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import {
  classes,
  properties,
  instances,
  instanceValues,
  edges,
  relationTypes,
  constraints,
} from '@/lib/drizzle/schema';
import { importRequestSchema } from '@/features/ontology/lib/schemas';
import { handleApiError } from '@/lib/api-error';
import { recordRelationTerm, recordRelationUsage } from '@/lib/relation-glossary';

// PRD-L M1: 과거 export 페이로드의 axioms/axiomClasses 키는 스키마 검증에서
// 무시되어(zod 알 수 없는 키 strip) 에러 없이 통과한다 — 하위호환.
interface OntologyPayload {
  classes: Array<Record<string, unknown>>;
  properties: Array<Record<string, unknown>>;
  instances: Array<Record<string, unknown>>;
  instanceValues: Array<Record<string, unknown>>;
  relationTypes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
  constraints: Array<Record<string, unknown>>;
}

interface ImportStats {
  classes: number;
  properties: number;
  instances: number;
  instanceValues: number;
  relationTypes: number;
  edges: number;
  constraints: number;
}

/**
 * Detect the import format from Content-Type header.
 * Returns 'json' | 'jsonld' | 'turtle'
 */
function detectFormat(contentType: string | null): 'json' | 'jsonld' | 'turtle' {
  if (!contentType) return 'json';
  const ct = contentType.toLowerCase();
  if (ct.includes('application/ld+json')) return 'jsonld';
  if (ct.includes('text/turtle')) return 'turtle';
  return 'json';
}

/**
 * Convert RDF-based import data (from jsonld/turtle) into the full ontology payload
 * by filling in empty arrays for entities not represented in RDF (constraints)
 */
function normalizeRdfPayload(
  rdfResult: {
    classes: Array<Record<string, unknown>>;
    properties: Array<Record<string, unknown>>;
    instances: Array<Record<string, unknown>>;
    instanceValues: Array<Record<string, unknown>>;
    relationTypes: Array<Record<string, unknown>>;
    edges: Array<Record<string, unknown>>;
  },
): OntologyPayload {
  return {
    ...rdfResult,
    constraints: [],
  };
}

async function insertOntology(
  ontology: OntologyPayload,
  strategy: 'replace' | 'merge',
  // PRD-N M1: 지정 시 임포트되는 클래스 전부를 이 구획에 귀속(템플릿 시딩 → 새 구획).
  partitionId?: string,
): Promise<ImportStats> {
  const db = await getDb();

  const stats: ImportStats = {
    classes: 0,
    properties: 0,
    instances: 0,
    instanceValues: 0,
    relationTypes: 0,
    edges: 0,
    constraints: 0,
  };

  await db.transaction(async (tx) => {
    // If strategy is 'replace', delete everything first (reverse dependency order)
    if (strategy === 'replace') {
      await tx.delete(constraints);
      await tx.delete(edges);
      await tx.delete(instanceValues);
      await tx.delete(instances);
      await tx.delete(properties);
      await tx.delete(relationTypes);
      await tx.delete(classes);
    }

    // Insert in dependency order
    if (ontology.classes.length > 0) {
      const sortedClasses = [...ontology.classes].sort((a, b) => {
        const aHasParent = a.parentId ? 1 : 0;
        const bHasParent = b.parentId ? 1 : 0;
        return aHasParent - bHasParent;
      });

      for (const cls of sortedClasses) {
        await tx.insert(classes).values({
          id: cls.id as string,
          name: cls.name as string,
          parentId: (cls.parentId as string) ?? null,
          description: (cls.description as string) ?? '',
          color: (cls.color as string) ?? '#7c3aed',
          positionX: (cls.positionX as number) ?? 0,
          positionY: (cls.positionY as number) ?? 0,
          // 라우트 지정 구획이 있으면 우선, 없으면 페이로드의 값(있을 때), 없으면 DB 기본 구획.
          partitionId: partitionId ?? (cls.partitionId as string | undefined),
        });
        stats.classes++;
      }
    }

    if (ontology.relationTypes.length > 0) {
      for (const rt of ontology.relationTypes) {
        await tx.insert(relationTypes).values({
          id: rt.id as string,
          name: rt.name as string,
          description: (rt.description as string) ?? '',
          sourceClassId: (rt.sourceClassId as string) ?? null,
          targetClassId: (rt.targetClassId as string) ?? null,
        });
        stats.relationTypes++;
      }
    }

    if (ontology.properties.length > 0) {
      for (const prop of ontology.properties) {
        await tx.insert(properties).values({
          id: prop.id as string,
          classId: prop.classId as string,
          name: prop.name as string,
          dataType: (prop.dataType as string) ?? 'string',
          isRequired: (prop.isRequired as boolean) ?? false,
          enumValues: prop.enumValues ?? null,
          constraintRule: prop.constraintRule ?? null,
          sortOrder: (prop.sortOrder as number) ?? 0,
        });
        stats.properties++;
      }
    }

    if (ontology.instances.length > 0) {
      for (const inst of ontology.instances) {
        await tx.insert(instances).values({
          id: inst.id as string,
          classId: inst.classId as string,
          name: inst.name as string,
        });
        stats.instances++;
      }
    }

    if (ontology.instanceValues.length > 0) {
      for (const iv of ontology.instanceValues) {
        await tx.insert(instanceValues).values({
          id: iv.id as string,
          instanceId: iv.instanceId as string,
          propertyId: iv.propertyId as string,
          value: (iv.value as string) ?? null,
        });
        stats.instanceValues++;
      }
    }

    if (ontology.edges.length > 0) {
      for (const edge of ontology.edges) {
        await tx.insert(edges).values({
          id: edge.id as string,
          relationTypeId: edge.relationTypeId as string,
          sourceId: edge.sourceId as string,
          targetId: edge.targetId as string,
          sourceKind: edge.sourceKind as string,
          targetKind: edge.targetKind as string,
        });
        stats.edges++;
      }
    }

    if (ontology.constraints.length > 0) {
      for (const c of ontology.constraints) {
        await tx.insert(constraints).values({
          id: c.id as string,
          // PRD-L M1: kind 미지정 과거 페이로드는 enforced 로 간주(기존 의미 보존).
          kind: (c.kind as string) ?? 'enforced',
          constraintType: (c.constraintType as string) ?? null,
          description: (c.description as string) ?? '',
          sourceClassId: (c.sourceClassId as string) ?? null,
          targetClassId: (c.targetClassId as string) ?? null,
          relationTypeId: (c.relationTypeId as string) ?? null,
          propertyId: (c.propertyId as string) ?? null,
          config: c.config ?? {},
          severity: (c.severity as string) ?? 'error',
          isActive: (c.isActive as boolean) ?? true,
        });
        stats.constraints++;
      }
    }
  });

  // PRD-L M6 (L7): 임포트로 유입된 관계유형 이름도 어휘집에 사후 기록(비치명).
  for (const rt of ontology.relationTypes) {
    const name = (rt.name as string) ?? '';
    await recordRelationTerm(db, {
      name,
      layer: rt.layer === 'kinetic' ? 'kinetic' : 'semantic',
      sourceRef: 'import',
    });
  }
  // PRD-L M6 (L7) 보강: 임포트된 엣지의 관계 사용도 재등장으로 기록(비치명).
  for (const edge of ontology.edges) {
    await recordRelationUsage(db, {
      relationTypeId: edge.relationTypeId as string,
      sourceRef: 'import-edge',
    });
  }

  return stats;
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type');
    const format = detectFormat(contentType);

    // --- JSON-LD Import ---
    if (format === 'jsonld') {
      const jsonLdDoc = await request.json();
      const strategy = (jsonLdDoc._strategy as string) === 'merge' ? 'merge' : 'replace';

      // Remove our non-standard _strategy key before processing
      delete jsonLdDoc._strategy;

      const { jsonLdToOntology } = await import('@/lib/rdf/from-jsonld');
      const rdfResult = await jsonLdToOntology(jsonLdDoc);
      const ontology = normalizeRdfPayload(rdfResult);
      // M7: RDF 경로도 JSON 경로와 동일한 스키마 검증을 거치게 한다(zod 우회 차단).
      const validated = importRequestSchema.shape.ontology.safeParse(ontology);
      if (!validated.success) {
        return NextResponse.json(
          { error: '가져온 JSON-LD 구조가 올바르지 않습니다.', detail: validated.error.flatten() },
          { status: 400 },
        );
      }
      const stats = await insertOntology(ontology, strategy);

      return NextResponse.json(
        { success: true, strategy, format: 'jsonld', stats },
        { status: 201 },
      );
    }

    // --- Turtle Import ---
    if (format === 'turtle') {
      const turtleStr = await request.text();

      // Extract strategy from query params since Turtle is plain text
      const { searchParams } = new URL(request.url);
      const strategy = searchParams.get('strategy') === 'merge' ? 'merge' : 'replace';

      const { turtleToOntology } = await import('@/lib/rdf/from-turtle');
      const rdfResult = await turtleToOntology(turtleStr);
      const ontology = normalizeRdfPayload(rdfResult);
      // M7: RDF 경로도 JSON 경로와 동일한 스키마 검증을 거치게 한다(zod 우회 차단).
      const validated = importRequestSchema.shape.ontology.safeParse(ontology);
      if (!validated.success) {
        return NextResponse.json(
          { error: '가져온 Turtle 구조가 올바르지 않습니다.', detail: validated.error.flatten() },
          { status: 400 },
        );
      }
      const stats = await insertOntology(ontology, strategy);

      return NextResponse.json(
        { success: true, strategy, format: 'turtle', stats },
        { status: 201 },
      );
    }

    // --- JSON Import (original behavior) ---
    const body = await request.json();
    const parsed = importRequestSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 },
      );
    }

    const { ontology, strategy, partitionId } = parsed.data;
    const fullOntology: OntologyPayload = {
      classes: ontology.classes,
      properties: ontology.properties,
      instances: ontology.instances,
      instanceValues: ontology.instanceValues,
      relationTypes: ontology.relationTypes,
      edges: ontology.edges,
      constraints: ontology.constraints,
    };

    const stats = await insertOntology(fullOntology, strategy, partitionId);

    return NextResponse.json(
      {
        success: true,
        strategy,
        format: 'json',
        stats,
      },
      { status: 201 },
    );
  } catch (err) {
    return handleApiError(err);
  }
}
