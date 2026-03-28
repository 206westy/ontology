import type {
  OntologyClass,
  OntologyInstance,
  OntologyProperty,
  RelationType,
  OntologyEdge,
} from './types';

export interface SchemaContext {
  classHierarchy: string;
  propertyMap: string;
  relationTypes: string;
  statistics: string;
}

interface StoreSnapshot {
  classes: OntologyClass[];
  instances: OntologyInstance[];
  properties: OntologyProperty[];
  relationTypes: RelationType[];
  edges: OntologyEdge[];
}

function buildClassTree(
  classes: OntologyClass[],
  parentId: string | null,
  depth: number,
): string {
  const children = classes.filter((c) => c.parentId === parentId);
  if (children.length === 0) return '';

  return children
    .map((c) => {
      const indent = '  '.repeat(depth);
      const desc = c.description ? ` -- ${c.description}` : '';
      const subtree = buildClassTree(classes, c.id, depth + 1);
      return `${indent}- ${c.name}${desc}${subtree ? '\n' + subtree : ''}`;
    })
    .join('\n');
}

export function buildSchemaContext(store: StoreSnapshot): SchemaContext {
  const { classes, instances, properties, relationTypes, edges } = store;

  // Class hierarchy as indented tree
  const roots = classes.filter(
    (c) => !c.parentId || !classes.some((p) => p.id === c.parentId),
  );
  const treeLines = roots
    .map((r) => {
      const desc = r.description ? ` -- ${r.description}` : '';
      const subtree = buildClassTree(classes, r.id, 1);
      return `- ${r.name}${desc}${subtree ? '\n' + subtree : ''}`;
    })
    .join('\n');
  const classHierarchy = treeLines || '(empty)';

  // Property map: class -> properties
  const propMapLines = classes.map((c) => {
    const classProps = properties
      .filter((p) => p.classId === c.id)
      .map((p) => `${p.name}: ${p.dataType}${p.isRequired ? ' (required)' : ''}`)
      .join(', ');
    return classProps ? `${c.name}: [${classProps}]` : null;
  }).filter(Boolean);
  const propertyMap = propMapLines.length > 0
    ? propMapLines.join('\n')
    : '(no properties)';

  // Relation types with domain/range
  const relLines = relationTypes.map((rt) => {
    const relEdges = edges.filter((e) => e.relationTypeId === rt.id);
    const domainRange = relEdges
      .slice(0, 3)
      .map((e) => {
        const src = classes.find((c) => c.id === e.sourceId)?.name ?? '?';
        const tgt = classes.find((c) => c.id === e.targetId)?.name ?? '?';
        return `${src} -> ${tgt}`;
      })
      .join(', ');
    return `${rt.name}${domainRange ? `: ${domainRange}` : ''}`;
  });
  const relationTypesStr = relLines.length > 0
    ? relLines.join('\n')
    : '(no relations)';

  // Statistics: instance count per class
  const statsLines = classes.map((c) => {
    const count = instances.filter((i) => i.classId === c.id).length;
    return `${c.name}: ${count} instances`;
  });
  const statistics = statsLines.length > 0
    ? statsLines.join('\n')
    : '(no classes)';

  return { classHierarchy, propertyMap, relationTypes: relationTypesStr, statistics };
}
