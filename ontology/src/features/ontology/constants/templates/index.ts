import { uuid } from '../../lib/uuid';
import semiconductorData from './semiconductor.json';
import itInfrastructureData from './it-infrastructure.json';
import organizationData from './organization.json';
import healthcareData from './healthcare.json';
import supplyChainData from './supply-chain.json';

export interface TemplateMetadata {
  id: string;
  name: string;
  nameKo: string;
  description: string;
  descriptionKo: string;
  icon: string;
  classCount: number;
  relationCount: number;
  propertyCount: number;
  instanceCount: number;
}

export interface TemplateClass {
  name: string;
  description: string;
  color: string;
  parentName?: string;
}

export interface TemplateProperty {
  className: string;
  name: string;
  dataType: string;
  isRequired: boolean;
  // enum 타입 property 는 DB 제약(properties_check)상 비어있지 않은 enumValues 가 필수.
  enumValues?: string[];
}

export interface TemplateRelationType {
  name: string;
  sourceClassName: string;
  targetClassName: string;
}

export interface TemplateInstance {
  name: string;
  className: string;
  description?: string;
}

export interface TemplateData {
  classes: TemplateClass[];
  properties: TemplateProperty[];
  relationTypes: TemplateRelationType[];
  instances: TemplateInstance[];
}

const templateDataMap: Record<string, TemplateData> = {
  semiconductor: semiconductorData as TemplateData,
  'it-infrastructure': itInfrastructureData as TemplateData,
  organization: organizationData as TemplateData,
  healthcare: healthcareData as TemplateData,
  'supply-chain': supplyChainData as TemplateData,
};

export const TEMPLATES: TemplateMetadata[] = [
  {
    id: 'semiconductor',
    name: 'Semiconductor FAB',
    nameKo: '반도체 FAB',
    description: 'Fab, Equipment, Wafer, Process, Recipe and more',
    descriptionKo: 'FAB 장비, 웨이퍼, 공정, 레시피 중심의 반도체 제조 온톨로지',
    icon: 'Cpu',
    classCount: 15,
    relationCount: 6,
    propertyCount: 25,
    instanceCount: 5,
  },
  {
    id: 'it-infrastructure',
    name: 'IT Infrastructure / CMDB',
    nameKo: 'IT 인프라 / CMDB',
    description: 'DataCenter, Server, Network, Application, Service',
    descriptionKo: '데이터센터, 서버, 네트워크, 애플리케이션 구성 관리',
    icon: 'Server',
    classCount: 18,
    relationCount: 7,
    propertyCount: 30,
    instanceCount: 5,
  },
  {
    id: 'organization',
    name: 'Organization / HR',
    nameKo: '조직 / 인사',
    description: 'Organization, Department, Team, Employee, Project',
    descriptionKo: '조직 구조, 인사 정보, 프로젝트, 역할 관리',
    icon: 'Building2',
    classCount: 14,
    relationCount: 6,
    propertyCount: 20,
    instanceCount: 5,
  },
  {
    id: 'healthcare',
    name: 'Healthcare',
    nameKo: '의료',
    description: 'Hospital, Patient, Doctor, Diagnosis, Treatment',
    descriptionKo: '병원, 환자, 의사, 진단, 처방 중심의 의료 온톨로지',
    icon: 'HeartPulse',
    classCount: 17,
    relationCount: 7,
    propertyCount: 28,
    instanceCount: 5,
  },
  {
    id: 'supply-chain',
    name: 'Supply Chain',
    nameKo: '공급망',
    description: 'Supplier, Warehouse, Product, Order, Shipment',
    descriptionKo: '공급업체, 창고, 제품, 주문, 배송 물류 온톨로지',
    icon: 'Truck',
    classCount: 13,
    relationCount: 6,
    propertyCount: 22,
    instanceCount: 5,
  },
];

/**
 * Build an Import API-compatible payload from a template's simplified JSON.
 * Generates UUIDs, resolves name-based references to ID-based references,
 * and lays out class positions in a grid.
 */
export function buildImportPayload(templateId: string) {
  const data = templateDataMap[templateId];
  if (!data) throw new Error(`Unknown template: ${templateId}`);

  const classIdMap = new Map<string, string>();
  const now = new Date().toISOString();

  // Generate class IDs and build name -> ID map
  const classesPayload = data.classes.map((cls, i) => {
    const id = uuid();
    classIdMap.set(cls.name, id);

    // Grid layout: 5 columns, 250px spacing
    const col = i % 5;
    const row = Math.floor(i / 5);

    return {
      id,
      name: cls.name,
      description: cls.description,
      color: cls.color,
      parentId: null as string | null,
      positionX: col * 280 + 100,
      positionY: row * 200 + 100,
    };
  });

  // Resolve parentId from parentName
  for (const cls of data.classes) {
    if (cls.parentName) {
      const childId = classIdMap.get(cls.name);
      const parentId = classIdMap.get(cls.parentName);
      if (childId && parentId) {
        const entry = classesPayload.find((c) => c.id === childId);
        if (entry) entry.parentId = parentId;
      }
    }
  }

  // Properties
  const propertiesPayload = data.properties.map((prop, i) => ({
    id: uuid(),
    classId: classIdMap.get(prop.className) ?? '',
    name: prop.name,
    dataType: prop.dataType,
    isRequired: prop.isRequired,
    enumValues: prop.enumValues ?? null,
    constraintRule: null,
    sortOrder: i,
  }));

  // Relation types
  const relationTypesPayload = data.relationTypes.map((rt) => ({
    id: uuid(),
    name: rt.name,
    description: '',
    sourceClassId: classIdMap.get(rt.sourceClassName) ?? null,
    targetClassId: classIdMap.get(rt.targetClassName) ?? null,
  }));

  // Edges (one edge per relation type, connecting classes)
  const edgesPayload = relationTypesPayload.map((rt) => ({
    id: uuid(),
    relationTypeId: rt.id,
    sourceId: rt.sourceClassId ?? '',
    targetId: rt.targetClassId ?? '',
    sourceKind: 'class',
    targetKind: 'class',
  }));

  // Instances
  const instancesPayload = data.instances.map((inst) => ({
    id: uuid(),
    classId: classIdMap.get(inst.className) ?? '',
    name: inst.name,
  }));

  return {
    version: '1.0',
    ontology: {
      classes: classesPayload,
      properties: propertiesPayload,
      instances: instancesPayload,
      instanceValues: [],
      relationTypes: relationTypesPayload,
      edges: edgesPayload,
      axioms: [],
      axiomClasses: [],
      constraints: [],
    },
    strategy: 'replace' as const,
  };
}
