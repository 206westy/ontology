import type { OntologyClass, OntologyProperty } from './types';

export interface InheritedProperty {
  id: string;
  classId: string;
  name: string;
  dataType: OntologyProperty['dataType'];
  isRequired: boolean;
  enumValues: string[] | null;
  constraintRule: Record<string, unknown> | null;
  sortOrder: number;
  inheritedFrom: string | null;
  inheritedFromName: string | null;
  isOverridden: boolean;
  depth: number;
}

export function getInheritedProperties(
  classId: string,
  allClasses: OntologyClass[],
  allProperties: OntologyProperty[],
): InheritedProperty[] {
  const classMap = new Map(allClasses.map((c) => [c.id, c]));
  const ownProperties = allProperties.filter((p) => p.classId === classId);
  const ownNameSet = new Set(ownProperties.map((p) => p.name));

  const inherited: InheritedProperty[] = [];
  const visited = new Set<string>([classId]);

  let currentId = classMap.get(classId)?.parentId ?? null;
  let depth = 1;

  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    const ancestor = classMap.get(currentId);
    if (!ancestor) break;

    const ancestorProps = allProperties
      .filter((p) => p.classId === currentId)
      .sort((a, b) => a.sortOrder - b.sortOrder);

    for (const prop of ancestorProps) {
      const alreadyCollected = inherited.some((ip) => ip.name === prop.name);
      if (alreadyCollected) continue;

      inherited.push({
        id: prop.id,
        classId: prop.classId,
        name: prop.name,
        dataType: prop.dataType,
        isRequired: prop.isRequired,
        enumValues: prop.enumValues,
        constraintRule: prop.constraintRule,
        sortOrder: prop.sortOrder,
        inheritedFrom: ancestor.id,
        inheritedFromName: ancestor.name,
        isOverridden: ownNameSet.has(prop.name),
        depth,
      });
    }

    currentId = ancestor.parentId;
    depth++;
  }

  return inherited;
}
