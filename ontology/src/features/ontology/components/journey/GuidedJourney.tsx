'use client';

import { useState, useCallback } from 'react';
import {
  bridgesApi,
  driftApi,
  dedupApi,
  enrichApi,
  constraintsApi,
  type DetectSubgraphInput,
} from '../../api';
import { useOntologyStore } from '../../hooks/useOntologyStore';
import { usePatternGeneration } from '../../hooks/usePatternGeneration';
import { useResolveTerms, useConfirmTerm } from '../../hooks/useTerms';
import { useCreateBridge } from '../../hooks/useBridges';
import { usePromotePattern } from '../../hooks/usePatterns';
import PatternDiscoveryPanel, {
  type PatternGenerateArgs,
} from '../patterns/PatternDiscoveryPanel';
import type { PatternReviewData } from '../patterns/PatternReviewSequence';
import type { TermCandidate, TermResolution } from '../../lib/terms/types';
import type { BridgeSuggestion } from '../../lib/bridge/cross-partition';
import type { Pattern } from '../../lib/patterns/types';
import type { DriftElement, DriftJudgment } from '../../lib/patterns/drift';
import { extendedPatternToPromote, type ExtendedPatternDraft } from '../../lib/patterns/extend';
import { buildParseSchemaContext } from '../../lib/schema-context';
import { reviewProposal, type CriticIssue } from '../../lib/critic/review';
import type { ParsedExtraction } from '../../lib/parse-mapping';
import type { HitlDedupItem } from '../../lib/patterns/hitl';
import type { GovernanceProposal } from '../../lib/schemas';
import type { EnrichmentItem } from '../../lib/enrich-types';
import JourneyStepper, { type JourneyStep } from './JourneyStepper';

const MAX_CONTEXT_NODES = 40;

// PRD-I (M2): 가이드 여정의 전체 단계. term/drift/bridge 검수는 단일 `review` 단계로 접는다.
const JOURNEY_STEPS: JourneyStep[] = [
  { id: 'domain', label: '도메인 인지' },
  { id: 'pattern', label: '패턴 선택' },
  { id: 'generate', label: '생성' },
  { id: 'review', label: '검수' },
  { id: 'validate', label: '검증' },
  { id: 'commit', label: '커밋' },
  { id: 'publish', label: '발행' },
];

// 감지된 미정의·모호 용어를 현재 온톨로지 맥락으로 좁혀 후보(랭킹)로 해소한다. 웹은 off.
async function resolveDetectedTerms(
  terms: string[],
  domain: string,
  resolve: (data: {
    terms: string[];
    domain: string;
    contextNodes: string[];
    allowWeb: boolean;
  }) => Promise<{ resolutions: TermResolution[] }>,
): Promise<TermResolution[]> {
  if (terms.length === 0) return [];
  const store = useOntologyStore.getState();
  const contextNodes = [
    ...store.classes.map((c) => c.name),
    ...store.instances.map((i) => i.name),
  ].slice(0, MAX_CONTEXT_NODES);
  try {
    const res = await resolve({ terms, domain, contextNodes, allowWeb: false });
    return res.resolutions;
  } catch {
    return [];
  }
}

// 크로스-구획 동일성 브릿지 후보(자동 생성 없음 — 표시만).
async function fetchBridgeSuggestions(): Promise<BridgeSuggestion[]> {
  try {
    const res = await bridgesApi.candidates();
    return res.suggestions;
  } catch {
    return [];
  }
}

// H5(M4): 패턴 밖 신규 요소를 판정(map/extend/fork)하고, 패턴 밖(≠map)이 있으면
// 드리프트 검수 카드에 넘길 패턴 객체 + 판정을 만든다. 자동 반영 없음(카드 컨펌 뒤).
async function judgeDriftForReview(
  args: PatternGenerateArgs,
  elements: DriftElement[],
): Promise<{ driftPattern: Pattern | null; driftJudgments: DriftJudgment[] }> {
  const empty = { driftPattern: null, driftJudgments: [] as DriftJudgment[] };
  if (elements.length === 0) return empty;
  const roles = args.patternContext.roles.map((r) => ({
    name: r.name,
    nodeKind: 'class' as const,
    description: r.description,
  }));
  try {
    const { judgments } = await driftApi.judge({
      domain: args.patternContext.domain,
      roles,
      relationTypes: args.patternContext.relationTypes,
      elements,
    });
    if (judgments.every((j) => j.decision === 'map')) return empty;
    const driftPattern: Pattern = {
      id: args.pattern.id ?? '',
      key: '',
      name: args.pattern.name,
      nameKo: args.pattern.name,
      version: 1,
      domain: args.patternContext.domain,
      roles,
      relationTypes: args.patternContext.relationTypes,
      competencyQuestions: args.patternContext.competencyQuestions,
      traversalTemplates: args.cq.traversalTemplates,
      method: 'synthesized',
      sourceRepo: null,
      sourceUri: null,
      sourceLabel: null,
      license: args.pattern.license,
      occurrenceCount: 1,
      isDraft: false,
      previousVersionId: null,
      createdAt: '',
    };
    return { driftPattern, driftJudgments: judgments };
  } catch {
    return empty;
  }
}

