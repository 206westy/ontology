import { describe, it, expect } from 'vitest';
import { buildHitlPlan } from '../hitl';
import type { BridgeSuggestion } from '../../bridge/cross-partition';

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
});
