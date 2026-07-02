import { describe, it, expect } from 'vitest';
import { buildHitlPlan, type HitlDedupItem } from '../hitl';
import type { BridgeSuggestion } from '../../bridge/cross-partition';
import type { GovernanceProposal } from '../../schemas';
import type { EnrichmentItem } from '../../enrich-types';
import type { CriticIssue } from '../../critic/review';

const PATTERN = {
  roleNames: ['Symptom', 'FailureMode', 'Cause', 'Action', 'Valve'],
  relationNames: ['indicates', 'caused_by', 'resolved_by'],
};

describe('buildHitlPlan (H8 HITL 오케스트레이션)', () => {
  it('미정의 약어를 용어 확인 대상으로 모은다', () => {
    const plan = buildHitlPlan({
      entities: [
        { name: 'VV', type: 'Part' }, // 약어 + 정의 없음 → 용어 해소.
        { name: '에어압', type: 'Parameter', description: '공기압' },
      ],
      relations: [],
      pattern: PATTERN,
    });
    expect(plan.terms).toContain('VV');
    expect(plan.hasWork).toBe(true);
  });

  it('패턴 역할 밖 개념을 드리프트 후보로 표시한다', () => {
    const plan = buildHitlPlan({
      entities: [
        { name: '증상1', type: 'Symptom', description: 'x' }, // 역할 안 → 제외
        { name: '승인요청', type: 'ApprovalRequest', description: '행정' }, // 밖 → 드리프트
      ],
      relations: [{ name: 'indicates' }, { name: 'approved_by' }],
      pattern: PATTERN,
    });
    expect(plan.driftConcepts).toContain('ApprovalRequest');
    expect(plan.driftConcepts).not.toContain('Symptom');
    expect(plan.driftRelations).toContain('approved_by');
    expect(plan.driftRelations).not.toContain('indicates');
  });

  it('크로스-구획 브릿지 후보를 그대로 실어 나른다', () => {
    const bridge: BridgeSuggestion = {
      sourceId: 's', targetId: 't', sourceName: '펌프447', targetName: '펌프447',
      sourcePartition: 'p1', targetPartition: 'p2', kind: 'instance',
      score: 0.9, relationType: 'same_as', evidence: 'x',
    };
    const plan = buildHitlPlan({
      entities: [{ name: '펌프447', type: 'Part', description: 'x' }],
      relations: [],
      pattern: PATTERN,
      bridges: [bridge],
    });
    expect(plan.bridges).toHaveLength(1);
    expect(plan.hasWork).toBe(true);
  });

  it('깨끗한 생성(전부 패턴 안·정의 있음)은 컨펌 작업이 없다', () => {
    const plan = buildHitlPlan({
      entities: [
        { name: '증상1', type: 'Symptom', description: 'x' },
        { name: '원인1', type: 'Cause', description: 'y' },
      ],
      relations: [{ name: 'indicates' }, { name: 'caused_by' }],
      pattern: PATTERN,
    });
    expect(plan.hasWork).toBe(false);
    expect(plan.terms).toHaveLength(0);
    expect(plan.driftConcepts).toHaveLength(0);
  });

  // ── PRD-I (M3, Task 3.1): dedup / governance / enrichment / critic 스텝 계획 ──

  it('선택 입력이 없으면 새 스텝들은 전부 비어 있다(기존 호출자 무영향)', () => {
    const plan = buildHitlPlan({
      entities: [{ name: '증상1', type: 'Symptom', description: 'x' }],
      relations: [{ name: 'indicates' }],
      pattern: PATTERN,
    });
    expect(plan.dedup).toHaveLength(0);
    expect(plan.governance).toHaveLength(0);
    expect(plan.enrichment).toHaveLength(0);
    expect(plan.critic).toHaveLength(0);
    expect(plan.hasWork).toBe(false);
  });

  it('중복 대조 결정을 스텝으로 모으되, 순수 신규(new)는 제외한다', () => {
    const dedup: HitlDedupItem[] = [
      { name: '펌프447', decision: 'reuse', targetName: '펌프447', confidence: 0.95 },
      { name: '밸브12', decision: 'relate', targetName: '밸브', relationType: 'part_of' },
      { name: '완전신규', decision: 'new' },
    ];
    const plan = buildHitlPlan({
      entities: [],
      relations: [],
      pattern: PATTERN,
      dedup,
    });
    expect(plan.dedup.map((d) => d.name)).toEqual(['펌프447', '밸브12']);
    expect(plan.dedup).not.toContainEqual(
      expect.objectContaining({ decision: 'new' }),
    );
    expect(plan.hasWork).toBe(true);
  });

  it('거버넌스 제안을 그대로 실어 나른다', () => {
    const gov: GovernanceProposal = {
      kind: 'constraint_cardinality',
      title: '증상은 최소 1개의 원인을 가진다',
      targetClass: 'Symptom',
      relationType: 'caused_by',
      property: null,
      minCardinality: 1,
      maxCardinality: null,
      enumValues: null,
      disjointWith: null,
      axiomLogic: null,
      evidence: '문서 3.2절',
      confidence: 0.8,
    };
    const plan = buildHitlPlan({
      entities: [],
      relations: [],
      pattern: PATTERN,
      governance: [gov],
    });
    expect(plan.governance).toHaveLength(1);
    expect(plan.governance[0].title).toContain('원인');
    expect(plan.hasWork).toBe(true);
  });

  it('보강 제안은 실어 나르되 고립 노드(isolated)는 제외한다', () => {
    const enrichment: EnrichmentItem[] = [
      {
        id: 'a::no_definition',
        gap: { targetName: 'VV', kind: 'no_definition', reason: '정의 없음', severity: 'high' },
        proposals: [],
      },
      {
        id: 'b::isolated',
        gap: { targetName: '고아', kind: 'isolated', reason: '관계 없음', severity: 'med' },
        proposals: [],
      },
    ];
    const plan = buildHitlPlan({
      entities: [],
      relations: [],
      pattern: PATTERN,
      enrichment,
    });
    expect(plan.enrichment.map((e) => e.gap.kind)).toEqual(['no_definition']);
    expect(plan.hasWork).toBe(true);
  });

  it('Critic 자문을 스텝으로 실어 나른다', () => {
    const critic: CriticIssue[] = [
      {
        kind: 'duplicate_existing',
        severity: 'high',
        targetName: '펌프447',
        relatedName: '펌프 447',
        reason: '기존 노드와 유사',
        ruleId: 'dup-exist',
      },
    ];
    const plan = buildHitlPlan({
      entities: [],
      relations: [],
      pattern: PATTERN,
      critic,
    });
    expect(plan.critic).toHaveLength(1);
    expect(plan.critic[0].targetName).toBe('펌프447');
    expect(plan.hasWork).toBe(true);
  });
});