// PRD-I (M3, Task 3.2): 팝오버(NewNodePopover)의 네 결정을 그대로 재사용해 가이드 여정의
// 검수 단계(중복/거버넌스/보강/Critic)를 채운다. LLM/parse 는 재실행하지 않고, 이미 매핑된
// 결과(mapped)와 api.ts/lib 함수만 사용한다. 각 호출은 개별 try/catch 로 감싸 한 단계가
// 실패해도 여정 전체가 중단되지 않게 한다(팝오버의 fire-and-forget 자세와 동일).

const norm = (s: string): string => s.trim().toLowerCase();

// PRD-E P2-5 중복 대조 — 팝오버 runDedup 과 동일. 신규 노드만 대상으로 후보 조회 → LLM 판정.
// 방금 삽입된 자기 자신은 이름으로 후보에서 제외(자기-중복 방지). decision==='new' 는 제외.
async function computeDedup(
  mapped: ParsedExtraction,
  preClassNames: Set<string>,
  preInstanceNames: Set<string>,
  schemaContext: string,
): Promise<HitlDedupItem[]> {
  const store = useOntologyStore.getState();
  const nameById = new Map<string, string>();
  store.classes.forEach((c) => nameById.set(c.id, c.name));
  store.instances.forEach((i) => nameById.set(i.id, i.name));

  const items = [
    ...mapped.classes
      .filter((c) => !preClassNames.has(c.name))
      .map((c) => ({ name: c.name, type: c.parentName ?? 'class', description: c.description, kind: 'class' as const })),
    ...mapped.instances
      .filter((i) => !preInstanceNames.has(i.name))
      .map((i) => ({ name: i.name, type: i.className, description: i.description, kind: 'instance' as const })),
  ];

  const out: HitlDedupItem[] = [];
  for (const it of items) {
    try {
      const { candidates } = await dedupApi.candidates({
        text: `${it.name} ${it.description ?? ''}`.trim(),
        kind: it.kind,
        k: 8,
      });
      // 방금 생성된 자기 자신은 후보에서 뺀다(post-creation self-match 방지).
      const filtered = candidates.filter((c) => norm(c.name) !== norm(it.name));
      const decision = await dedupApi.resolve({
        input: { name: it.name, type: it.type, description: it.description },
        candidates: filtered,
        schemaContext,
      });
      if (decision.decision === 'new') continue;
      out.push({
        name: it.name,
        decision: decision.decision,
        targetName: decision.targetId ? nameById.get(decision.targetId) ?? null : null,
        relationType: decision.relationType,
        confidence: decision.confidence,
        evidence: decision.reason,
      });
    } catch {
      // 개별 항목 실패는 건너뛴다 — 나머지 판정은 계속.
    }
  }
  return out;
}

// PRD-E P2-7 거버넌스 — 팝오버 runGovernance 과 동일(enrichApi.suggestGovernance).
async function computeGovernance(text: string, schemaContext: string): Promise<GovernanceProposal[]> {
  if (!text.trim()) return [];
  try {
    const res = await enrichApi.suggestGovernance({ text, schemaContext });
    return res.proposals;
  } catch {
    return [];
  }
}

