import { describe, it, expect, vi } from 'vitest';
import { BOOTSTRAP_PATTERNS } from '../../constants/patterns/bootstrap';
import { selectCachedPattern } from '../patterns/cache';
import { enforcePatternRoles } from '../patterns/enforce-roles';
import { buildHitlPlan } from '../patterns/hitl';
import { judgeDrift } from '../patterns/drift';
import { detectTermsNeedingResolution } from '../terms/detect';
import { makeGlossaryLookup } from '../terms/glossary';
import type { TermGlossaryEntry } from '../terms/types';
import { analyzeConnectivity } from '../validate/connectivity';
import {
  evaluateCompetencyQuestions,
  buildGraphPathChecker,
  type CqGraphEdge,
} from '../validate/cq';
import { buildBridgeSuggestions } from '../bridge/cross-partition';
import type { Pattern } from '../patterns/types';

// PRD-H (M5): 전체 수용 시나리오 스모크 — lib/오케스트레이션 계층에서 hermetic 하게
// 6단계를 최대한 인코딩한다(네트워크·LLM·DB 없음). 카드 UI 마운트가 아니라
// "판정·검증 로직"이 시나리오대로 흐르는지를 검증한다.

const FMEA_BUNDLE = BOOTSTRAP_PATTERNS.find((p) => p.key === 'diagnostic-fmea')!;

function fmeaPattern(): Pattern {
  return {
    id: 'pat-fmea-1',
    key: FMEA_BUNDLE.key,
    name: FMEA_BUNDLE.name,
    nameKo: FMEA_BUNDLE.nameKo,
    version: 1,
    domain: FMEA_BUNDLE.domain,
    roles: FMEA_BUNDLE.roles,
    relationTypes: FMEA_BUNDLE.relationTypes,
    competencyQuestions: FMEA_BUNDLE.competencyQuestions,
    traversalTemplates: FMEA_BUNDLE.traversalTemplates,
    method: 'synthesized',
    sourceRepo: null,
    sourceUri: null,
    sourceLabel: null,
    license: null, // 미확인 라이선스 — 발행 경고 대상.
    occurrenceCount: 1,
    isDraft: false,
    previousVersionId: null,
    createdAt: '2026-07-02T00:00:00Z',
  };
}

describe('PRD-H M5 스모크: 진단 노트 → 단일 연결 + CQ 통과율', () => {
  it('단계1: 인지→(캐시 미스)→발견→역할 타이핑 생성→병합/용어→단일 연결+CQ 4/4', async () => {
    const domain = 'diagnostic';

    // 인지 후 캐시 조회: 비어 있으면 미스 → 발견/합성 경로로 간다.
    const cacheMiss = selectCachedPattern(domain, []);
    expect(cacheMiss).toBeNull();

    // 발견물 = FMEA 패턴(초안 확정 가정).
    const pattern = fmeaPattern();
    const roleNames = pattern.roles.map((r) => r.name);

    // 역할 타이핑 생성: 엔티티가 패턴 역할로 타이핑된다(평탄 아님).
    const enforced = enforcePatternRoles(
      [
        { name: '에어압 저하', type: 'Symptom' },
        { name: '밸브 고착', type: 'FailureMode' },
        { name: '솔레노이드 불량', type: 'Cause' },
        { name: '밸브 교체', type: 'Action' },
        { name: '육안 점검', type: 'Inspection' },
        { name: '밸브 본체', type: 'Part' },
        { name: 'VV', type: 'Part' }, // 정의 없는 약어 → 용어 해소 대상.
      ],
      roleNames,
    );
    expect(enforced.warnings).toHaveLength(0); // 전부 역할에 매핑됨.

    // HITL 계획: 미정의 용어(VV)가 컨펌 대상으로 잡힌다(자동 확정 없음).
    const plan = buildHitlPlan({
      entities: enforced.entities,
      relations: pattern.relationTypes.map((r) => ({ name: r.name })),
      pattern: {
        roleNames,
        relationNames: pattern.relationTypes.map((r) => r.name),
      },
    });
    expect(plan.terms).toContain('VV');

    // 용어 해소: 도메인 용어집으로 VV → 밸브(도메인-스코프, 확정은 컨펌).
    const glossary: TermGlossaryEntry[] = [
      {
        id: 'g1', domain, partitionId: null, term: 'VV', meaning: '밸브',
        source: 'user', confidence: 0.92, evidence: '인접 노드: 솔레노이드',
        createdAt: '2026-07-02T00:00:00Z',
      },
    ];
    const lookup = makeGlossaryLookup(glossary);
    const vv = lookup(domain, 'VV');
    expect(vv?.meaning).toBe('밸브');

    // 노드 id 로 그래프 구성(용어 해소 후 단일 연결이 되도록 관계를 잇는다).
    const S = 'n-symptom', F = 'n-failuremode', C = 'n-cause';
    const A = 'n-action', I = 'n-inspection', P = 'n-part';
    const cqEdges: CqGraphEdge[] = [
      { sourceId: S, targetId: F, relationName: 'indicates' },
      { sourceId: F, targetId: C, relationName: 'caused_by' },
      { sourceId: F, targetId: I, relationName: 'detected_by' },
      { sourceId: C, targetId: A, relationName: 'resolved_by' },
      { sourceId: A, targetId: P, relationName: 'part_of' },
    ];
    const nodes = [S, F, C, A, I, P].map((id) => ({ id }));

    // 단일 연결 확인(파편화 없음).
    const conn = analyzeConnectivity(
      nodes,
      cqEdges.map((e) => ({ sourceId: e.sourceId, targetId: e.targetId })),
    );
    expect(conn.componentCount).toBe(1);
    expect(conn.isConnected).toBe(true);
    expect(conn.warning).toBeNull();

    // CQ 통과율 4/4.
    const cq = evaluateCompetencyQuestions(
      pattern.competencyQuestions,
      pattern.traversalTemplates,
      buildGraphPathChecker(cqEdges),
    );
    expect(cq.label).toBe('4/4');
    expect(cq.results.every((r) => r.passed)).toBe(true);
  });

  it('병합 전(고립 조각)에는 "N개로 분리" 경고가 뜬다', () => {
    // 표면형만 다른 동일 대상이 아직 병합되지 않아 두 조각으로 분리된 상태.
    const conn = analyzeConnectivity(
      [{ id: 'air-1' }, { id: 'fail-1' }, { id: 'airpressure-2' }, { id: 'cause-2' }],
      [
        { sourceId: 'air-1', targetId: 'fail-1' },
        { sourceId: 'airpressure-2', targetId: 'cause-2' },
      ],
    );
    expect(conn.isConnected).toBe(false);
    expect(conn.warning).toContain('분리');
  });

  it('답 경로가 없는 CQ 는 실패로 표시된다', () => {
    const pattern = fmeaPattern();
    // resolved_by 엣지 없음 → "원인 Y의 조치는?" CQ 실패.
    const edges: CqGraphEdge[] = [
      { sourceId: 's', targetId: 'f', relationName: 'indicates' },
      { sourceId: 'f', targetId: 'c', relationName: 'caused_by' },
      { sourceId: 'f', targetId: 'i', relationName: 'detected_by' },
      { sourceId: 'p1', targetId: 'p2', relationName: 'part_of' },
    ];
    const cq = evaluateCompetencyQuestions(
      pattern.competencyQuestions,
      pattern.traversalTemplates,
      buildGraphPathChecker(edges),
    );
    expect(cq.label).toBe('3/4');
    const failed = cq.results.find((r) => !r.passed);
    expect(failed?.cq).toContain('조치');
  });
});

