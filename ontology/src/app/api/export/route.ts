import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/drizzle';
import { handleApiError } from '@/lib/api-error';

type ExportFormat = 'json' | 'jsonld' | 'turtle' | 'owl';

const FORMAT_CONFIG: Record<ExportFormat, { contentType: string; extension: string }> = {
  json: { contentType: 'application/json', extension: 'json' },
  jsonld: { contentType: 'application/ld+json', extension: 'jsonld' },
  turtle: { contentType: 'text/turtle', extension: 'ttl' },
  owl: { contentType: 'application/rdf+xml', extension: 'owl' },
};

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const formatParam = (searchParams.get('format') ?? 'json').toLowerCase();

    if (!['json', 'jsonld', 'turtle', 'owl'].includes(formatParam)) {
      return NextResponse.json(
        { error: `지원하지 않는 형식입니다: ${formatParam}. 지원 형식: json, jsonld, turtle, owl` },
        { status: 400 },
      );
    }

    const format = formatParam as ExportFormat;
    const db = await getDb();

    const [
      allClasses,
      allProperties,
      allInstances,
      allInstanceValues,
      allRelationTypes,
      allEdges,
      allAxioms,
      allAxiomClasses,
      allConstraints,
    ] = await Promise.all([
      // PRD-Perf M0-1: embedding 은 라운드트립 계약에서 소비되지 않음 — export 에서 제외.
      db.query.classes.findMany({
        columns: { embedding: false },
        orderBy: (c, { asc }) => [asc(c.name)],
      }),
      db.query.properties.findMany({
        orderBy: (p, { asc }) => [asc(p.sortOrder)],
      }),
      db.query.instances.findMany({
        columns: { embedding: false },
        orderBy: (i, { asc }) => [asc(i.name)],
      }),
      db.query.instanceValues.findMany(),
      db.query.relationTypes.findMany({
        orderBy: (r, { asc }) => [asc(r.name)],
      }),
      db.query.edges.findMany(),
      db.query.axioms.findMany(),
      db.query.axiomClasses.findMany(),
      db.query.constraints.findMany(),
    ]);

    const ontologyData = {
      classes: allClasses,
      properties: allProperties,
      instances: allInstances,
      instanceValues: allInstanceValues,
      relationTypes: allRelationTypes,
      edges: allEdges,
    };

    const dateStr = new Date().toISOString().slice(0, 10);
    const config = FORMAT_CONFIG[format];

    // --- JSON (default, original behavior) ---
    if (format === 'json') {
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        ontology: {
          ...ontologyData,
          axioms: allAxioms,
          axiomClasses: allAxiomClasses,
          constraints: allConstraints,
        },
        stats: {
          classes: allClasses.length,
          properties: allProperties.length,
          instances: allInstances.length,
          relationTypes: allRelationTypes.length,
          edges: allEdges.length,
          axioms: allAxioms.length,
          constraints: allConstraints.length,
        },
      };

      return new NextResponse(JSON.stringify(exportData, null, 2), {
        status: 200,
        headers: {
          'Content-Type': config.contentType,
          'Content-Disposition': `attachment; filename="ontology-export-${dateStr}.${config.extension}"`,
        },
      });
    }

    // --- JSON-LD ---
    if (format === 'jsonld') {
      const { ontologyToJsonLd } = await import('@/lib/rdf/to-jsonld');
      const jsonLdData = ontologyToJsonLd(ontologyData);

      return new NextResponse(JSON.stringify(jsonLdData, null, 2), {
        status: 200,
        headers: {
          'Content-Type': config.contentType,
          'Content-Disposition': `attachment; filename="ontology-export-${dateStr}.${config.extension}"`,
        },
      });
    }

    // --- Turtle ---
    if (format === 'turtle') {
      const { ontologyToTurtle } = await import('@/lib/rdf/to-turtle');
      const turtleStr = await ontologyToTurtle(ontologyData);

      return new NextResponse(turtleStr, {
        status: 200,
        headers: {
          'Content-Type': config.contentType,
          'Content-Disposition': `attachment; filename="ontology-export-${dateStr}.${config.extension}"`,
        },
      });
    }

    // --- OWL/XML ---
    if (format === 'owl') {
      const { ontologyToOwlXml } = await import('@/lib/rdf/to-owl');
      const owlXmlStr = ontologyToOwlXml(ontologyData);

      return new NextResponse(owlXmlStr, {
        status: 200,
        headers: {
          'Content-Type': config.contentType,
          'Content-Disposition': `attachment; filename="ontology-export-${dateStr}.${config.extension}"`,
        },
      });
    }

    // Should never reach here
    return NextResponse.json({ error: 'Unknown format' }, { status: 400 });
  } catch (err) {
    return handleApiError(err);
  }
}