// A-3 보강 갭 탐지 — 팝오버 runGapDetection 과 동일. 매핑 서브그래프(+인접 기존 노드)를
// enrichApi.detect 로 넘긴다. 고립(isolated)은 섬 영역 담당이라 여기서 제외.
async function computeEnrichment(mapped: ParsedExtraction): Promise<EnrichmentItem[]> {
  const store = useOntologyStore.getState();
  const propCountByClassId = new Map<string, number>();
  store.properties.forEach((p) => {
    propCountByClassId.set(p.classId, (propCountByClassId.get(p.classId) ?? 0) + 1);
  });
  const existingByName = new Map(store.classes.map((c) => [c.name, c]));
  const newNames = new Set(mapped.classes.map((c) => c.name));

  const nodes: DetectSubgraphInput['nodes'] = mapped.classes.map((c) => ({
    name: c.name,
    type: c.parentName,
    description: c.description,
    evidence: c.evidence,
  }));

  const adjacent = new Set<string>();
  mapped.relations.forEach((r) => {
    adjacent.add(r.sourceName);
    adjacent.add(r.targetName);
  });
  mapped.classes.forEach((c) => {
    if (c.parentName) adjacent.add(c.parentName);
  });
  for (const name of adjacent) {
    if (newNames.has(name)) continue;
    const ec = existingByName.get(name);
    if (!ec) continue;
    nodes.push({
      name: ec.name,
      type: null,
      description: ec.description,
      evidence: 'existing',
      propertyCount: propCountByClassId.get(ec.id) ?? 0,
    });
  }

  const subgraph: DetectSubgraphInput = {
    nodes,
    relations: mapped.relations.map((r) => ({
      source: r.sourceName,
      target: r.targetName,
      type: r.relationName,
      confidence: r.confidence,
    })),
  };

  try {
    const { gaps } = await enrichApi.detect(subgraph);
    return gaps
      .filter((g) => g.kind !== 'isolated')
      .map((g) => ({ id: `${g.targetName}::${g.kind}`, gap: g, proposals: [] }));
  } catch {
    return [];
  }
}

// S4 Critic 검수 — 팝오버와 동일한 결정론 검수기(reviewProposal, 네트워크 0). 기존과 이름이
// 같은(=재사용될) 신규는 proposed 에서 제외하고, existing 은 생성 전(pre-gen) 이름을 쓴다
// (이미 삽입된 새 노드가 자기 자신과 중복 판정되는 것을 막기 위함).
function computeCritic(
  mapped: ParsedExtraction,
  preClassNames: Set<string>,
  preInstanceNames: Set<string>,
): CriticIssue[] {
  const report = reviewProposal({
    proposed: {
      classes: mapped.classes
        .filter((c) => !preClassNames.has(c.name))
        .map((c) => ({ name: c.name, type: c.parentName, description: c.description, evidence: c.evidence })),
      instances: mapped.instances
        .filter((i) => !preInstanceNames.has(i.name))
        .map((i) => ({ name: i.name, className: i.className })),
      relations: mapped.relations.map((r) => ({
        source: r.sourceName,
        target: r.targetName,
        type: r.relationName,
      })),
    },
    existing: {
      classNames: [...preClassNames],
      instanceNames: [...preInstanceNames],
    },
  });
  return report.issues;
}

