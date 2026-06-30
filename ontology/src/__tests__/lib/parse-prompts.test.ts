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
