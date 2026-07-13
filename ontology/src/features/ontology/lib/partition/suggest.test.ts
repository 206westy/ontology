import { describe, it, expect } from 'vitest';
import {
  decidePartitionScope,
  collectPartitionNodes,
  ATTACH_MIN_OVERLAP,
  NEW_MAX_OVERLAP,
  type CurrentPartitionNode,
} from './suggest';

// PRD-N M1: 구획 판정 코어 — 추출분과 현재 구획의 이름 겹침률 + 연결성으로
// attach / new / bridge 를 결정론적으로 가른다. LLM 없이 순수 함수.

const semiconductorPartition: CurrentPartitionNode[] = [
  { id: 'c-chuck', name: 'Chuck', kind: 'class' },
  { id: 'c-wafer', name: 'Wafer', kind: 'class' },
  { id: 'c-descum', name: 'Descum', kind: 'class' },
  { id: 'i-pump', name: '펌프447', kind: 'instance' },
];

describe('decidePartitionScope', () => {
  it('빈 추출은 무소음 attach 로 본다', () => {
    const r = decidePartitionScope([], [], semiconductorPartition);
    expect(r.decision).toBe('attach');
    expect(r.overlapRatio).toBe(0);
    expect(r.bridgeCandidates).toEqual([]);
  });

  it('빈(첫 입력) 구획에는 무조건 attach — 분리할 대상이 없다', () => {
    const r = decidePartitionScope(
      [{ name: '결재문서' }, { name: '품의서' }],
      [],
      [],
    );
    expect(r.decision).toBe('attach');
  });

  it('추출 개념이 대부분 현재 구획에 있으면 attach (무소음)', () => {
    const r = decidePartitionScope(
      [{ name: 'Chuck' }, { name: 'Wafer' }, { name: 'Descum' }],
      [],
      semiconductorPartition,
    );
    expect(r.decision).toBe('attach');
    expect(r.overlapRatio).toBeGreaterThanOrEqual(ATTACH_MIN_OVERLAP);
    expect(r.unmatchedNames).toHaveLength(0);
  });

  it('대소문자·공백 차이는 정규화 매칭으로 흡수한다', () => {
    const r = decidePartitionScope(
      [{ name: 'chuck ' }, { name: 'WAFER' }],
      [],
      semiconductorPartition,
    );
    expect(r.decision).toBe('attach');
    expect(r.matched.map((m) => m.existingId).sort()).toEqual(['c-chuck', 'c-wafer']);
  });

  it('이질 도메인(반도체 구획 + 행정 문서)은 새 구획 분리를 제안한다', () => {
    const r = decidePartitionScope(
      [{ name: '결재문서' }, { name: '품의서' }, { name: '전자서명' }, { name: '결재라인' }],
      [
        { source: '결재문서', target: '결재라인' },
        { source: '품의서', target: '전자서명' },
      ],
      semiconductorPartition,
    );
    expect(r.decision).toBe('new');
    expect(r.overlapRatio).toBeLessThanOrEqual(NEW_MAX_OVERLAP);
    expect(r.bridgeCandidates).toEqual([]);
  });

  it('일부 교차 개념만 겹치면 bridge 를 제안한다(전체를 한 구획에 욱여넣지 않음)', () => {
    const r = decidePartitionScope(
      [{ name: '펌프447' }, { name: '구매요청' }, { name: '예산' }, { name: '결재라인' }],
      [{ source: '구매요청', target: '펌프447' }],
      semiconductorPartition,
    );
    expect(r.decision).toBe('bridge');
    // 펌프447 하나만 크로스 → bridge 후보 1건, 기존 인스턴스로 연결.
    expect(r.bridgeCandidates).toHaveLength(1);
    expect(r.bridgeCandidates[0].sourceName).toBe('펌프447');
    expect(r.bridgeCandidates[0].targetId).toBe('i-pump');
    expect(r.bridgeCandidates[0].relationType).toBe('same_as');
    // 미매칭(신규 구획 귀속 대상)은 나머지 3개.
    expect(r.unmatchedNames.sort()).toEqual(['결재라인', '구매요청', '예산']);
  });

  it('연결성 리포트가 추출 서브그래프의 섬 수를 반영한다', () => {
    const r = decidePartitionScope(
      [{ name: 'A' }, { name: 'B' }, { name: 'C' }],
      [{ source: 'A', target: 'B' }],
      [{ id: 'x', name: 'Z', kind: 'class' }],
    );
    // A-B 한 덩어리 + C 고립 = 2 컴포넌트.
    expect(r.connectivity.componentCount).toBe(2);
  });

  it('collectPartitionNodes: 현재 구획의 클래스 + 그 인스턴스만 모은다', () => {
    const classes = [
      { id: 'a', name: '설비', partitionId: 'P1' },
      { id: 'b', name: '문서', partitionId: 'P2' },
    ];
    const instances = [
      { id: 'i1', name: '펌프447', classId: 'a' }, // P1 클래스 소속 → 포함
      { id: 'i2', name: '결재001', classId: 'b' }, // P2 클래스 소속 → 제외
    ];
    const nodes = collectPartitionNodes(classes, instances, 'P1');
    expect(nodes.map((n) => n.id).sort()).toEqual(['a', 'i1']);
    expect(nodes.find((n) => n.id === 'i1')?.kind).toBe('instance');
    expect(nodes.find((n) => n.id === 'a')?.kind).toBe('class');
  });

  it('collectPartitionNodes: 빈 구획이면 빈 배열(무소음 attach 유도)', () => {
    const classes = [{ id: 'a', name: '설비', partitionId: 'P1' }];
    expect(collectPartitionNodes(classes, [], 'P2')).toEqual([]);
  });

  it('임계값은 옵션으로 튜닝 가능하다', () => {
    // overlap 0.25 는 기본값이면 bridge 지만, attachMin 을 0.2 로 내리면 attach.
    const base = decidePartitionScope(
      [{ name: '펌프447' }, { name: '구매요청' }, { name: '예산' }, { name: '결재라인' }],
      [],
      semiconductorPartition,
    );
    expect(base.decision).toBe('bridge');

    const tuned = decidePartitionScope(
      [{ name: '펌프447' }, { name: '구매요청' }, { name: '예산' }, { name: '결재라인' }],
      [],
      semiconductorPartition,
      { attachMinOverlap: 0.2 },
    );
    expect(tuned.decision).toBe('attach');
  });
});