export default function GuidedJourney() {
  const guidedOpen = useOntologyStore((s) => s.guidedOpen);
  const guidedInitialText = useOntologyStore((s) => s.guidedInitialText);
  const closeGuided = useOntologyStore((s) => s.closeGuided);

  // PRD-H H8 (M5): 생성 완료 후 패널을 검수(HITL) 모드로 유지시키는 데이터.
  const [review, setReview] = useState<PatternReviewData | null>(null);
  const [reviewDomain, setReviewDomain] = useState<string | null>(null);
  // PRD-I (M3): 보강 소싱(enrichApi.source)의 context 로 쓸 생성 시드 텍스트.
  const [reviewText, setReviewText] = useState('');
  // H5(M4) 분기(fork): 발견 게이트를 새 개념들로 다시 열 때의 씨앗 텍스트.
  const [forkText, setForkText] = useState('');

  const runPatternGeneration = usePatternGeneration();
  const resolveTerms = useResolveTerms();
  const confirmTerm = useConfirmTerm();
  const createBridge = useCreateBridge();
  const promotePattern = usePromotePattern();

  const closePatternPanel = useCallback(() => {
    setReview(null);
    setReviewDomain(null);
    setReviewText('');
    setForkText('');
    closeGuided();
  }, [closeGuided]);

  // 컨펌 후에만 호출된다(게이트는 패널 내부). 시드 생성 → 진행형 렌더 →
  // 검수 계획(용어 해소 + 크로스-구획 브릿지) 수집. 검수할 게 있으면 패널을 유지한다.
  // 자동 반영 없음 — 반영은 각 카드 컨펌 뒤에서만(confirm-gate).
  const handlePatternGenerate = useCallback(
    async (args: PatternGenerateArgs) => {
      const domain = args.patternContext.domain;
      setReviewDomain(domain);
      setReviewText(args.text);

      // PRD-I (M3): 생성 전 이름 스냅샷 — 중복/Critic 검수의 "기존 모델" 기준. 생성 뒤에는
      // 새 노드가 이미 스토어에 들어가므로, 이걸로 판정해야 자기-중복 오탐을 막는다.
      const preState = useOntologyStore.getState();
      const preClassNames = new Set(preState.classes.map((c) => c.name));
      const preInstanceNames = new Set(preState.instances.map((i) => i.name));

      const gen = await runPatternGeneration(args);
      const detectedTerms = gen?.detectedTerms ?? [];
      const driftElements = gen?.driftElements ?? [];
      const mapped = gen?.mapped ?? null;

      const termResolutions = await resolveDetectedTerms(
        detectedTerms,
        domain,
        resolveTerms.mutateAsync,
      );
      const bridges = await fetchBridgeSuggestions();
      // H5(M4): 패턴 밖 요소를 판정(map/extend/fork)해 드리프트 검수 단계를 채운다.
      const { driftPattern, driftJudgments } = await judgeDriftForReview(args, driftElements);

      // PRD-I (M3, Task 3.2): 팝오버의 네 결정을 같은 api/lib 로 계산한다. 각 계산은
      // 내부에서 실패를 흡수(빈 배열)하므로 한 단계 실패가 여정을 중단시키지 않는다.
      let dedup: HitlDedupItem[] = [];
      let governance: GovernanceProposal[] = [];
      let enrichment: EnrichmentItem[] = [];
      let critic: CriticIssue[] = [];
      if (mapped) {
        const schemaContext = buildParseSchemaContext(useOntologyStore.getState());
        [dedup, governance, enrichment] = await Promise.all([
          computeDedup(mapped, preClassNames, preInstanceNames, schemaContext),
          computeGovernance(args.text, schemaContext),
          computeEnrichment(mapped),
        ]);
        critic = computeCritic(mapped, preClassNames, preInstanceNames);
      }

      const nothingToReview =
        termResolutions.length === 0 &&
        bridges.length === 0 &&
        !driftPattern &&
        dedup.length === 0 &&
        governance.length === 0 &&
        enrichment.length === 0 &&
        critic.length === 0;
      if (nothingToReview) {
        closePatternPanel();
        return;
      }
      setReview({
        termResolutions,
        driftPattern,
        driftJudgments,
        bridges,
        dedup,
        governance,
        enrichment,
        critic,
      });
    },
    [runPatternGeneration, resolveTerms, closePatternPanel],
  );

  // 확장(extend): 확장 초안을 캐시에 승격(패턴 버전업). 자동 아님 — 카드 컨펌 뒤.
  const handleReviewExtend = useCallback(
    (draft: ExtendedPatternDraft) => {
      promotePattern.mutate(extendedPatternToPromote(draft));
    },
    [promotePattern],
  );

  // 분기(fork): 현재 검수를 접고 발견 게이트를 분기된 개념들로 다시 연다(H2 발견 재호출).
  const handleReviewFork = useCallback((elements: DriftElement[]) => {
    setReview(null);
    setReviewDomain(null);
    setForkText(elements.map((e) => e.name).join(', '));
  }, []);

  const handleReviewConfirmTerm = useCallback(
    (term: string, candidate: TermCandidate) => {
      if (!reviewDomain) return;
      confirmTerm.mutate({
        domain: reviewDomain,
        term,
        meaning: candidate.meaning,
        source: candidate.source,
        confidence: candidate.confidence,
        evidence: candidate.rationale || null,
      });
    },
    [confirmTerm, reviewDomain],
  );

  const handleReviewManualTerm = useCallback(
    (term: string, meaning: string) => {
      if (!reviewDomain) return;
      confirmTerm.mutate({ domain: reviewDomain, term, meaning, source: 'user' });
    },
    [confirmTerm, reviewDomain],
  );

  const handleReviewConnectBridge = useCallback(
    (suggestion: BridgeSuggestion) => {
      const store = useOntologyStore.getState();
      const existing = store.relationTypes.find((rt) => rt.name === suggestion.relationType);
      const relationTypeId = existing?.id ?? store.addRelationType({ name: suggestion.relationType });
      createBridge.mutate({
        sourceId: suggestion.sourceId,
        targetId: suggestion.targetId,
        sourceKind: suggestion.kind,
        targetKind: suggestion.kind,
        relationTypeId,
        evidence: suggestion.evidence,
        confidence: suggestion.score,
      });
    },
    [createBridge],
  );

  // PRD-I (M3): 거버넌스 승인 → 팝오버 applyGovernance 와 동일하게 constraints 반영
  // (PRD-L M1: 'axiom' kind = 설명 메모 규칙 → kind='memo').
  // 실패는 조용히 흡수(fire-and-forget) — 여정 진행은 카드가 스스로 다음 스텝으로 넘긴다.
  const handleReviewApproveGovernance = useCallback((p: GovernanceProposal) => {
    const store = useOntologyStore.getState();
    const classId = (n?: string | null) =>
      n ? store.classes.find((c) => c.name === n)?.id ?? null : null;
    const relId = (n?: string | null) =>
      n ? store.relationTypes.find((r) => r.name === n)?.id ?? null : null;
    const propId = (cn?: string | null, pn?: string | null) => {
      const cid = classId(cn);
      if (!cid || !pn) return null;
      return store.properties.find((p2) => p2.classId === cid && p2.name === pn)?.id ?? null;
    };

    if (p.kind === 'axiom') {
      void constraintsApi
        .create({
          kind: 'memo',
          constraintType: null,
          description: p.axiomLogic ? `${p.title} — ${p.axiomLogic}` : p.title,
          sourceClassId: classId(p.targetClass),
          targetClassId: null,
          relationTypeId: null,
          propertyId: null,
          config: {},
          severity: 'warning',
          isActive: true,
          sourceType: 'inferred',
          confidence: p.confidence,
          evidence: p.evidence,
        })
        .catch(() => {
          // 반영 실패는 조용히 흡수 — 검수 흐름은 계속.
        });
      return;
    }
    const typeMap: Record<string, 'cardinality' | 'disjoint' | 'domain_range' | 'property_value'> = {
      constraint_cardinality: 'cardinality',
      edge_cardinality: 'cardinality',
      constraint_disjoint: 'disjoint',
      constraint_domain_range: 'domain_range',
      constraint_property_value: 'property_value',
      property_enum: 'property_value',
      property_required: 'property_value',
    };
    const config: Record<string, unknown> = {};
    if (p.minCardinality != null) config.min = p.minCardinality;
    if (p.maxCardinality != null) config.max = p.maxCardinality;
    if (p.enumValues?.length) config.enumValues = p.enumValues;
    if (p.kind === 'property_required') config.required = true;
    if (p.disjointWith) config.disjointWith = p.disjointWith;
    void constraintsApi
      .create({
        kind: 'enforced',
        constraintType: typeMap[p.kind],
        description: p.title,
        sourceClassId: classId(p.targetClass),
        targetClassId: classId(p.disjointWith),
        relationTypeId: relId(p.relationType),
        propertyId: propId(p.targetClass, p.property),
        config,
        severity: 'warning',
        isActive: true,
        sourceType: 'inferred',
        confidence: p.confidence,
        evidence: p.evidence,
      })
      .catch(() => {
        // 반영 실패는 조용히 흡수 — 검수 흐름은 계속.
      });
  }, []);

  // PRD-I (M3): 중복 대조 확정 → 팝오버 relate 판정과 동일하게 기존 대상에 엣지를 잇는다.
  // 노드는 생성 단계에서 이미 삽입됐으므로, reuse/possible_duplicate 는 병합이 필요해
  // 사후 안전 반영이 어려워 여기서는 확인(스텝 넘김)만 한다.
  const handleReviewConfirmDedup = useCallback((item: HitlDedupItem) => {
    if (item.decision !== 'relate' || !item.targetName || !item.relationType) return;
    const store = useOntologyStore.getState();
    const from =
      store.classes.find((c) => c.name === item.name) ??
      store.instances.find((i) => i.name === item.name);
    const targetName = item.targetName;
    const target =
      store.classes.find((c) => c.name === targetName) ??
      store.instances.find((i) => i.name === targetName);
    if (!from || !target || from.id === target.id) return;
    const fromKind: 'class' | 'instance' = store.classes.some((c) => c.id === from.id)
      ? 'class'
      : 'instance';
    const targetKind: 'class' | 'instance' = store.classes.some((c) => c.id === target.id)
      ? 'class'
      : 'instance';
    const relationType = item.relationType;
    const existing = store.relationTypes.find((rt) => rt.name === relationType);
    const relationTypeId = existing?.id ?? store.addRelationType({ name: relationType });
    store.addEdge({
      sourceId: from.id,
      targetId: target.id,
      sourceKind: fromKind,
      targetKind,
      relationTypeId,
      sourceType: 'user',
      confidence: null,
      evidence: null,
    });
  }, []);

  // PRD-I (M3): 보강 채택 → 팝오버 handleConfirm 의 정의 반영과 동일. 정의 계열 갭만 노드
  // 설명에 최고 확신 제안을 출처와 함께 반영한다(생성된 노드를 사후 업데이트).
  const handleReviewAdoptEnrichment = useCallback((item: EnrichmentItem) => {
    if (item.gap.kind !== 'no_definition' && item.gap.kind !== 'undefined_concept') return;
    const best = [...item.proposals].sort((a, b) => b.confidence - a.confidence)[0];
    if (!best) return;
    const store = useOntologyStore.getState();
    const cls = store.classes.find((c) => c.name === item.gap.targetName);
    if (cls) {
      store.updateClass(cls.id, {
        description: best.value,
        sourceType: best.sourceType,
        confidence: best.confidence,
        evidence: best.evidence,
      });
      return;
    }
    const inst = store.instances.find((i) => i.name === item.gap.targetName);
    if (inst) store.updateInstance(inst.id, { description: best.value });
  }, []);

  // PRD-I (M3): 보강 소싱 → 팝오버 handleSourceEnrichment 와 동일(enrichApi.source, 웹 off).
  // 결과 제안을 같은 항목에 채워 넣어(배열 길이·순서 유지) 카드가 "채택"으로 전환되게 한다.
  const handleReviewSourceEnrichment = useCallback(
    async (item: EnrichmentItem) => {
      try {
        const { proposals } = await enrichApi.source({
          gap: item.gap,
          context: reviewText,
          useWeb: false,
        });
        setReview((prev) =>
          prev
            ? {
                ...prev,
                enrichment: (prev.enrichment ?? []).map((e) =>
                  e.id === item.id ? { ...e, proposals } : e,
                ),
              }
            : prev,
        );
      } catch {
        // 소싱 실패는 조용히 흡수 — 항목은 소싱 전 상태로 남는다.
      }
    },
    [reviewText],
  );

  if (!guidedOpen) return null;

  // 현재 phase → 스테퍼 매핑(best-effort). 발견 상태의 세부(도메인 vs 패턴)는
  // 패널 내부(useDiscoverPattern)에만 있으므로 여기선 review/reviewDomain 로 근사한다.
  const currentStepId = review ? 'review' : reviewDomain ? 'generate' : 'domain';
  const completedIds = review
    ? ['domain', 'pattern', 'generate']
    : reviewDomain
      ? ['domain', 'pattern']
      : [];

  const seedText = forkText || guidedInitialText || '';

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-background/70 backdrop-blur-sm pt-24"
      data-testid="guided-journey-overlay"
      onClick={closePatternPanel}
    >
      <div className="flex items-start gap-4" onClick={(e) => e.stopPropagation()}>
        <aside className="w-[150px] rounded-xl border border-border bg-card p-3 shadow-elevation-2">
          <JourneyStepper
            steps={JOURNEY_STEPS}
            currentStepId={currentStepId}
            completedIds={completedIds}
          />
        </aside>
        <PatternDiscoveryPanel
          key={`pattern-panel-${seedText}`}
          initialText={seedText}
          onGenerate={handlePatternGenerate}
          onCancel={closePatternPanel}
          review={review}
          onReviewConfirmTerm={handleReviewConfirmTerm}
          onReviewManualTerm={handleReviewManualTerm}
          onReviewExtend={handleReviewExtend}
          onReviewFork={handleReviewFork}
          onReviewConnectBridge={handleReviewConnectBridge}
          onReviewConfirmDedup={handleReviewConfirmDedup}
          onReviewApproveGovernance={handleReviewApproveGovernance}
          onReviewAdoptEnrichment={handleReviewAdoptEnrichment}
          onReviewSourceEnrichment={handleReviewSourceEnrichment}
          onReviewComplete={closePatternPanel}
        />
      </div>
    </div>
  );
}
