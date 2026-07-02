import { describe, it, expect } from 'vitest';
import {
  buildStage1System,
  buildStage1User,
  buildStage2System,
  buildStage2User,
  buildStage1SystemCsv,
  buildStage1UserCsv,
  buildStage2SystemCsv,
} from '@/features/ontology/lib/parse-prompts';
import type { ParsePatternContext } from '@/features/ontology/lib/schemas';

// PRD-H H3 (M2): 진단 도메인 패턴 시드 — 증상→원인→점검→조치 인과 계층.
const diagnosticPattern: ParsePatternContext = {
  domain: 'diagnostic',
  roles: [
    { name: '증상', description: '관측된 이상/증상' },
    { name: '원인', description: '증상을 일으키는 근본 원인' },
    { name: '점검', description: '원인을 좁히기 위한 점검 항목' },
    { name: '조치', description: '문제를 해결하는 조치' },
  ],
  relationTypes: [
    { name: 'caused_by', category: 'causal', sourceRole: '증상', targetRole: '원인' },
    { name: 'inspected_by', category: 'diagnostic', sourceRole: '원인', targetRole: '점검' },
    { name: 'resolved_by', category: 'procedural', sourceRole: '점검', targetRole: '조치' },
  ],
  competencyQuestions: ['증상 X의 원인은?', 'Y를 점검하려면?'],
};

describe('parse-prompts (A-1)', () => {
  it('stage 1 system forbids the title hub and merging look-alike concepts', () => {
    const sys = buildStage1System();
    expect(sys).toMatch(/title.*hub|hub/i);
    expect(sys.toLowerCase()).toContain('do not use the document');
    expect(sys).toContain('Chuck');
  });

  it('stage 1 system has class/instance classification rules and property value guidance (A-1.1)', () => {
    const sys = buildStage1System();
    expect(sys).toContain('nodeKind');
    expect(sys).toContain('parentType');
    expect(sys.toLowerCase()).toContain('instance');
    expect(sys).toContain('KC0330655'); // value belongs to the instance, not the class
  });

  it('stage 1 user embeds the text and existing schema context', () => {
    const user = buildStage1User({
      text: 'plasma strip report',
      existingSchema: '- 하드웨어\n  - Chuck',
    });
    expect(user).toContain('plasma strip report');
    expect(user).toContain('Chuck');
  });

  it('stage 2 system requires grounding and allows islands', () => {
    const sys = buildStage2System();
    expect(sys.toLowerCase()).toContain('co-occurrence is not grounding');
    expect(sys.toLowerCase()).toContain('island');
    expect(sys.toLowerCase()).toContain('confidence');
  });

  // PR1 (목표①): 각 관계에 액션 지향 category 분류를 요구.
  it('stage 2 system requires an action-centric category per relation', () => {
    const sys = buildStage2System();
    expect(sys).toContain('category');
    expect(sys).toContain('structural');
    expect(sys).toContain('causal');
    expect(sys).toContain('diagnostic');
    expect(sys).toContain('procedural');
    expect(sys).toContain('descriptive');
  });

  // PR1 (목표②): 정의문·위계·레이아웃 진술은 관계가 아니거나 descriptive 로 강등.
  it('stage 2 system demotes definition and layout statements to descriptive', () => {
    const sys = buildStage2System();
    expect(sys.toLowerCase()).toContain('definition');
    expect(sys.toLowerCase()).toContain('descriptive');
  });

  // PR1 Stage2 후속: diagnostic vs procedural 경계 — 조건-행동 표층형으로 판단 금지.
  it('stage 2 system defines the diagnostic↔procedural boundary by action purpose', () => {
    const sys = buildStage2System();
    expect(sys).toContain('DISCRIMINATION RULE');
    expect(sys.toLowerCase()).toContain('narrow down the cause');
    expect(sys.toLowerCase()).toContain('predetermined operation');
  });

  // PR1 (목표②): 동작 모드·상태·옵션은 별도 노드가 아니라 enum 속성 값.
  it('stage 1 system treats operating modes as enum property values, not nodes', () => {
    const sys = buildStage1System();
    expect(sys.toLowerCase()).toContain('mode');
    expect(sys).toContain('enum');
  });

  it('stage 2 user lists the extracted entities and the original text', () => {
    const user = buildStage2User({ text: 'orig text' }, [
      { name: 'MW Power', type: '파라미터', nodeKind: 'class', parentType: null, evidence: 'x', description: null, properties: [] },
      { name: 'Particle', type: '결과', nodeKind: 'class', parentType: null, evidence: 'y', description: null, properties: [] },
    ]);
    expect(user).toContain('MW Power (파라미터)');
    expect(user).toContain('Particle (결과)');
    expect(user).toContain('orig text');
  });
});