describe('PRD-H M5 스모크: 캐시 수렴 · 분기 · 브릿지', () => {
  it('단계2: 같은 도메인 2번째 입력은 캐시 히트(재합성 없음)', () => {
    const cached = fmeaPattern();
    const synthesize = vi.fn(); // 캐시 히트면 절대 호출되지 않아야 한다.

    const hit = selectCachedPattern('diagnostic', [cached]);
    if (!hit) synthesize();

    expect(hit).not.toBeNull();
    expect(hit?.key).toBe('diagnostic-fmea');
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('단계3: 현재 패턴 밖 요소는 분기(fork)로 새 구획을 제안한다', async () => {
    const pattern = fmeaPattern();
    const judgment = await judgeDrift(
      { kind: 'concept', name: '승인요청', description: '행정 승인 흐름' },
      { domain: pattern.domain, roles: pattern.roles, relationTypes: pattern.relationTypes },
      {
        alignFn: async () => null, // 기존 역할/관계에 정렬 불가.
        domainFitFn: async () => ({
          inDomain: false, // 도메인 밖 → 분기.
          rationale: '행정 도메인 — 진단 패턴 밖',
          confidence: 0.8,
        }),
      },
    );
    expect(judgment.decision).toBe('fork');
  });

  it('단계4: 같은 대상이 두 구획에 등장하면 브릿지 후보가 생긴다', () => {
    const suggestions = buildBridgeSuggestions([
      {
        sourceId: '11111111-1111-1111-1111-111111111111',
        targetId: '22222222-2222-2222-2222-222222222222',
        sourceName: '펌프447', targetName: '펌프447',
        sourcePartition: 'p-maint', targetPartition: 'p-admin',
        kind: 'instance', vectorScore: 0.95, trigramScore: 0.9,
      },
    ]);
    expect(suggestions).toHaveLength(1);
    expect(suggestions[0].relationType).toBe('same_as');
  });

  it('단계6: 미정의 용어는 감지만 되고 컨펌 전에는 확정되지 않는다', () => {
    // detect 는 목록만 만든다(자동 확정 없음) — 확정은 카드 컨펌 시.
    const terms = detectTermsNeedingResolution([{ name: 'VV', type: 'Part' }]);
    expect(terms).toEqual(['VV']);
  });
});
