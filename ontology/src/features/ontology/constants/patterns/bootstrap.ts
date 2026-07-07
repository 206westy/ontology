import type { PatternBundle } from '../../lib/patterns/types';

// PRD-H (H1/M1, D2): 부트스트랩 시드 — 기존 도메인 템플릿을 "패턴"으로 승격한 5종.
// 캐시는 비어서 시작할 수 있으므로 이 시드는 선택(non-required)이다.
// 테스트는 이 시드에 의존하지 않는다(순수 캐시 로직으로 검증).
export interface BootstrapPatternSeed extends PatternBundle {
  key: string;
  domain: string;
}

export const BOOTSTRAP_PATTERNS: BootstrapPatternSeed[] = [
  {
    key: 'diagnostic-fmea',
    domain: 'diagnostic',
    name: 'Diagnostic / FMEA',
    nameKo: '진단/FMEA',
    roles: [
      { name: 'Symptom', nodeKind: 'class', description: '관측된 증상' },
      { name: 'FailureMode', nodeKind: 'class', description: '고장 모드' },
      { name: 'Cause', nodeKind: 'class', description: '근본 원인' },
      { name: 'Effect', nodeKind: 'class', description: '영향' },
      { name: 'Part', nodeKind: 'class', description: '부품' },
      { name: 'Parameter', nodeKind: 'class', description: '파라미터' },
      { name: 'Inspection', nodeKind: 'class', description: '점검' },
      { name: 'Action', nodeKind: 'class', description: '조치' },
    ],
    relationTypes: [
      { name: 'indicates', layer: 'kinetic', sourceRole: 'Symptom', targetRole: 'FailureMode' },
      { name: 'caused_by', layer: 'semantic', sourceRole: 'FailureMode', targetRole: 'Cause' },
      { name: 'detected_by', layer: 'kinetic', sourceRole: 'FailureMode', targetRole: 'Inspection' },
      { name: 'resolved_by', layer: 'kinetic', sourceRole: 'Cause', targetRole: 'Action' },
      { name: 'part_of', layer: 'semantic', sourceRole: 'Part', targetRole: 'Part' },
    ],
    competencyQuestions: [
      '증상 X의 원인은 무엇인가?',
      '원인 Y의 조치는 무엇인가?',
      '고장 모드 Z를 감지하는 점검은?',
      '부품 P가 속한 상위 부품은?',
    ],
    traversalTemplates: [
      { cq: '증상 X의 원인은 무엇인가?', path: '(:Symptom)-[:indicates]->(:FailureMode)-[:caused_by]->(:Cause)' },
      { cq: '원인 Y의 조치는 무엇인가?', path: '(:Cause)-[:resolved_by]->(:Action)' },
      { cq: '고장 모드 Z를 감지하는 점검은?', path: '(:FailureMode)-[:detected_by]->(:Inspection)' },
      { cq: '부품 P가 속한 상위 부품은?', path: '(:Part)-[:part_of]->(:Part)' },
    ],
  },
  {
    key: 'admin-process',
    domain: 'administrative',
    name: 'Administrative / Process',
    nameKo: '행정/프로세스',
    roles: [
      { name: 'Request', nodeKind: 'class', description: '요청' },
      { name: 'Step', nodeKind: 'class', description: '단계' },
      { name: 'Approver', nodeKind: 'class', description: '승인자' },
      { name: 'Document', nodeKind: 'class', description: '문서' },
    ],
    relationTypes: [
      { name: 'next_step', layer: 'kinetic', sourceRole: 'Step', targetRole: 'Step' },
      { name: 'approved_by', layer: 'kinetic', sourceRole: 'Request', targetRole: 'Approver' },
      { name: 'requires', layer: 'semantic', sourceRole: 'Step', targetRole: 'Document' },
    ],
    competencyQuestions: ['요청 R의 다음 단계는?', '요청 R을 승인하는 사람은?'],
    traversalTemplates: [
      { cq: '요청 R의 다음 단계는?', path: '(:Step)-[:next_step]->(:Step)' },
      { cq: '요청 R을 승인하는 사람은?', path: '(:Request)-[:approved_by]->(:Approver)' },
    ],
  },
  {
    key: 'catalog-bom',
    domain: 'catalog',
    name: 'Catalog / BOM',
    nameKo: '카탈로그/BOM',
    roles: [
      { name: 'Product', nodeKind: 'class', description: '제품' },
      { name: 'Component', nodeKind: 'class', description: '구성품' },
      { name: 'Supplier', nodeKind: 'class', description: '공급사' },
    ],
    relationTypes: [
      { name: 'contains', layer: 'semantic', sourceRole: 'Product', targetRole: 'Component' },
      { name: 'supplied_by', layer: 'semantic', sourceRole: 'Component', targetRole: 'Supplier' },
    ],
    competencyQuestions: ['제품 P의 구성품은?', '구성품 C의 공급사는?'],
    traversalTemplates: [
      { cq: '제품 P의 구성품은?', path: '(:Product)-[:contains]->(:Component)' },
      { cq: '구성품 C의 공급사는?', path: '(:Component)-[:supplied_by]->(:Supplier)' },
    ],
  },
  {
    key: 'org-role',
    domain: 'organization',
    name: 'Organization / Role',
    nameKo: '조직/역할',
    roles: [
      { name: 'Person', nodeKind: 'class', description: '사람' },
      { name: 'Role', nodeKind: 'class', description: '역할' },
      { name: 'Team', nodeKind: 'class', description: '팀' },
    ],
    relationTypes: [
      { name: 'holds_role', layer: 'semantic', sourceRole: 'Person', targetRole: 'Role' },
      { name: 'member_of', layer: 'semantic', sourceRole: 'Person', targetRole: 'Team' },
    ],
    competencyQuestions: ['사람 X의 역할은?', '팀 T의 구성원은?'],
    traversalTemplates: [
      { cq: '사람 X의 역할은?', path: '(:Person)-[:holds_role]->(:Role)' },
      { cq: '팀 T의 구성원은?', path: '(:Person)-[:member_of]->(:Team)' },
    ],
  },
  {
    key: 'event-timeline',
    domain: 'event',
    name: 'Event / Timeline',
    nameKo: '이벤트/타임라인',
    roles: [
      { name: 'Event', nodeKind: 'class', description: '사건' },
      { name: 'Actor', nodeKind: 'class', description: '행위자' },
      { name: 'Place', nodeKind: 'class', description: '장소' },
    ],
    relationTypes: [
      { name: 'precedes', layer: 'semantic', sourceRole: 'Event', targetRole: 'Event' },
      { name: 'involves', layer: 'semantic', sourceRole: 'Event', targetRole: 'Actor' },
      { name: 'located_at', layer: 'semantic', sourceRole: 'Event', targetRole: 'Place' },
    ],
    competencyQuestions: ['사건 E의 다음 사건은?', '사건 E에 관여한 행위자는?'],
    traversalTemplates: [
      { cq: '사건 E의 다음 사건은?', path: '(:Event)-[:precedes]->(:Event)' },
      { cq: '사건 E에 관여한 행위자는?', path: '(:Event)-[:involves]->(:Actor)' },
    ],
  },
];