// PRD-H H3 (M2): 패턴 시드 주입 — 역할 타이핑 + 인과 계층 유도. 없으면 무변화.
describe('parse-prompts pattern-seeded (H3/M2)', () => {
  it('stage 1 user types entities using the pattern roles when patternContext is present', () => {
    const user = buildStage1User({
      text: 'particle이 증가하면 Chuck을 점검한다',
      patternContext: diagnosticPattern,
    });
    // 도메인 + 모든 역할 이름이 프롬프트에 들어가고 type=역할 지시가 있어야 한다.
    expect(user).toContain('diagnostic');
    expect(user).toContain('증상');
    expect(user).toContain('원인');
    expect(user).toContain('점검');
    expect(user).toContain('조치');
    expect(user).toMatch(/role|역할/i);
  });

  it('stage 2 user prefers pattern relation types and demands a causal hierarchy chain', () => {
    const user = buildStage2User(
      { text: 'orig', patternContext: diagnosticPattern },
      [
        { name: 'particle 초과', type: '증상', nodeKind: 'class', parentType: null, evidence: 'x', description: null, properties: [] },
        { name: 'Chuck 오염', type: '원인', nodeKind: 'class', parentType: null, evidence: 'y', description: null, properties: [] },
      ],
    );
    expect(user).toContain('caused_by');
    expect(user).toContain('inspected_by');
    expect(user).toContain('resolved_by');
    // 인과 계층(chain) 요구 + CQ 노출
    expect(user).toMatch(/CAUSAL HIERARCHY|인과 계층/);
    expect(user).toContain('증상 X의 원인은?');
    // 평면 목록 금지 표현(증상→원인→점검→조치 체인 유도)
    expect(user).toContain('증상');
  });

  it('is byte-for-byte identical to the generic path when patternContext is absent (no regression)', () => {
    const base = { text: 'plasma strip report', existingSchema: '- 하드웨어\n  - Chuck' };
    const withUndef = buildStage1User({ ...base, patternContext: undefined });
    const plain = buildStage1User(base);
    expect(withUndef).toBe(plain);
    // 패턴 블록 마커가 generic 경로엔 절대 없어야 한다.
    expect(plain).not.toContain('Domain pattern context');
    const s2 = buildStage2User({ text: 'orig' }, []);
    expect(s2).not.toContain('Domain pattern relations');
  });
});

// M5: CSV-mode prompts — describe the data (object type + typed columns + rows)
// and the structural insight (reference columns → linked entities, categories).
describe('parse-prompts CSV mode (M5)', () => {
  it('stage 1 CSV system treats header as schema, rows as instances', () => {
    const sys = buildStage1SystemCsv();
    expect(sys.toLowerCase()).toContain('csv');
    expect(sys.toLowerCase()).toContain('header');
    expect(sys).toContain('nodeKind');
    expect(sys).toContain('parentType');
    // one main object type + per-row instances
    expect(sys.toUpperCase()).toContain('MAIN OBJECT TYPE');
    expect(sys.toUpperCase()).toContain('ROWS');
  });

  it('stage 1 CSV system maps reference columns to entities and categories to enums', () => {
    const sys = buildStage1SystemCsv();
    expect(sys.toUpperCase()).toContain('REFERENCE COLUMN');
    expect(sys.toLowerCase()).toContain('enum');
    expect(sys.toLowerCase()).toContain('foreign-key');
    // dataType inference must cover numeric + text
    expect(sys).toContain('integer');
    expect(sys).toContain('float');
    expect(sys).toContain('date');
  });

  it('stage 1 CSV system never makes a measurement/number its own node', () => {
    const sys = buildStage1SystemCsv();
    expect(sys.toLowerCase()).toContain('never its own node');
  });

  it('stage 1 CSV user embeds the table and existing schema context', () => {
    const user = buildStage1UserCsv({
      text: 'id,name\n1,a',
      existingSchema: '- 설비',
    });
    expect(user.toLowerCase()).toContain('csv');
    expect(user).toContain('id,name');
    expect(user).toContain('설비');
  });

  it('stage 2 CSV system treats same-row reference links as grounding, not co-occurrence', () => {
    const sys = buildStage2SystemCsv();
    expect(sys.toLowerCase()).toContain('same row');
    expect(sys.toLowerCase()).toContain('foreign key');
    expect(sys.toLowerCase()).toContain('not mere co-occurrence');
    expect(sys).toContain('structural');
  });
});
