'use client';

import { useState, useEffect, useCallback, useMemo, useRef, Fragment } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { X, Paperclip, ClipboardPaste, ArrowRight, ArrowLeft, Check, Trash2, Loader2, ChevronRight, ChevronLeft, ChevronDown, Link2, Plus, Table, AlertTriangle, Wand2, Circle, CircleDot } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { NODE_COLORS } from '../constants/colors';
import {
  NodeKindToggle,
  NODE_KIND_QUESTION,
  NODE_KIND_DESCRIPTIONS,
} from './NodeKindToggle';
import { llmApi, enrichApi, dedupApi, constraintsApi, type LlmParseResult, type DetectSubgraphInput } from '../api';
import { mapParseResult, findPossibleDuplicates, computeIslands, partitionRelationsByLayer } from '../lib/parse-mapping';
import { stableEntityId, stableEdgeId } from '../lib/identity';
import { DEFAULT_PARTITION_ID } from '../lib/types';
import { reviewProposal, type CriticIssue, type CriticSeverity } from '../lib/critic/review';
import {
  buildTriage,
  classSelKey,
  propSelKey,
  instSelKey,
  relSelKey,
  type TriageReasonCode,
} from '../lib/confirm-triage';
import { buildParseSchemaContext } from '../lib/schema-context';
import type { EnrichmentItem, EnrichProposal } from '../lib/enrich-types';
import type { GovernanceProposal, DedupResolveResponse } from '../lib/schemas';
import IslandList from './preview/IslandList';
import EnrichmentCard from './preview/EnrichmentCard';
import GovernanceProposalCard from './preview/GovernanceProposalCard';
import { toast } from 'sonner';
import { calcPopoverPosition } from '../lib/popover-position';
import { useDraggable } from '../hooks/useDraggable';
import { useClassAutocomplete, fuzzyMatch } from '../hooks/useAutocomplete';
import AutocompleteSuggestions from './AutocompleteSuggestions';

type ParsedResult = ReturnType<typeof mapParseResult>;

function mockParse(input: string): ParsedResult {
  const lines = input.split('\n').map((l) => l.trim()).filter(Boolean);
  const result: ParsedResult = { classes: [], properties: [], relations: [], instances: [], warnings: [] };

  lines.forEach((line) => {
    if (line.startsWith('#') || line.startsWith('class:') || line.startsWith('클래스:')) {
      const name = line.replace(/^(#|class:|클래스:)\s*/, '').trim();
      if (name) result.classes.push({ name, description: '', color: NODE_COLORS.mid, parentName: null });
    } else if (line.startsWith('prop:') || line.startsWith('속성:')) {
      const parts = line.replace(/^(prop:|속성:)\s*/, '').split(':').map((s) => s.trim());
      result.properties.push({
        name: parts[0] ?? line,
        dataType: parts[1] ?? 'string',
        className: '',
        isRequired: false,
        enumValues: null,
      });
    } else if (line.includes('->') || line.includes('\u2192')) {
      const parts = line.split(/->|\u2192/).map((s) => s.trim());
      if (parts.length >= 2) {
        result.relations.push({ relationName: 'relates_to', sourceName: parts[0], targetName: parts[1] });
      }
    } else {
      result.classes.push({ name: line, description: '', color: NODE_COLORS.mid, parentName: null });
    }
  });

  if (result.classes.length === 0 && input.trim()) {
    result.classes.push({ name: input.trim().substring(0, 50), description: '', color: NODE_COLORS.mid, parentName: null });
  }

  return result;
}

interface TreeItem {
  type: 'class' | 'instance';
  name: string;
  className?: string;
  depth: number;
  isExisting: boolean;
  originalIndex: number;
}

function buildTreeItems(
  parsed: ParsedResult,
  existingClassNames: Set<string>,
): TreeItem[] {
  const items: TreeItem[] = [];
  const classNames = new Set(parsed.classes.map((c) => c.name));

  const childrenOf = new Map<string | null, number[]>();
  parsed.classes.forEach((cls, i) => {
    const parent = cls.parentName && (classNames.has(cls.parentName) || existingClassNames.has(cls.parentName))
      ? cls.parentName
      : null;
    const list = childrenOf.get(parent) ?? [];
    list.push(i);
    childrenOf.set(parent, list);
  });

  const addedInst = new Set<number>();

  function walk(parentName: string | null, depth: number) {
    const children = childrenOf.get(parentName) ?? [];
    for (const idx of children) {
      const cls = parsed.classes[idx];
      const isExisting = existingClassNames.has(cls.name);
      items.push({ type: 'class', name: cls.name, depth, isExisting, originalIndex: idx });

      parsed.instances.forEach((inst, instIdx) => {
        if (inst.className === cls.name) {
          items.push({
            type: 'instance',
            name: inst.name,
            className: inst.className,
            depth: depth + 1,
            isExisting: false,
            originalIndex: instIdx,
          });
          addedInst.add(instIdx);
        }
      });

      walk(cls.name, depth + 1);
    }
  }

  walk(null, 0);

  // Instances whose className is an existing class not in parsed results
  const addedExistingParents = new Set<string>();
  parsed.instances.forEach((inst, instIdx) => {
    if (!classNames.has(inst.className) && existingClassNames.has(inst.className)) {
      if (!addedExistingParents.has(inst.className)) {
        items.push({
          type: 'class',
          name: inst.className,
          depth: 0,
          isExisting: true,
          originalIndex: -1,
        });
        addedExistingParents.add(inst.className);
      }
      items.push({
        type: 'instance',
        name: inst.name,
        className: inst.className,
        depth: 1,
        isExisting: false,
        originalIndex: instIdx,
      });
      addedInst.add(instIdx);
    }
  });

  // Orphan instances (no resolvable parent class — e.g. just converted from a
  // class). Shown at depth 0 so the user can assign a parent.
  parsed.instances.forEach((inst, instIdx) => {
    if (addedInst.has(instIdx)) return;
    items.push({
      type: 'instance',
      name: inst.name,
      className: inst.className,
      depth: 0,
      isExisting: false,
      originalIndex: instIdx,
    });
  });

  return items;
}

const popoverAnimation = {
  initial: { opacity: 0, scale: 0.95, y: -8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, damping: 25, stiffness: 350 } },
  exit: { opacity: 0, scale: 0.95, y: -8, transition: { duration: 0.15 } },
};

const POPOVER_WIDTH = 400;
const POPOVER_EST_HEIGHT = 400;

// PRD-K M3 (A11): 팝오버 경로에도 여정과 통일된 단계 안내 — 입력→분석→검토→확정.
// JourneyStepper 의 상태 문법(완료 Check/현재 CircleDot/예정 Circle + 동일 색)을 계승한 가로형.
const PHASE_STEPS = [
  { id: 'input', label: '입력' },
  { id: 'loading', label: '분석' },
  { id: 'preview', label: '검토' },
  { id: 'confirm', label: '확정' },
] as const;

function PhaseMiniStepper({ current }: { current: number }) {
  return (
    <ol data-testid="phase-stepper" className="mb-2 flex items-center gap-1.5">
      {PHASE_STEPS.map((step, i) => {
        const state: 'completed' | 'current' | 'upcoming' =
          i < current ? 'completed' : i === current ? 'current' : 'upcoming';
        const Icon = state === 'completed' ? Check : state === 'current' ? CircleDot : Circle;
        return (
          <li key={step.id} data-state={state} className="flex items-center gap-1">
            <Icon
              className={`h-3 w-3 shrink-0 ${
                state === 'completed'
                  ? 'text-success'
                  : state === 'current'
                    ? 'text-primary'
                    : 'text-muted-foreground/60'
              }`}
            />
            <span
              className={`text-[11px] leading-none ${
                state === 'current'
                  ? 'font-medium text-primary'
                  : state === 'completed'
                    ? 'text-foreground'
                    : 'text-muted-foreground'
              }`}
            >
              {step.label}
            </span>
            {i < PHASE_STEPS.length - 1 && <span className="mx-0.5 h-px w-3 bg-border" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

// PRD-K M3 (A8·A13): 우측 적층 5섹션을 순차 검수 스텝으로 — 항상 건너뛰고 확정 가능.
const AUX_STEPS = ['구조 검수', '보강', '중복 확인', '규칙 제안'] as const;

// PRD-I (M3, Task 3.3): 입력이 이 길이를 넘거나 CSV 탭이면 "가이드 여정" 전환을 권한다.
// (짧은 텍스트/빠른 입력은 절대 권하지 않는다 — Quick 경로 무회귀.)
const GUIDED_SUGGEST_THRESHOLD = 280;

// PRD-E P2-5: 중복대조 결정 배지
const DEDUP_LABEL: Record<string, string> = {
  reuse: '재사용',
  relate: '관계',
  possible_duplicate: '중복 가능',
  new: '신규',
};
const DEDUP_BADGE: Record<string, string> = {
  reuse: 'border-emerald-400 text-emerald-600',
  relate: 'border-blue-400 text-blue-600',
  possible_duplicate: 'border-amber-400 text-amber-600',
  new: 'border-muted-foreground/40 text-muted-foreground',
};

// PRD-L M2: 관계 레이어 배지 — semantic(지식)/kinetic(행동) 2레이어를 색으로 구분.
const LAYER_LABEL: Record<string, string> = {
  semantic: '지식',
  kinetic: '행동',
};
const LAYER_BADGE: Record<string, string> = {
  semantic: 'border-violet-400 text-violet-600',
  kinetic: 'border-sky-400 text-sky-600',
};
// PRD-L M2: 레이어 툴팁 보조문구.
const LAYER_HINT: Record<string, string> = {
  semantic: '시멘틱 레이어 — 구성·인과·서술 등 지식 관계',
  kinetic: '키네틱 레이어 — 점검·교체·실행 등 행동 관계',
};

// S4: Critic 검수 — 심각도 배지/라벨, 이슈 식별 키.
const CRITIC_SEVERITY_LABEL: Record<CriticSeverity, string> = { high: '높음', med: '중간', low: '낮음' };
const CRITIC_SEVERITY_BADGE: Record<CriticSeverity, string> = {
  high: 'border-red-400 text-red-600',
  med: 'border-amber-400 text-amber-600',
  low: 'border-muted-foreground/40 text-muted-foreground',
};
const criticKey = (i: CriticIssue) => `${i.ruleId}::${i.targetName}::${i.relatedName ?? ''}`;

// PRD-K M3: 프리뷰 선택(체크박스) 키 — 안정 식별자는 confirm-triage 에서 단일 정의.
// (트리아지 맵과 excludedKeys 가 같은 키 공간을 공유하도록 lib 로 수렴.)

// PRD-L M5: 저신뢰 표면화 사유 배지 문구.
const TRIAGE_REASON_LABEL: Record<TriageReasonCode, string> = {
  low_confidence: '확신 낮음',
  critic: 'Critic 지적',
  unresolved: '연결 미해소',
};

// PRD-K M3: 검토 표면 승격 임계 — 이하이면 팝오버 유지(기존 경로 보존).
const SMALL_RESULT_CLASSES = 3;
const SMALL_RESULT_RELATIONS = 5;
// PRD-L M5: 저신뢰(review) 항목이 이 수 이상이면 검토 표면으로 승격.
const REVIEW_PROMOTE_MIN = 3;

export default function NewNodePopover() {
  const popoverState = useOntologyStore((s) => s.popoverState);
  const closePopover = useOntologyStore((s) => s.closePopover);
  const openGuided = useOntologyStore((s) => s.openGuided);
  const addClass = useOntologyStore((s) => s.addClass);
  const addProperty = useOntologyStore((s) => s.addProperty);
  const addRelationType = useOntologyStore((s) => s.addRelationType);
  const addEdge = useOntologyStore((s) => s.addEdge);
  const addInstance = useOntologyStore((s) => s.addInstance);
  const currentPartitionId = useOntologyStore((s) => s.currentPartitionId);
  const setInstanceValue = useOntologyStore((s) => s.setInstanceValue);

  const classes = useOntologyStore((s) => s.classes);
  const relationTypes = useOntologyStore((s) => s.relationTypes);
  const instances = useOntologyStore((s) => s.instances);
  const properties = useOntologyStore((s) => s.properties);
  const edges = useOntologyStore((s) => s.edges);

  // PRD-K M2 (A1): 킬러 기능(자연어→AI 구조화)이 첫 화면 — 더블클릭 진입 기본 탭은 text.
  const [activeTab, setActiveTab] = useState<'quick' | 'text' | 'csv'>('text');
  const [phase, setPhase] = useState<'input' | 'loading' | 'preview'>('input');
  const [inputText, setInputText] = useState('');
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  // A-5: enrichment proposals (populated by A-3/A-4) and the set the user adopts.
  const [enrichments, setEnrichments] = useState<EnrichmentItem[]>([]);
  const [adoptedEnrichments, setAdoptedEnrichments] = useState<Set<string>>(new Set());
  const [enrichLoading, setEnrichLoading] = useState(false);
  // A-4: web search is opt-in, OFF by default. Tracks which gaps are mid-sourcing.
  const [useWeb, setUseWeb] = useState(false);
  const [sourcingIds, setSourcingIds] = useState<Set<string>>(new Set());
  // PRD-E P2-7: 거버넌스 제안 (HITL — 승인 전 미반영)
  const [governance, setGovernance] = useState<GovernanceProposal[]>([]);
  const [governanceLoading, setGovernanceLoading] = useState(false);
  const [appliedGov, setAppliedGov] = useState<Set<number>>(new Set());
  const [applyingGov, setApplyingGov] = useState<Set<number>>(new Set());
  const [ignoredGov, setIgnoredGov] = useState<Set<number>>(new Set());
  // PRD-E P2-5: 중복대조 판정 (노드 이름 → reuse/relate/possible_duplicate/new)
  const [dedup, setDedup] = useState<Map<string, DedupResolveResponse>>(new Map());
  const [dedupLoading, setDedupLoading] = useState(false);
  // S4: Critic 검수에서 사용자가 무시한 이슈 키 집합(읽기전용 자문 — 확정 차단 안 함).
  const [ignoredCritic, setIgnoredCritic] = useState<Set<string>>(new Set());
  // PRD-K M3: 항목별 체크박스 제외 집합(기본 전체 선택) — "확정"은 체크된 것만 반영.
  const [excludedKeys, setExcludedKeys] = useState<Set<string>>(new Set());
  // PRD-K M3: 프리뷰 이탈 가드 — 배경 클릭/Esc 시 초안 소실 확인.
  const [exitGuardOpen, setExitGuardOpen] = useState(false);
  // PRD-K M3: 부가 검수(검수·보강·중복·규칙)의 현재 스텝 — 언제든 건너뛰고 확정 가능.
  const [auxStep, setAuxStep] = useState(0);
  // PRD-L M5: 고신뢰(auto) 묶음 펼침 여부 — 기본 접힘(저신뢰만 표면화). 저신뢰가 없으면
  // 접을 게 없으므로 렌더 시 자동으로 펼쳐 보인다(아래 isAutoOpen).
  const [autoExpanded, setAutoExpanded] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  // PRD-K M2 (A6): 가짜 진행률 대신 정직한 표시 — 실제 파이프라인 단계 안내 + 경과시간.
  const [elapsedSec, setElapsedSec] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // PRD-K M2 (A10): "파일" 버튼이 여는 숨김 파일 선택 input.
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const stopElapsedTimer = useCallback(() => {
    if (elapsedIntervalRef.current) {
      clearInterval(elapsedIntervalRef.current);
      elapsedIntervalRef.current = null;
    }
  }, []);

  const startElapsedTimer = useCallback(() => {
    stopElapsedTimer();
    setElapsedSec(0);
    const startedAt = Date.now();
    elapsedIntervalRef.current = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - startedAt) / 1000));
    }, 1000);
  }, [stopElapsedTimer]);

  useEffect(() => stopElapsedTimer, [stopElapsedTimer]);

  // 팝오버를 헤더로 드래그해 옮길 수 있게 한다(하단에서 가려질 때 위로 이동).
  const drag = useDraggable();
  // 팝오버가 새로 열리면(트리거 위치 변경) 누적 이동량을 초기화한다.
  const popoverOpenKey = popoverState ? `${popoverState.position.x},${popoverState.position.y}` : null;
  useEffect(() => {
    drag.reset();
  }, [popoverOpenKey, drag.reset]);

  // Quick input state
  const [quickName, setQuickName] = useState('');
  const [quickDesc, setQuickDesc] = useState('');
  const [quickType, setQuickType] = useState<'class' | 'instance'>('class');
  const [quickParentId, setQuickParentId] = useState<string>('');

  // CSV state (M5: raw table text; analysis reuses the LLM parse/preview path)
  const [csvText, setCsvText] = useState('');

  // Autocomplete state
  const classAC = useClassAutocomplete();
  const [showClassAC, setShowClassAC] = useState(false);
  const localClassMatches = useMemo(
    () => fuzzyMatch(classes, quickName),
    [classes, quickName],
  );

  const isOpen = popoverState?.type === 'newNode';
  const initialTextRef = useRef<string | null>(null);
  const autoTriggerRef = useRef(false);

  // Pre-fill text from EmptyState inline input
  useEffect(() => {
    // initialText 가 비어 있어도(빈 문자열) 텍스트(붙여넣기) 탭으로 진입시킨다.
    // 단, 자동 파싱은 실제 내용이 있을 때만 트리거(빈 입력 파싱 방지).
    if (isOpen && popoverState?.initialText !== undefined && popoverState.initialText !== initialTextRef.current) {
      initialTextRef.current = popoverState.initialText;
      setInputText(popoverState.initialText);
      setActiveTab('text');
      autoTriggerRef.current = popoverState.initialText.trim().length > 0;
    }
    if (!isOpen) {
      initialTextRef.current = null;
      autoTriggerRef.current = false;
    }
  }, [isOpen, popoverState?.initialText]);

  const existingClassNames = useMemo(
    () => new Set(classes.map((c) => c.name)),
    [classes],
  );

  const treeItems = useMemo(
    () => (parsed ? buildTreeItems(parsed, existingClassNames) : []),
    [parsed, existingClassNames],
  );

  const newCount = useMemo(() => {
    if (!parsed) return { classes: 0, instances: 0 };
    const newClasses = parsed.classes.filter((c) => !existingClassNames.has(c.name)).length;
    return { classes: newClasses, instances: parsed.instances.length };
  }, [parsed, existingClassNames]);

  // PRD-K M3: 체크박스 토글 + 선택 요약(sticky 요약 헤더용).
  const toggleSelKey = useCallback((key: string) => {
    setExcludedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectionSummary = useMemo(() => {
    if (!parsed) return null;
    const newClasses = parsed.classes.filter((c) => !existingClassNames.has(c.name));
    const counts = {
      classes: newClasses.filter((c) => !excludedKeys.has(classSelKey(c.name))).length,
      properties: parsed.properties.filter((p) => !excludedKeys.has(propSelKey(p.className, p.name))).length,
      instances: parsed.instances.filter((i) => !excludedKeys.has(instSelKey(i.name))).length,
      relations: parsed.relations.filter((r) => !excludedKeys.has(relSelKey(r))).length,
    };
    const total =
      newClasses.length + parsed.properties.length + parsed.instances.length + parsed.relations.length;
    const selected = counts.classes + counts.properties + counts.instances + counts.relations;
    return { ...counts, excluded: total - selected, totalDraft: total };
  }, [parsed, existingClassNames, excludedKeys]);

  // A-2: new class names that resemble an existing class (synonym suspects). Not
  // auto-merged — surfaced as a "중복 가능" flag that links to the P0-2 ER queue.
  const possibleDuplicates = useMemo(() => {
    if (!parsed) return new Map<string, string>();
    const newNames = parsed.classes
      .filter((c) => !existingClassNames.has(c.name))
      .map((c) => c.name);
    return findPossibleDuplicates(newNames, [...existingClassNames]);
  }, [parsed, existingClassNames]);

  // A-5: disconnected nodes (honest islands) shown in the 섬 area.
  const islands = useMemo(
    () => (parsed ? computeIslands(parsed) : []),
    [parsed],
  );

  // PRD-L M2: semantic(지식)/kinetic(행동) 2레이어로 표시 분할 (동등한 두 묶음).
  const relationGroups = useMemo(
    () =>
      parsed
        ? partitionRelationsByLayer(parsed.relations)
        : { semantic: [], kinetic: [] },
    [parsed],
  );

  // S4: Critic 검수 리포트 — 결정론 검수기를 클라이언트에서 직접 돌린다(네트워크 0,
  // 실패 모드 0). 기존과 이름이 동일한(=재사용될) 노드는 proposed에서 제외해 노이즈를
  // 줄인다. 기존 이름은 existing으로 넘겨 미정의/중복 판정의 기준이 되게 한다.
  const criticReport = useMemo(() => {
    if (!parsed) return null;
    const existingInst = new Set(instances.map((i) => i.name));
    return reviewProposal({
      proposed: {
        classes: parsed.classes
          .filter((c) => !existingClassNames.has(c.name))
          .map((c) => ({ name: c.name, type: c.parentName, description: c.description, evidence: c.evidence })),
        instances: parsed.instances
          .filter((i) => !existingInst.has(i.name))
          .map((i) => ({ name: i.name, className: i.className })),
        relations: parsed.relations.map((r) => ({
          source: r.sourceName,
          target: r.targetName,
          type: r.relationName,
        })),
      },
      existing: {
        classNames: classes.map((c) => c.name),
        instanceNames: instances.map((i) => i.name),
      },
    });
  }, [parsed, classes, instances, existingClassNames]);

  // S4 + PRD-L M5: 사용자가 무시하지 않은 Critic 이슈만 표시·트리아지에 반영.
  const visibleCriticIssues = useMemo(
    () => (criticReport ? criticReport.issues.filter((i) => !ignoredCritic.has(criticKey(i))) : []),
    [criticReport, ignoredCritic],
  );

  // PRD-L M5: 신뢰도 트리아지 — 항목별 고신뢰(auto)/저신뢰(review) 판정 + 요약 카운트.
  // 무시된 Critic 이슈는 review 사유에서 빠지므로, 무시 즉시 해당 항목이 auto 로 내려간다.
  const triage = useMemo(
    () =>
      parsed
        ? buildTriage(
            parsed,
            existingClassNames,
            new Set(instances.map((i) => i.name)),
            visibleCriticIssues,
          )
        : null,
    [parsed, existingClassNames, instances, visibleCriticIssues],
  );

  // A-1.1: class names available as instance parents (extracted + existing).
  const allClassNames = useMemo(() => {
    const names = new Set<string>();
    parsed?.classes.forEach((c) => names.add(c.name));
    classes.forEach((c) => names.add(c.name));
    return [...names];
  }, [parsed, classes]);

  const resetAndClose = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopElapsedTimer();
    setPhase('input');
    setActiveTab('text');
    setInputText('');
    setParsed(null);
    setEnrichments([]);
    setAdoptedEnrichments(new Set());
    setEnrichLoading(false);
    setSourcingIds(new Set());
    setUseWeb(false);
    setGovernance([]);
    setGovernanceLoading(false);
    setAppliedGov(new Set());
    setApplyingGov(new Set());
    setIgnoredGov(new Set());
    setDedup(new Map());
    setDedupLoading(false);
    setIsLoading(false);
    setElapsedSec(0);
    setQuickName('');
    setQuickDesc('');
    setQuickType('class');
    setQuickParentId('');
    setCsvText('');
    setIgnoredCritic(new Set());
    setExcludedKeys(new Set());
    setExitGuardOpen(false);
    setAuxStep(0);
    setAutoExpanded(false);
    classAC.clear();
    setShowClassAC(false);
    closePopover();
  }, [closePopover, classAC, stopElapsedTimer]);

  // PRD-K M3: 이탈 가드 — 프리뷰에 초안이 있으면 확인 후에만 버린다(실수 1클릭 소실 방지).
  const draftCount = parsed
    ? parsed.classes.length + parsed.properties.length + parsed.instances.length + parsed.relations.length
    : 0;
  const requestClose = useCallback(() => {
    const hasDraft = phase === 'preview' && draftCount > 0;
    if (hasDraft) {
      setExitGuardOpen(true);
      return;
    }
    resetAndClose();
  }, [phase, draftCount, resetAndClose]);

  // Esc key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (exitGuardOpen) {
          setExitGuardOpen(false);
          return;
        }
        requestClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, exitGuardOpen, requestClose]);

  // 취소 시 입력 텍스트는 그대로 보존된 입력 화면으로 복귀한다(PRD-K M2).
  const handleCancelLoading = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    stopElapsedTimer();
    setPhase('input');
    setIsLoading(false);
    setElapsedSec(0);
  }, [stopElapsedTimer]);

  if (!isOpen) return null;

  // --- Quick input handler ---
  const handleQuickAdd = () => {
    if (!quickName.trim()) return;

    if (quickType === 'class') {
      addClass({
        name: quickName.trim(),
        description: quickDesc.trim(),
        color: NODE_COLORS.mid,
        parentId: quickParentId || undefined,
        positionX: popoverState!.position.x + Math.random() * 200 - 100,
        positionY: popoverState!.position.y + Math.random() * 200 - 100,
      });
    } else {
      if (!quickParentId) {
        toast.error('인스턴스는 부모 클래스가 필요합니다');
        return;
      }
      addInstance({
        name: quickName.trim(),
        classId: quickParentId,
      });
    }

    toast.success(`${quickType === 'class' ? '클래스' : '인스턴스'} "${quickName.trim()}" 추가됨`);
    setQuickName('');
    setQuickDesc('');
    setQuickType('class');
    setQuickParentId('');
  };

  // PRD-I (M3, Task 3.3): 큰 입력을 가이드 여정으로 넘긴다. 현재 입력 텍스트를 씨앗으로
  // 실어 보내고 팝오버를 닫는다. Quick 경로(짧은 텍스트)에서는 이 버튼이 뜨지 않는다.
  const handleSwitchToGuided = () => {
    const seed = activeTab === 'csv' ? csvText : inputText;
    openGuided(seed);
    resetAndClose();
  };

  // PRD-K M2 (A10): 동작하지 않던 "파일/붙여넣기" 버튼 구현 — 파일 텍스트 삽입 + 클립보드 읽기.
  const appendToInput = (text: string) => {
    setInputText((prev) => (prev.trim() ? `${prev}\n${text}` : text));
  };

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      if (!text.trim()) {
        toast.info('빈 파일입니다', { description: '텍스트가 있는 파일을 선택해 주세요.' });
        return;
      }
      appendToInput(text);
    } catch {
      toast.error('파일을 읽지 못했습니다', {
        description: '텍스트 파일(.txt, .md, .csv)인지 확인해 주세요.',
      });
    }
  };

  const handlePasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (!text.trim()) {
        toast.info('클립보드가 비어 있습니다');
        return;
      }
      appendToInput(text);
    } catch {
      toast.error('클립보드를 읽지 못했습니다', {
        description: '브라우저 권한을 확인하거나 Ctrl+V로 직접 붙여넣어 주세요.',
      });
    }
  };

  // PRD-K M2 (A1): 짧은 한 단어 입력이면 "빠른 추가로 충분해요" 힌트로 Quick 유도(강제 없음).
  const trimmedInput = inputText.trim();
  const suggestQuick =
    trimmedInput.length > 0 && trimmedInput.length <= 20 && !/\s/.test(trimmedInput);
  const handleSwitchToQuick = () => {
    setQuickName(trimmedInput);
    setActiveTab('quick');
  };

  // A-3: detect enrichment gaps for the freshly-extracted subgraph (+ adjacent
  // existing nodes). Runs after the preview is shown; failure is non-fatal.
  const runGapDetection = async (mapped: ParsedResult) => {
    const propCountByClassId = new Map<string, number>();
    properties.forEach((p) => {
      propCountByClassId.set(p.classId, (propCountByClassId.get(p.classId) ?? 0) + 1);
    });
    const existingByName = new Map(classes.map((c) => [c.name, c]));
    const newNames = new Set(mapped.classes.map((c) => c.name));

    const nodes: DetectSubgraphInput['nodes'] = mapped.classes.map((c) => ({
      name: c.name,
      type: c.parentName,
      description: c.description,
      evidence: c.evidence,
    }));

    // Adjacent existing nodes (referenced as relation endpoints or parent types).
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

    setEnrichLoading(true);
    try {
      const { gaps, llmDetectionFailed } = await enrichApi.detect(subgraph);
      // M5: 정성 갭 탐지가 실패하면 결과가 "완전"해 보이지 않도록 알린다.
      if (llmDetectionFailed) {
        toast.warning('보강 갭 분석 일부 실패', {
          description: 'AI 갭 탐지가 실패해 기본 규칙 결과만 표시됩니다.',
        });
      }
      // Islands are shown in the 섬 area; enrichment cards cover the rest.
      const items: EnrichmentItem[] = gaps
        .filter((g) => g.kind !== 'isolated')
        .map((g) => ({ id: `${g.targetName}::${g.kind}`, gap: g, proposals: [] }));
      setEnrichments(items);
    } catch {
      setEnrichments([]);
    } finally {
      setEnrichLoading(false);
    }
  };

  // --- Text / CSV input (LLM) handler ---
  // M5: same two-stage parse + preview pipeline for both. kind="csv" routes to
  // the CSV-specialized prompts and a 15,000-char cap (capped by total text, not
  // row count). The source is unified into inputText so the preview's
  // governance / 보강 / 중복검사 (which read inputText) work for CSV too.
  const TEXT_CHAR_LIMIT = 8000;
  const CSV_CHAR_LIMIT = 15000;
  const handleGenerate = async (opts?: { source?: string; kind?: 'text' | 'csv' }) => {
    const kind = opts?.kind ?? 'text';
    const source = opts?.source ?? inputText;
    if (!source.trim()) return;

    // PATCH-4: single-call parse cap. Block giant inputs before the round-trip so
    // we don't fall into the retry loop or silently mock-parse garbage.
    const charLimit = kind === 'csv' ? CSV_CHAR_LIMIT : TEXT_CHAR_LIMIT;
    if (source.length > charLimit) {
      toast.error(kind === 'csv' ? 'CSV 데이터가 너무 깁니다' : '문서가 너무 깁니다', {
        description: `${source.length.toLocaleString()}자 — ${charLimit.toLocaleString()}자 이하로 나눠 입력해 주세요.`,
      });
      return;
    }

    if (kind === 'csv') setInputText(source);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    // PRD-K M2 (A6·A7): 입력 길이와 무관하게 동일한 로딩 화면. 가짜 %-진행률 대신
    // 실제 파이프라인 단계(엔티티 추출→관계 추론)를 안내하고 경과시간을 표시한다.
    setPhase('loading');
    startElapsedTimer();
    setIsLoading(true);

    try {
      const result: LlmParseResult = await llmApi.parse({
        text: source,
        inputKind: kind,
        existingClasses: classes.map((c) => c.name),
        existingRelationTypes: relationTypes.map((r) => r.name),
        existingSchema: classes.length
          ? buildParseSchemaContext({ classes, instances, properties, relationTypes, edges })
          : undefined,
      });

      if (controller.signal.aborted) return;

      stopElapsedTimer();

      const mapped = mapParseResult(
        result,
        existingClassNames,
        new Set(instances.map((i) => i.name)),
      );
      // H1: 라우트 레벨 경고(예: 관계 추출 단계 실패)를 매핑 경고 앞에 합쳐 검토 UI에 노출.
      if (result.warnings?.length) {
        mapped.warnings = [
          ...result.warnings.map((message) => ({
            kind: 'empty_relations' as const,
            message,
          })),
          ...mapped.warnings,
        ];
      }
      setParsed(mapped);
      setPhase('preview');
      void runGapDetection(mapped);
    } catch {
      if (controller.signal.aborted) return;

      stopElapsedTimer();

      // CSV has no sensible row-by-row fallback (mockParse would make one class
      // per row). Surface the failure and return to input instead.
      if (kind === 'csv') {
        toast.error('CSV 분석 실패', {
          description: '다시 시도하거나, 데이터 양을 줄여 입력해 주세요.',
        });
        setPhase('input');
        return;
      }

      toast.error('AI 구조화 실패 — 기본 파서로 대체', {
        description: '기본 파서는 클래스만 추출하며 속성·관계는 빠질 수 있습니다. 결과를 확인하거나 다시 시도해 주세요.',
      });
      const result = mockParse(source);
      setParsed(result);
      setPhase('preview');
      void runGapDetection(result);
    } finally {
      stopElapsedTimer();
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  // PRD-E P2-7: 거버넌스 제안 받기 (텍스트 근거 기반, HITL).
  const runGovernance = async () => {
    if (!inputText.trim()) return;
    setGovernanceLoading(true);
    try {
      const schemaContext = buildParseSchemaContext({
        classes, instances, properties, relationTypes, edges,
      });
      const res = await enrichApi.suggestGovernance({ text: inputText, schemaContext });
      setGovernance(res.proposals);
      setAppliedGov(new Set());
      setIgnoredGov(new Set());
    } catch {
      toast.error('거버넌스 제안에 실패했습니다.');
    } finally {
      setGovernanceLoading(false);
    }
  };

  // 거버넌스 제안 승인 → constraints 테이블 기록 + 출처 (PRD-L M1: 단일 규칙 모델).
  const applyGovernance = async (p: GovernanceProposal, idx: number) => {
    setApplyingGov((prev) => new Set(prev).add(idx));
    try {
      const classId = (n?: string | null) =>
        n ? classes.find((c) => c.name === n)?.id ?? null : null;
      const relId = (n?: string | null) =>
        n ? relationTypes.find((r) => r.name === n)?.id ?? null : null;
      const propId = (cn?: string | null, pn?: string | null) => {
        const cid = classId(cn);
        if (!cid || !pn) return null;
        return properties.find((p2) => p2.classId === cid && p2.name === pn)?.id ?? null;
      };

      if (p.kind === 'axiom') {
        // 'axiom' 제안 = 설명 메모 규칙 제안 — constraints(kind='memo')로 기록.
        await constraintsApi.create({
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
        });
      } else {
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
        await constraintsApi.create({
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
        });
      }
      setAppliedGov((prev) => new Set(prev).add(idx));
      toast.success('거버넌스 제안이 반영되었습니다.');
    } catch {
      toast.error('반영에 실패했습니다.');
    } finally {
      setApplyingGov((prev) => {
        const n = new Set(prev);
        n.delete(idx);
        return n;
      });
    }
  };

  // PRD-E P2-5: 추가하려는 신규 노드를 기존과 중복대조 (의미+오타→LLM 판정).
  const runDedup = async () => {
    if (!parsed) return;
    setDedupLoading(true);
    try {
      const schemaContext = buildParseSchemaContext({
        classes, instances, properties, relationTypes, edges,
      });
      const items: { name: string; type: string; description?: string; kind: 'class' | 'instance' }[] = [
        ...parsed.classes
          .filter((c) => !existingClassNames.has(c.name))
          .map((c) => ({ name: c.name, type: c.parentName ?? 'class', description: c.description, kind: 'class' as const })),
        ...parsed.instances
          .filter((i) => !instances.some((ex) => ex.name === i.name))
          .map((i) => ({ name: i.name, type: i.className, description: i.description, kind: 'instance' as const })),
      ];
      const results = new Map<string, DedupResolveResponse>();
      for (const it of items) {
        const { candidates } = await dedupApi.candidates({
          text: `${it.name} ${it.description ?? ''}`.trim(),
          kind: it.kind,
          k: 8,
        });
        const decision = await dedupApi.resolve({
          input: { name: it.name, type: it.type, description: it.description },
          candidates,
          schemaContext,
        });
        results.set(it.name, decision);
      }
      setDedup(results);
      toast.success('중복 검사 완료');
    } catch {
      toast.error('중복 검사에 실패했습니다.');
    } finally {
      setDedupLoading(false);
    }
  };

  const handleConfirm = () => {
    if (!parsed) return;

    // PRD-K M3: 부분 반영 — 체크 해제(제외)된 항목을 뺀 유효 결과만 확정한다.
    const effective: ParsedResult = {
      ...parsed,
      classes: parsed.classes.filter(
        (c) => existingClassNames.has(c.name) || !excludedKeys.has(classSelKey(c.name)),
      ),
      properties: parsed.properties.filter((p) => !excludedKeys.has(propSelKey(p.className, p.name))),
      instances: parsed.instances.filter((i) => !excludedKeys.has(instSelKey(i.name))),
      relations: parsed.relations.filter((r) => !excludedKeys.has(relSelKey(r))),
    };

    // PRD-K M3: 확정 피드백 — 생성 수 집계 + 새 노드 하이라이트 + 일괄 되돌리기.
    const temporalBefore = useOntologyStore.temporal.getState().pastStates.length;
    const createdNodeIds: string[] = [];
    let createdClassCount = 0;
    let createdInstanceCount = 0;
    let createdEdgeCount = 0;

    // P1-1: 이 확정으로 만드는 노드는 현재 구획에 속한다. 안정 id 산출에 같은
    // 구획을 써 재유입 시 동일 id 로 수렴시킨다(random UUID 대신 content-hash).
    const partition = currentPartitionId ?? DEFAULT_PARTITION_ID;

    // PRD-E P2-5: reuse 는 생성 스킵하고 기존 id 로 별칭. relate 는 생성 후 엣지 추가.
    const relateLinks: { fromName: string; targetId: string; relationType: string }[] = [];

    // A-5: adopted definition-style enrichments to apply onto the node (with provenance).
    const adoptedDefinition = new Map<string, EnrichProposal>();
    enrichments.forEach((item) => {
      if (!adoptedEnrichments.has(item.id) || item.proposals.length === 0) return;
      if (item.gap.kind !== 'no_definition' && item.gap.kind !== 'undefined_concept') return;
      const best = [...item.proposals].sort((a, b) => b.confidence - a.confidence)[0];
      const existing = adoptedDefinition.get(item.gap.targetName);
      if (!existing || best.confidence > existing.confidence) {
        adoptedDefinition.set(item.gap.targetName, best);
      }
    });

    // Pre-populate with existing store classes so incremental dumps can reference them
    const classIdMap = new Map<string, string>();
    classes.forEach((c) => classIdMap.set(c.name, c.id));

    // Topological sort: classes whose parentName is another new class should come after it
    const sorted = [...effective.classes];
    sorted.sort((a, b) => {
      if (a.name === b.parentName) return -1;
      if (b.name === a.parentName) return 1;
      if (a.parentName && !b.parentName) return 1;
      if (!a.parentName && b.parentName) return -1;
      return 0;
    });

    sorted.forEach((cls) => {
      // Skip existing classes — already in store
      if (existingClassNames.has(cls.name)) return;

      // PRD-E P2-5: 중복대조 판정 반영
      const dd = dedup.get(cls.name);
      if (dd?.decision === 'reuse' && dd.targetId) {
        classIdMap.set(cls.name, dd.targetId); // 기존 노드 재사용 (생성 0)
        return;
      }
      if (dd?.decision === 'relate' && dd.targetId && dd.relationType) {
        relateLinks.push({ fromName: cls.name, targetId: dd.targetId, relationType: dd.relationType });
      }

      let parentId: string | undefined;
      if (cls.parentName) {
        parentId = classIdMap.get(cls.parentName);
      }
      const enrich = adoptedDefinition.get(cls.name);
      const id = addClass({
        id: stableEntityId(cls.name, 'class', partition),
        name: cls.name,
        description: enrich ? enrich.value : cls.description,
        color: cls.color ?? NODE_COLORS.mid,
        parentId,
        positionX: popoverState!.position.x + Math.random() * 200 - 100,
        positionY: popoverState!.position.y + Math.random() * 200 - 100,
        // Provenance: adopted enrichment, else the extraction evidence.
        sourceType: enrich ? enrich.sourceType : cls.evidence ? 'session_doc' : null,
        confidence: enrich ? enrich.confidence : null,
        evidence: enrich ? enrich.evidence : cls.evidence ?? null,
      });
      classIdMap.set(cls.name, id);
      createdNodeIds.push(id);
      createdClassCount++;
    });

    // Properties (class-level definitions). Reuse existing prop ids where present.
    const propIdMap = new Map<string, string>();
    effective.properties.forEach((prop) => {
      const classId = classIdMap.get(prop.className) ?? classIdMap.values().next().value;
      if (!classId) return;
      const existingProp = properties.find((p) => p.classId === classId && p.name === prop.name);
      if (existingProp) {
        propIdMap.set(`${prop.className}::${prop.name}`, existingProp.id);
        return;
      }
      const id = addProperty({
        name: prop.name,
        classId,
        dataType: prop.dataType as 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'enum',
        isRequired: prop.isRequired,
        enumValues: prop.enumValues,
      });
      propIdMap.set(`${prop.className}::${prop.name}`, id);
    });

    // Instances (+ their property values). Seed map with existing instances so
    // relations can reference them.
    const instanceIdMap = new Map<string, string>();
    instances.forEach((i) => instanceIdMap.set(i.name, i.id));
    effective.instances.forEach((inst) => {
      const classId = classIdMap.get(inst.className);
      if (!classId) return;
      // PRD-E P2-5: reuse 면 기존 인스턴스 재사용, relate 면 엣지 링크 기록
      const dd = dedup.get(inst.name);
      if (dd?.decision === 'reuse' && dd.targetId) {
        instanceIdMap.set(inst.name, dd.targetId);
        return;
      }
      if (dd?.decision === 'relate' && dd.targetId && dd.relationType) {
        relateLinks.push({ fromName: inst.name, targetId: dd.targetId, relationType: dd.relationType });
      }
      const instId = addInstance({
        id: stableEntityId(inst.name, 'instance', partition),
        name: inst.name,
        classId,
        description: inst.description ?? '',
      });
      instanceIdMap.set(inst.name, instId);
      createdNodeIds.push(instId);
      createdInstanceCount++;
      (inst.values ?? []).forEach((v) => {
        const propId = propIdMap.get(`${inst.className}::${v.propertyName}`);
        if (propId) setInstanceValue(instId, propId, v.value);
      });
    });

    // Relations — endpoints may be classes or instances. Reuse an existing
    // relation type by name (and dedupe within this batch) so we don't hit the
    // unique-name conflict on sync (which cascades into edge FK failures).
    const relTypeIdByName = new Map<string, string>();
    relationTypes.forEach((rt) => relTypeIdByName.set(rt.name, rt.id));

    const resolveNode = (name: string): { id: string; kind: 'class' | 'instance' } | null => {
      if (classIdMap.has(name)) return { id: classIdMap.get(name)!, kind: 'class' };
      if (instanceIdMap.has(name)) return { id: instanceIdMap.get(name)!, kind: 'instance' };
      return null;
    };
    effective.relations.forEach((rel) => {
      const src = resolveNode(rel.sourceName);
      const tgt = resolveNode(rel.targetName);
      if (src && tgt && src.id !== tgt.id) {
        let relTypeId = relTypeIdByName.get(rel.relationName);
        if (!relTypeId) {
          // PRD-L M2: 추출된 2레이어 분류를 relation type 에 부여.
          relTypeId = addRelationType({ name: rel.relationName, layer: rel.layer });
          relTypeIdByName.set(rel.relationName, relTypeId);
        }
        addEdge({
          id: stableEdgeId(src.id, tgt.id, rel.relationName),
          sourceId: src.id,
          targetId: tgt.id,
          sourceKind: src.kind,
          targetKind: tgt.kind,
          relationTypeId: relTypeId,
          sourceType: rel.evidence ? 'session_doc' : null,
          confidence: rel.confidence ?? null,
          evidence: rel.evidence ?? null,
        });
        createdEdgeCount++;
      }
    });

    // PRD-E P2-5: relate 판정 — 생성한 노드를 기존 노드에 엣지로 연결
    relateLinks.forEach((link) => {
      const from = resolveNode(link.fromName);
      if (!from || from.id === link.targetId) return;
      const targetKind: 'class' | 'instance' = classes.some((c) => c.id === link.targetId)
        ? 'class'
        : 'instance';
      let relTypeId = relTypeIdByName.get(link.relationType);
      if (!relTypeId) {
        relTypeId = addRelationType({ name: link.relationType });
        relTypeIdByName.set(link.relationType, relTypeId);
      }
      addEdge({
        id: stableEdgeId(from.id, link.targetId, link.relationType),
        sourceId: from.id,
        targetId: link.targetId,
        sourceKind: from.kind,
        targetKind,
        relationTypeId: relTypeId,
        sourceType: 'user',
        confidence: null,
        evidence: null,
      });
      createdEdgeCount++;
    });

    // PRD-K M3 (A5): 확정 피드백 3종 — ① 성공 토스트(+일괄 되돌리기) ② 새 노드
    // 캔버스 하이라이트(fit+pulse) ③ CommitBar 카운트는 pendingChanges 증가로 반영.
    const undoSteps = Math.max(
      0,
      useOntologyStore.temporal.getState().pastStates.length - temporalBefore,
    );
    const summaryText = [
      createdClassCount > 0 ? `클래스 ${createdClassCount}` : null,
      createdInstanceCount > 0 ? `인스턴스 ${createdInstanceCount}` : null,
      createdEdgeCount > 0 ? `관계 ${createdEdgeCount}` : null,
    ]
      .filter(Boolean)
      .join(', ');
    if (summaryText) {
      toast.success(`${summaryText} 추가됨`, {
        description: '새 항목이 캔버스에 강조 표시됩니다.',
        action:
          undoSteps > 0
            ? {
                label: '되돌리기',
                onClick: () => useOntologyStore.temporal.getState().undo(undoSteps),
              }
            : undefined,
      });
    } else {
      toast.info('반영할 새 항목이 없습니다', {
        description: '모두 제외됐거나 기존 항목과 중복(재사용)입니다.',
      });
    }
    if (createdNodeIds.length > 0) {
      useOntologyStore.getState().highlightNodes(createdNodeIds);
    }

    resetAndClose();
  };

  const removeItem = (type: keyof ParsedResult, index: number) => {
    if (!parsed) return;
    setParsed({
      ...parsed,
      [type]: parsed[type].filter((_, i) => i !== index),
    });
  };

  // A-1.1: let the user correct the LLM's class/instance classification before confirm.
  const convertToInstance = (classIndex: number) => {
    if (!parsed) return;
    const cls = parsed.classes[classIndex];
    if (!cls) return;
    setParsed({
      ...parsed,
      classes: parsed.classes.filter((_, i) => i !== classIndex),
      instances: [
        ...parsed.instances,
        { className: cls.parentName ?? '', name: cls.name, evidence: cls.evidence, values: [] },
      ],
    });
  };

  const convertToClass = (instIndex: number) => {
    if (!parsed) return;
    const inst = parsed.instances[instIndex];
    if (!inst) return;
    setParsed({
      ...parsed,
      instances: parsed.instances.filter((_, i) => i !== instIndex),
      classes: [
        ...parsed.classes,
        {
          name: inst.name,
          description: '',
          color: NODE_COLORS.mid,
          parentName: inst.className || null,
          evidence: inst.evidence,
        },
      ],
    });
  };

  const setInstanceParent = (instIndex: number, className: string) => {
    if (!parsed) return;
    setParsed({
      ...parsed,
      instances: parsed.instances.map((inst, i) =>
        i === instIndex ? { ...inst, className } : inst,
      ),
    });
  };

  // A-5 island connection suggestion — wired to enrichment sourcing in A-4.
  const handleIslandSuggest = (name: string) => {
    toast.info('연결 제안', {
      description: `"${name}" 연결 근거 탐색은 보강 단계에서 제공됩니다.`,
    });
  };

  const toggleAdoptEnrichment = (id: string) => {
    setAdoptedEnrichments((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const ignoreEnrichment = (id: string) => {
    setEnrichments((prev) => prev.filter((e) => e.id !== id));
    setAdoptedEnrichments((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  // A-4: source proposals for one gap (internal → session → opt-in web).
  const handleSourceEnrichment = async (item: EnrichmentItem) => {
    setSourcingIds((prev) => new Set(prev).add(item.id));
    try {
      const { proposals, webUsed } = await enrichApi.source({
        gap: item.gap,
        context: inputText,
        useWeb,
      });
      setEnrichments((prev) =>
        prev.map((e) => (e.id === item.id ? { ...e, proposals } : e)),
      );
      if (proposals.length === 0) {
        toast.info('보강 결과 없음', { description: `"${item.gap.targetName}"에 대한 근거를 찾지 못했습니다.` });
      } else if (webUsed) {
        toast.info('웹 보강', { description: '웹 출처는 검증이 필요합니다.' });
      }
    } catch {
      toast.error('보강 소싱 실패');
    } finally {
      setSourcingIds((prev) => {
        const next = new Set(prev);
        next.delete(item.id);
        return next;
      });
    }
  };

  // PR1 (목표①): 관계 한 줄 렌더 (액션/서술 공용). index 는 parsed.relations 원본 인덱스.
  const renderRelationRow = (
    rel: ParsedResult['relations'][number],
    index: number,
  ) => {
    // 표시 전용: 근거 문장을 노출해 검토를 돕는다. M6: AI 확신도(confidence)는 매 추출마다
    // 기준이 달라 재현 불가능한 신호라 사용자에게 숫자로 노출하지 않는다(값은 데이터로만 운반).
    const relExcluded = excludedKeys.has(relSelKey(rel));
    return (
      <div key={index} className={`py-0.5 group pl-1 ${relExcluded ? 'opacity-50' : ''}`}>
        <div className="flex items-center gap-1.5">
          <Checkbox
            checked={!relExcluded}
            onCheckedChange={() => toggleSelKey(relSelKey(rel))}
            className="h-4 w-4 shrink-0"
            aria-label={`포함: ${rel.sourceName} ${rel.relationName} ${rel.targetName}`}
          />
          <Link2 className="w-3 h-3 text-muted-foreground/60 shrink-0" />
          {rel.layer && (
            <Badge
              variant="outline"
              title={LAYER_HINT[rel.layer]}
              className={`text-xs h-5 px-1.5 shrink-0 ${LAYER_BADGE[rel.layer] ?? ''}`}
            >
              {LAYER_LABEL[rel.layer] ?? rel.layer}
            </Badge>
          )}
          <span className="text-xs">
            <span className={existingClassNames.has(rel.sourceName) ? 'text-muted-foreground' : ''}>{rel.sourceName}</span>
            <span className="text-muted-foreground mx-1">&rarr;</span>
            <span className="font-medium">{rel.relationName}</span>
            <span className="text-muted-foreground mx-1">&rarr;</span>
            <span className={existingClassNames.has(rel.targetName) ? 'text-muted-foreground' : ''}>{rel.targetName}</span>
          </span>
          <button
            className="ml-auto -my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-60 transition-opacity text-muted-foreground hover:text-destructive group-hover:opacity-100"
            onClick={() => removeItem('relations', index)}
            aria-label={`관계 삭제: ${rel.sourceName} → ${rel.targetName}`}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
        {rel.evidence && (
          <p
            className="text-[11px] text-muted-foreground/70 italic line-clamp-1 pl-[18px]"
            title={rel.evidence}
          >
            &ldquo;{rel.evidence}&rdquo;
          </p>
        )}
      </div>
    );
  };

  // PRD-K M3 (자산 재사용): 계층 트리 한 행 렌더. 트리아지 표면화를 위해 검토/자동
  // 두 곳에서 동일 마크업을 재사용하려고 인라인 map 에서 함수로 추출했다(행 JSX 불변).
  const renderTreeRow = (item: TreeItem, i: number) => {
    // PR1 (목표④): 인스턴스에 추출된 속성 값을 프리뷰에 노출(비가시 저장 방지).
    const instValues =
      item.type === 'instance' && item.originalIndex >= 0
        ? parsed?.instances[item.originalIndex]?.values ?? []
        : [];
    // PRD-K M3: 체크 해제(제외)된 행은 흐리게 — 확정에서 빠짐을 시각화.
    const itemSelKey = item.type === 'class' ? classSelKey(item.name) : instSelKey(item.name);
    const isItemExcluded = !item.isExisting && excludedKeys.has(itemSelKey);
    return (
      <Fragment key={`${item.type}-${item.name}-${i}`}>
        <div
          className={`flex items-center gap-1.5 py-0.5 group ${
            item.isExisting || isItemExcluded ? 'opacity-50' : ''
          }`}
          style={{ paddingLeft: `${item.depth * 16 + 4}px` }}
        >
          {!item.isExisting && (
            <Checkbox
              checked={!isItemExcluded}
              onCheckedChange={() => toggleSelKey(itemSelKey)}
              className="h-4 w-4 shrink-0"
              aria-label={`포함: ${item.name}`}
            />
          )}
          {item.type === 'class' ? (
            <>
              {item.depth > 0 && (
                <ChevronRight className="w-2.5 h-2.5 text-muted-foreground/50" />
              )}
              <span
                className="w-2 h-2 rounded-full shrink-0"
                style={{ backgroundColor: item.isExisting ? 'hsl(var(--muted-foreground))' : NODE_COLORS.mid }}
              />
              <Badge
                variant={item.isExisting ? 'outline' : 'secondary'}
                className={`text-[11px] h-5 ${item.isExisting ? 'border-dashed text-muted-foreground' : ''}`}
              >
                {item.isExisting ? '기존' : '+'} {item.name}
              </Badge>
              {item.isExisting && (
                <span className="text-[11px] text-muted-foreground italic">연결됨</span>
              )}
              {!item.isExisting && possibleDuplicates.has(item.name) && (
                <button
                  type="button"
                  title={`기존 "${possibleDuplicates.get(item.name)}"와(과) 유사 — 중복 검사로 이동`}
                  onClick={() => {
                    window.dispatchEvent(new Event('ontology:duplicate-check'));
                    toast.info('중복 검사', {
                      description: `"${item.name}" ≈ "${possibleDuplicates.get(item.name)}" — ER 큐에서 확인하세요.`,
                    });
                  }}
                  className="inline-flex items-center py-1 -my-1"
                >
                  <Badge
                    variant="outline"
                    className="text-[11px] h-5 px-1.5 border-dashed border-amber-400 text-amber-600 gap-0.5"
                  >
                    <AlertTriangle className="w-2.5 h-2.5" />
                    중복 가능
                  </Badge>
                </button>
              )}
              {!item.isExisting && item.originalIndex >= 0 && (
                <>
                  {/* PRD-L M4: 원탭 전환을 NodeKindToggle(compact)로 수렴 */}
                  <NodeKindToggle
                    kind="class"
                    compact
                    onToggle={() => convertToInstance(item.originalIndex)}
                    className="ml-auto"
                  />
                  <button
                    className="-my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-60 transition-opacity text-muted-foreground hover:text-destructive group-hover:opacity-100"
                    onClick={() => removeItem('classes', item.originalIndex)}
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </>
              )}
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-sm bg-emerald-400 shrink-0" />
              <Badge variant="secondary" className="text-[11px] h-5">
                + {item.name}
              </Badge>
              <Select
                value={item.className || undefined}
                onValueChange={(v) => setInstanceParent(item.originalIndex, v)}
              >
                <SelectTrigger
                  className={`h-6 text-[11px] px-2 w-auto gap-1 ${
                    item.className ? '' : 'border-amber-400 text-amber-600'
                  }`}
                >
                  <SelectValue placeholder="부모 선택" />
                </SelectTrigger>
                <SelectContent>
                  {allClassNames.map((cn) => (
                    <SelectItem key={cn} value={cn} className="text-xs">
                      {cn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {/* PRD-L M4: 원탭 전환을 NodeKindToggle(compact)로 수렴 */}
              <NodeKindToggle
                kind="instance"
                compact
                onToggle={() => convertToClass(item.originalIndex)}
                className="ml-auto"
              />
              <button
                className="-my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-60 transition-opacity text-muted-foreground hover:text-destructive group-hover:opacity-100"
                onClick={() => removeItem('instances', item.originalIndex)}
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </>
          )}
        </div>
        {instValues.length > 0 && (
          <div
            className="flex flex-wrap gap-1 py-0.5"
            style={{ paddingLeft: `${(item.depth + 1) * 16 + 8}px` }}
          >
            {instValues.map((v, vi) => (
              <span
                key={vi}
                className="text-[11px] font-mono text-muted-foreground bg-muted/50 rounded px-1"
              >
                {v.propertyName}: {v.value}
              </span>
            ))}
          </div>
        )}
      </Fragment>
    );
  };

  // PRD-L M5: 트리 항목의 트리아지 판정/사유 — 기존 노드는 초안이 아니므로 auto.
  const treeRowVerdict = (item: TreeItem) => {
    if (item.isExisting) return 'auto' as const;
    const key = item.type === 'class' ? classSelKey(item.name) : instSelKey(item.name);
    return triage?.byKey.get(key)?.verdict ?? 'auto';
  };
  const treeRowReasons = (item: TreeItem): TriageReasonCode[] => {
    if (item.isExisting) return [];
    const key = item.type === 'class' ? classSelKey(item.name) : instSelKey(item.name);
    return triage?.byKey.get(key)?.reasons ?? [];
  };

  // PRD-L M5: 저신뢰 사유 배지(평문, 12px). hover 전용 아님 — 상시 노출.
  const renderReasonBadges = (reasons: TriageReasonCode[]) =>
    reasons.length > 0 ? (
      <div className="flex flex-wrap items-center gap-1 pl-1">
        {reasons.map((r) => (
          <Badge
            key={r}
            variant="outline"
            className="text-[11px] h-5 px-1.5 border-amber-400 text-amber-600"
          >
            {TRIAGE_REASON_LABEL[r]}
          </Badge>
        ))}
      </div>
    ) : null;

  // A-5: the preview needs room for the structure / island / enrichment columns.
  const isPreview = phase === 'preview';
  // PRD-L M5: 트리아지 요약 카운트(파싱 전이면 0).
  const autoCount = triage?.autoCount ?? 0;
  const reviewCount = triage?.reviewCount ?? 0;
  // PRD-L M5: 저신뢰가 없으면 접을 게 없으므로 auto 묶음을 자동으로 펼쳐 보인다.
  const isAutoOpen = autoExpanded || reviewCount === 0;
  // PRD-K M3 + PRD-L M5: 검토 표면 자동 승격 — 소량(클래스 ≤3·관계 ≤5)은 현행 팝오버 유지,
  // 초과하거나 저신뢰(review)가 3개 이상이면 중앙 확대 검토 표면으로 승격한다.
  const isLargeResult =
    isPreview &&
    !!parsed &&
    (newCount.classes > SMALL_RESULT_CLASSES ||
      parsed.relations.length > SMALL_RESULT_RELATIONS ||
      reviewCount >= REVIEW_PROMOTE_MIN);
  const popoverW = isLargeResult
    ? Math.min(1040, typeof window !== 'undefined' ? window.innerWidth * 0.94 : 1040)
    : isPreview
      ? 720
      : POPOVER_WIDTH;
  const popoverPos = isLargeResult
    ? {
        left: Math.max(12, ((typeof window !== 'undefined' ? window.innerWidth : 1280) - popoverW) / 2),
        top: Math.max(12, (typeof window !== 'undefined' ? window.innerHeight : 800) * 0.07),
      }
    : popoverState
      ? calcPopoverPosition(popoverState.position, {
          w: popoverW,
          h: isPreview ? 540 : POPOVER_EST_HEIGHT,
        })
      : { left: 0, top: 0 };
  const previewColumnMaxH = isLargeResult ? 'max-h-[64vh]' : 'max-h-[440px]';

  // PRD-L M5: 트리아지 기준 분류 — 검토(저신뢰)는 상단 표면, 자동(고신뢰)은 접힘 묶음.
  const relIsReview = (rel: ParsedResult['relations'][number]) =>
    triage?.byKey.get(relSelKey(rel))?.verdict === 'review';
  const reviewTreeItems = parsed
    ? treeItems.map((item, i) => ({ item, i })).filter(({ item }) => treeRowVerdict(item) === 'review')
    : [];
  const autoTreeItems = parsed
    ? treeItems.map((item, i) => ({ item, i })).filter(({ item }) => treeRowVerdict(item) !== 'review')
    : [];
  const reviewRelations = parsed
    ? parsed.relations.map((rel, index) => ({ rel, index })).filter(({ rel }) => relIsReview(rel))
    : [];
  const autoSemantic = relationGroups.semantic.filter(({ rel }) => !relIsReview(rel));
  const autoKinetic = relationGroups.kinetic.filter(({ rel }) => !relIsReview(rel));

  // PRD-L M5: 확정 버튼 문구용 — 반영 대상 총수 + 그중 검토(review) 선택 수.
  const appliedCount = selectionSummary
    ? selectionSummary.classes +
      selectionSummary.properties +
      selectionSummary.instances +
      selectionSummary.relations
    : 0;
  const reviewSelectedCount = triage
    ? [...triage.byKey.entries()].filter(
        ([key, o]) => o.verdict === 'review' && !excludedKeys.has(key),
      ).length
    : 0;

  return (
    <div
      className="fixed inset-0 z-50"
      data-testid="new-node-popover"
      onClick={requestClose}
      role="dialog"
      aria-modal="true"
      aria-label="새 노드 생성"
    >
      <AnimatePresence mode="wait">
        <m.div
          key={phase === 'input' ? `input-${activeTab}` : phase}
          {...popoverAnimation}
          className={`absolute bg-white dark:bg-card border border-border rounded-xl shadow-lg p-4 ${
            isLargeResult
              ? 'w-[min(1040px,94vw)] max-w-[94vw]'
              : isPreview
                ? 'w-[720px] max-w-[92vw]'
                : 'w-[400px] max-w-[400px]'
          }`}
          data-surface={isLargeResult ? 'review' : 'popover'}
          style={{
            left: popoverPos.left + drag.offset.x,
            top: popoverPos.top + drag.offset.y,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* 드래그 핸들: 팝오버를 잡고 옮길 수 있는 상단 그립 (하단에서 가려질 때 위로 이동) */}
          <div
            {...drag.dragHandleProps}
            style={{ ...drag.dragHandleProps.style, cursor: drag.isDragging ? 'grabbing' : 'grab' }}
            className="group/drag absolute left-0 right-0 top-0 z-10 flex h-4 items-center justify-center rounded-t-xl pt-1"
            title="드래그해서 창 이동"
            aria-label="팝오버 이동 핸들"
          >
            <div className="h-1 w-10 rounded-full bg-border transition-colors group-hover/drag:bg-muted-foreground/50" />
          </div>

          {/* PRD-K M3 (A11): 현재 위치·다음 단계 상시 안내 */}
          <PhaseMiniStepper current={phase === 'input' ? 0 : phase === 'loading' ? 1 : 2} />

          {phase === 'input' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">새 노드</h3>
                <button onClick={requestClose} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'quick' | 'text' | 'csv')}>
                <TabsList className="w-full h-8 mb-3">
                  {/* PRD-K M2 (A1): 자연어 입력이 첫 탭 — Quick 은 두 번째로 이동(제거 아님) */}
                  <TabsTrigger value="text" className="flex-1 text-xs h-6 gap-1">
                    <ClipboardPaste className="w-3 h-3" />
                    텍스트 입력
                  </TabsTrigger>
                  <TabsTrigger value="quick" className="flex-1 text-xs h-6 gap-1">
                    <Plus className="w-3 h-3" />
                    빠른 입력
                  </TabsTrigger>
                  <TabsTrigger value="csv" className="flex-1 text-xs h-6 gap-1">
                    <Table className="w-3 h-3" />
                    CSV
                  </TabsTrigger>
                </TabsList>

                {/* PRD-I (M3, Task 3.3): 대용량 입력(또는 CSV)일 때만 가이드 여정 전환 제안.
                    빠른 입력·짧은 텍스트에서는 렌더되지 않아 Quick 경로가 그대로 유지된다. */}
                {(activeTab === 'csv' || inputText.length > GUIDED_SUGGEST_THRESHOLD) && (
                  <button
                    type="button"
                    onClick={handleSwitchToGuided}
                    data-testid="switch-to-guided"
                    className="mb-3 flex w-full items-center gap-2 rounded-lg border border-primary/30 bg-primary/5 px-2.5 py-2 text-left transition-colors hover:bg-primary/10"
                  >
                    <Wand2 className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="text-xs text-foreground">
                      이 분량은 가이드 여정이 편합니다
                    </span>
                    <span className="ml-auto flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary">
                      가이드로 전환
                      <ArrowRight className="h-3 w-3" />
                    </span>
                  </button>
                )}

                {/* Quick Input Tab */}
                <TabsContent value="quick" className="space-y-2.5 mt-0">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs text-muted-foreground block">{'\uC774\uB984'}</label>
                      {quickType === 'class' && (
                        <AutocompleteSuggestions
                          suggestions={classAC.suggestions}
                          isLoading={classAC.isLoading}
                          error={classAC.error}
                          visible={showClassAC}
                          label={`AI \uCD94\uCC9C`}
                          onTrigger={() => {
                            setShowClassAC(true);
                            const parentName = quickParentId
                              ? classes.find((c) => c.id === quickParentId)?.name
                              : undefined;
                            classAC.trigger(quickName, parentName);
                          }}
                          onSelect={(s) => {
                            setQuickName(s.name);
                            if (s.description) setQuickDesc(s.description);
                            setShowClassAC(false);
                            classAC.clear();
                          }}
                        />
                      )}
                    </div>
                    <Input
                      value={quickName}
                      onChange={(e) => setQuickName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.ctrlKey && e.key === ' ' && quickType === 'class') {
                          e.preventDefault();
                          setShowClassAC(true);
                          const parentName = quickParentId
                            ? classes.find((c) => c.id === quickParentId)?.name
                            : undefined;
                          classAC.trigger(quickName, parentName);
                        }
                      }}
                      placeholder={'\uB178\uB4DC \uC774\uB984'}
                      className="h-8 text-xs"
                      autoFocus
                    />
                    {/* Local fuzzy matches */}
                    {quickName.trim() && localClassMatches.length > 0 && quickType === 'class' && (
                      <div className="mt-1 text-xs text-muted-foreground">
                        {'\uC720\uC0AC: '}{localClassMatches.map((c) => c.name).join(', ')}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground mb-1 block">설명</label>
                    <Textarea
                      value={quickDesc}
                      onChange={(e) => setQuickDesc(e.target.value)}
                      placeholder="노드에 대한 간단한 설명 (선택)"
                      className="min-h-[60px] text-xs resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1 block">타입</label>
                      <Select value={quickType} onValueChange={(v) => setQuickType(v as 'class' | 'instance')}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="class">클래스</SelectItem>
                          <SelectItem value="instance">인스턴스</SelectItem>
                        </SelectContent>
                      </Select>
                      {/* PRD-L M4: 비전문가용 안내를 NodeKindToggle 공통 문구로 수렴 */}
                      <div className="mt-1 space-y-0.5">
                        <p className="text-xs leading-snug text-muted-foreground/70">
                          {NODE_KIND_QUESTION}
                        </p>
                        <p className="text-xs leading-snug text-muted-foreground/70">
                          {NODE_KIND_DESCRIPTIONS[quickType]}
                        </p>
                      </div>
                    </div>
                    <div className="flex-1">
                      <label className="text-xs text-muted-foreground mb-1 block">
                        부모 클래스 {quickType === 'instance' && <span className="text-destructive">*</span>}
                      </label>
                      <Select value={quickParentId} onValueChange={setQuickParentId}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="선택 (없음)" />
                        </SelectTrigger>
                        <SelectContent>
                          {classes.map((c) => (
                            <SelectItem key={c.id} value={c.id}>
                              {c.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetAndClose}>
                      취소
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={handleQuickAdd}
                      disabled={!quickName.trim() || (quickType === 'instance' && !quickParentId)}
                    >
                      <Plus className="w-3 h-3" />
                      추가
                    </Button>
                  </div>
                </TabsContent>

                {/* Text Input Tab (LLM) */}
                <TabsContent value="text" className="mt-0">
                  <Textarea
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    placeholder="자유 형식으로 입력하세요. 클래스명, 속성, 관계 등..."
                    className="min-h-[120px] text-xs resize-none mb-2"
                    autoFocus
                  />

                  <p className="text-xs text-muted-foreground mb-3">
                    형식 제한 없음 — LLM이 자동 구조화합니다
                  </p>

                  {/* PRD-K M2 (A1): 짧은 한 단어는 Quick 경로가 더 빠르다는 힌트(강제 없음) */}
                  {suggestQuick && (
                    <button
                      type="button"
                      onClick={handleSwitchToQuick}
                      data-testid="suggest-quick"
                      className="mb-3 flex w-full items-center gap-2 rounded-lg border border-border bg-muted/40 px-2.5 py-2 text-left transition-colors hover:bg-muted"
                    >
                      <Plus className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                      <span className="text-xs text-foreground">
                        이름 하나라면 빠른 추가로 충분해요
                      </span>
                      <span className="ml-auto flex shrink-0 items-center gap-0.5 text-xs font-medium text-primary">
                        빠른 입력으로
                        <ArrowRight className="h-3 w-3" />
                      </span>
                    </button>
                  )}

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".txt,.md,.csv,.tsv,.json,text/*"
                    className="hidden"
                    data-testid="text-file-input"
                    onChange={handleFileSelected}
                  />
                  <div className="flex items-center gap-2 mb-3">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1 text-muted-foreground"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="w-3 h-3" />
                      파일
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs gap-1 text-muted-foreground"
                      onClick={handlePasteFromClipboard}
                    >
                      <ClipboardPaste className="w-3 h-3" />
                      붙여넣기
                    </Button>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetAndClose}>
                      취소
                    </Button>
                    <Button size="sm" className="h-8 text-xs gap-1" onClick={() => handleGenerate()} disabled={!inputText.trim() || isLoading}>
                      {isLoading ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          분석 중...
                        </>
                      ) : (
                        <>
                          생성
                          <ArrowRight className="w-3 h-3" />
                        </>
                      )}
                    </Button>
                  </div>
                </TabsContent>

                {/* CSV Tab — M5: AI가 표를 분석해 데이터 설명 + 인사이트 온톨로지 생성 */}
                <TabsContent value="csv" className="mt-0">
                  <Textarea
                    value={csvText}
                    onChange={(e) => setCsvText(e.target.value)}
                    placeholder={"설비ID,설비명,공급사,상태,정격출력(kW)\nEQ-001,식각기 1호,삼성,가동,5.5\nEQ-002,증착기 2호,램리서치,정지,12.0"}
                    className="min-h-[140px] text-xs resize-none font-mono mb-2"
                    autoFocus
                  />
                  <p className="text-xs text-muted-foreground mb-1">
                    표를 붙여넣으면 AI가 컬럼·값·구조를 분석해 온톨로지로 만듭니다 — 첫 줄은 헤더(컬럼명).
                  </p>
                  <p
                    className={`text-[11px] mb-3 tabular-nums ${
                      csvText.length > CSV_CHAR_LIMIT ? 'text-destructive' : 'text-muted-foreground/70'
                    }`}
                  >
                    {csvText.length.toLocaleString()} / {CSV_CHAR_LIMIT.toLocaleString()}자
                    {csvText.length > CSV_CHAR_LIMIT && ' — 한도를 초과했습니다'}
                  </p>
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={resetAndClose}>
                      취소
                    </Button>
                    <Button
                      size="sm"
                      className="h-8 text-xs gap-1"
                      onClick={() => handleGenerate({ source: csvText, kind: 'csv' })}
                      disabled={!csvText.trim() || csvText.length > CSV_CHAR_LIMIT || isLoading}
                    >
                      {isLoading ? (
                        <>
                          <Loader2 className="w-3 h-3 animate-spin" />
                          분석 중...
                        </>
                      ) : (
                        <>
                          분석
                          <ArrowRight className="w-3 h-3" />
                        </>
                      )}
                    </Button>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}

          {phase === 'loading' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-primary" />
                  구조화 중...
                </h3>
              </div>

              <p className="text-xs text-muted-foreground mb-4">
                {activeTab === 'csv'
                  ? 'AI가 표의 컬럼·값·구조를 분석하고 있습니다'
                  : 'AI가 입력을 분석하고 있습니다'}
              </p>

              {/* 정직한 로딩(PRD-K M2): 실제 파이프라인 단계 안내 + 경과시간 — 인위적 %는 없다 */}
              <div className="mb-4">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full w-full rounded-full animate-pulse"
                    style={{ backgroundColor: 'hsl(var(--progress-fill))' }}
                  />
                </div>
                <span
                  className="text-[11px] font-mono text-muted-foreground mt-1 block text-right"
                  data-testid="loading-elapsed"
                >
                  경과 {elapsedSec}초
                </span>
              </div>

              <div className="space-y-1.5 mb-4">
                <div className="flex items-center gap-2 text-xs">
                  <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                  <span className="text-foreground">
                    {activeTab === 'csv' ? '컬럼·행 구조 분석 → 관계 추론' : '엔티티 추출 → 관계 추론'}
                  </span>
                </div>
                <p className="text-[11px] text-muted-foreground/70 pl-[22px]">
                  입력 분량에 따라 수십 초가 걸릴 수 있어요. 취소해도 입력은 그대로 남습니다.
                </p>
              </div>

              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">
                  입력: {inputText.length.toLocaleString()}자
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={handleCancelLoading}
                >
                  취소
                </Button>
              </div>
            </>
          )}

          {phase === 'preview' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-sm font-semibold">구조화 결과</h3>
                  {parsed && (
                    <p className="text-xs text-muted-foreground mt-0.5">
                      새로운 클래스 {newCount.classes}개
                      {newCount.instances > 0 && <>, 인스턴스 {newCount.instances}개</>}
                      {parsed.relations.length > 0 && <>, 관계 {parsed.relations.length}개</>}
                    </p>
                  )}
                </div>
                <button onClick={requestClose} className="flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* H1: 조용히 누락되던 항목(임시 노드/관계 추출 실패 등)을 검토 단계에서 노출. */}
              {parsed && parsed.warnings.length > 0 && (
                <div className="mb-3 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 dark:border-amber-700 dark:bg-amber-900/30">
                  <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                    확인 필요 {parsed.warnings.length}건
                  </p>
                  <ul className="mt-1 space-y-0.5">
                    {parsed.warnings.map((w, i) => (
                      <li
                        key={`${w.kind}-${i}`}
                        className="text-[11px] text-amber-700/90 dark:text-amber-300/90"
                      >
                        · {w.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* PRD-K M3: 요약 헤더 상시 고정 — 스크롤해도 전체 그림 유지 */}
              {selectionSummary && (
                <div
                  data-testid="selection-summary"
                  className="sticky top-0 z-10 mb-2 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md border border-border bg-card/95 px-2.5 py-1.5 backdrop-blur-sm"
                >
                  <span className="text-xs font-medium">
                    클래스 {selectionSummary.classes} · 속성 {selectionSummary.properties} · 인스턴스{' '}
                    {selectionSummary.instances} · 관계 {selectionSummary.relations} 선택됨
                  </span>
                  {selectionSummary.excluded > 0 && (
                    <span className="text-xs text-muted-foreground">
                      — {selectionSummary.excluded}건 제외
                    </span>
                  )}
                  {/* PRD-L M5: 트리아지 요약 밴드 — 고신뢰는 기본 수락, 저신뢰만 손보면 됨 */}
                  <span
                    data-testid="triage-summary"
                    className="w-full text-xs text-muted-foreground"
                  >
                    자동 반영 {autoCount}개
                    {reviewCount > 0 && (
                      <span className="ml-1 font-medium text-amber-600">
                        · 검토 필요 {reviewCount}개
                      </span>
                    )}
                  </span>
                </div>
              )}

              <div className="flex gap-3">
                {/* 구조 — extracted structure (left column) */}
                <div className={`flex-1 min-w-0 overflow-y-auto ${previewColumnMaxH} pr-1`}>
                {/* PRD-L M5: 저신뢰(review) 항목 — 항상 펼쳐 상단 노출 + 사유 배지.
                    체크박스·전환 토글·삭제는 PRD-K/M4 행 렌더러를 그대로 재사용한다. */}
                {parsed && reviewCount > 0 && (
                  <div data-testid="triage-review" className="mb-3">
                    <span className="mb-1.5 block text-xs font-semibold uppercase text-amber-600">
                      검토 필요 {reviewCount}개
                    </span>
                    <div className="space-y-1.5">
                      {reviewTreeItems.map(({ item, i }) => (
                        <div
                          key={`rv-${item.type}-${item.name}-${i}`}
                          className="rounded-md border border-amber-200 bg-amber-50/40 px-1 py-1 dark:border-amber-900/50 dark:bg-amber-900/10"
                        >
                          {renderReasonBadges(treeRowReasons(item))}
                          {renderTreeRow(item, i)}
                        </div>
                      ))}
                      {reviewRelations.map(({ rel, index }) => (
                        <div
                          key={`rvr-${index}`}
                          className="rounded-md border border-amber-200 bg-amber-50/40 px-1 py-1 dark:border-amber-900/50 dark:bg-amber-900/10"
                        >
                          {renderReasonBadges(triage?.byKey.get(relSelKey(rel))?.reasons ?? [])}
                          {renderRelationRow(rel, index)}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* PRD-L M5: 고신뢰(auto) 묶음 — 기본 접힘("펼쳐서 검토"). 저신뢰가 없으면
                    접을 게 없으므로 isAutoOpen 이 참이 되어 자동으로 펼쳐진다. */}
                {reviewCount > 0 && (
                  <button
                    type="button"
                    data-testid="triage-auto-toggle"
                    onClick={() => setAutoExpanded((v) => !v)}
                    className="mb-2 flex w-full items-center gap-1.5 rounded-md border border-border bg-muted/30 px-2 py-1.5 text-left transition-colors hover:bg-muted/50"
                  >
                    {isAutoOpen ? (
                      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    )}
                    <span className="text-xs font-medium">자동 반영 예정 {autoCount}개</span>
                    {!isAutoOpen && (
                      <span className="ml-auto text-xs text-primary">펼쳐서 검토</span>
                    )}
                  </button>
                )}

                {isAutoOpen && (
                  <div data-testid="triage-auto-body">
                {/* Hierarchical tree (고신뢰 + 기존 컨텍스트 노드) */}
                {autoTreeItems.length > 0 && (
                  <div className="space-y-0.5 mb-3">
                    <span className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">
                      계층 구조
                    </span>
                    {autoTreeItems.map(({ item, i }) => renderTreeRow(item, i))}
                  </div>
                )}

                {/* Properties */}
                {parsed && parsed.properties.length > 0 && (
                  <div className="mb-3">
                    <span className="text-xs font-semibold text-muted-foreground uppercase mb-1 block">
                      프로퍼티 {parsed.properties.length}개
                    </span>
                    {parsed.properties.map((prop, i) => (
                      <div
                        key={i}
                        className={`flex items-center gap-2 py-0.5 group pl-1 ${
                          excludedKeys.has(propSelKey(prop.className, prop.name)) ? 'opacity-50' : ''
                        }`}
                      >
                        <Checkbox
                          checked={!excludedKeys.has(propSelKey(prop.className, prop.name))}
                          onCheckedChange={() => toggleSelKey(propSelKey(prop.className, prop.name))}
                          className="h-4 w-4 shrink-0"
                          aria-label={`포함: ${prop.name}`}
                        />
                        <span className="text-xs font-mono">+ {prop.name}: {prop.dataType}</span>
                        {prop.className && (
                          <span className="text-[11px] text-muted-foreground">({prop.className})</span>
                        )}
                        <button
                          className="ml-auto -my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-60 transition-opacity text-muted-foreground hover:text-destructive group-hover:opacity-100"
                          onClick={() => removeItem('properties', i)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* PRD-L M2: 지식(semantic) 관계 — 고신뢰(auto)만. 저신뢰는 상단 검토 표면. */}
                {parsed && autoSemantic.length > 0 && (
                  <div>
                    <span
                      className="text-xs font-semibold text-muted-foreground uppercase mb-1 block"
                      title={LAYER_HINT.semantic}
                    >
                      지식 관계 {autoSemantic.length}개
                    </span>
                    {autoSemantic.map(({ rel, index }) => renderRelationRow(rel, index))}
                  </div>
                )}

                {/* PRD-L M2: 행동(kinetic) 관계 — 고신뢰(auto)만. */}
                {parsed && autoKinetic.length > 0 && (
                  <div className="mt-2">
                    <span
                      className="text-xs font-semibold text-muted-foreground uppercase mb-1 block"
                      title={LAYER_HINT.kinetic}
                    >
                      행동 관계 {autoKinetic.length}개
                    </span>
                    {autoKinetic.map(({ rel, index }) => renderRelationRow(rel, index))}
                  </div>
                )}
                  </div>
                )}
                </div>

                {/* PRD-K M3: 부가 검수 — 적층 대신 순차 스텝(구조 검수→보강→중복→규칙), 건너뛰기 상시 가능 */}
                <div
                  className={`${isLargeResult ? 'w-[320px]' : 'w-[260px]'} shrink-0 flex flex-col gap-3 overflow-y-auto ${previewColumnMaxH} border-l border-border pl-3`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-1" data-testid="aux-step-nav">
                      <button
                        type="button"
                        aria-label="이전 검수 단계"
                        disabled={auxStep === 0}
                        onClick={() => setAuxStep((s) => Math.max(0, s - 1))}
                        className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
                      >
                        <ChevronLeft className="w-3.5 h-3.5" />
                      </button>
                      <span className="text-xs font-semibold">
                        {AUX_STEPS[auxStep]}{' '}
                        <span className="font-normal text-muted-foreground">
                          ({auxStep + 1}/{AUX_STEPS.length})
                        </span>
                      </span>
                      <button
                        type="button"
                        aria-label="다음 검수 단계"
                        disabled={auxStep === AUX_STEPS.length - 1}
                        onClick={() => setAuxStep((s) => Math.min(AUX_STEPS.length - 1, s + 1))}
                        className="flex h-6 w-6 items-center justify-center rounded border border-border text-muted-foreground hover:text-foreground disabled:opacity-40"
                      >
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground/70">
                      검수는 선택 사항 — 언제든 아래 &quot;확정&quot;을 눌러도 됩니다.
                    </p>
                  </div>
                  {/* S4: Critic 검수 — 모델 수호자 자문(읽기전용, 확정 차단 안 함) */}
                  {auxStep === 0 && criticReport && (
                    <section>
                      <span className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1.5">
                        검수
                        {visibleCriticIssues.length > 0 && (
                          <Badge variant="outline" className="text-[11px] h-5 px-1.5 border-amber-400 text-amber-600">
                            {visibleCriticIssues.length}건
                          </Badge>
                        )}
                      </span>
                      {visibleCriticIssues.length === 0 ? (
                        <p className="text-[11px] text-muted-foreground/70 pl-1">검수 통과 — 문제 없음</p>
                      ) : (
                        <div className="space-y-1">
                          {visibleCriticIssues.map((issue) => {
                            const key = criticKey(issue);
                            return (
                              <div key={key} className="rounded-md border border-border px-1.5 py-1 group">
                                <div className="flex items-center gap-1.5">
                                  <Badge
                                    variant="outline"
                                    className={`text-[11px] h-5 px-1.5 shrink-0 ${CRITIC_SEVERITY_BADGE[issue.severity]}`}
                                  >
                                    {CRITIC_SEVERITY_LABEL[issue.severity]}
                                  </Badge>
                                  <span className="text-xs truncate" title={issue.targetName}>
                                    {issue.targetName}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => setIgnoredCritic((prev) => new Set(prev).add(key))}
                                    className="opacity-60 group-hover:opacity-100 transition-opacity text-[11px] text-muted-foreground hover:text-foreground ml-auto px-1.5 py-1 -my-1 border border-border rounded shrink-0"
                                  >
                                    무시
                                  </button>
                                </div>
                                <p className="text-[11px] text-muted-foreground/70 mt-0.5">{issue.reason}</p>
                                {issue.suggestion && (
                                  <p className="text-[11px] text-muted-foreground/50 mt-0.5 italic">{issue.suggestion}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </section>
                  )}

                  {auxStep === 0 && <IslandList islands={islands} onSuggest={handleIslandSuggest} />}

                  {auxStep === 1 && (
                  <section>
                    <span className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1.5">
                      보강 {enrichments.length > 0 && `${enrichments.length}개`}
                      {enrichLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                    </span>
                    <label className="flex items-center gap-1.5 mb-2 cursor-pointer select-none">
                      <Checkbox
                        checked={useWeb}
                        onCheckedChange={(v) => setUseWeb(v === true)}
                        className="h-4 w-4"
                      />
                      <span className="text-xs text-muted-foreground">
                        웹 검색 사용 (기본 꺼짐 · 검증 필요)
                      </span>
                    </label>
                    {enrichLoading && enrichments.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground/70 pl-1">
                        보강 대상 탐지 중...
                      </p>
                    ) : enrichments.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground/70 pl-1">
                        보강 제안 없음
                      </p>
                    ) : (
                      <div className="space-y-2">
                        {enrichments.map((item) => (
                          <EnrichmentCard
                            key={item.id}
                            item={item}
                            adopted={adoptedEnrichments.has(item.id)}
                            sourcing={sourcingIds.has(item.id)}
                            onAdopt={() => toggleAdoptEnrichment(item.id)}
                            onIgnore={() => ignoreEnrichment(item.id)}
                            onSource={() => handleSourceEnrichment(item)}
                          />
                        ))}
                      </div>
                    )}
                  </section>
                  )}

                  {/* PRD-E P2-5: 중복 검사 */}
                  {auxStep === 2 && (
                  <section>
                    <span className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1.5">
                      중복 검사 {dedup.size > 0 && `${dedup.size}건`}
                      {dedupLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs gap-1 w-full"
                      onClick={runDedup}
                      disabled={dedupLoading || !parsed}
                    >
                      {dedupLoading ? '검사 중...' : '의미·오타 중복 검사'}
                    </Button>
                    {dedup.size > 0 && (
                      <div className="space-y-1 mt-1.5">
                        {[...dedup.entries()].map(([name, d]) => (
                          <div key={name} className="rounded-md border border-border px-1.5 py-1">
                            <div className="flex items-center gap-1.5">
                              <Badge variant="outline" className={`text-[11px] h-5 px-1.5 ${DEDUP_BADGE[d.decision]}`}>
                                {DEDUP_LABEL[d.decision]}
                              </Badge>
                              <span className="text-xs truncate">{name}</span>
                            </div>
                            <p className="text-[11px] text-muted-foreground/70 mt-0.5">{d.reason}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </section>
                  )}

                  {/* PRD-E P2-7: 거버넌스 제안 (HITL) */}
                  {auxStep === 3 && (
                  <section>
                    <span className="text-xs font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1.5">
                      거버넌스 제안 {governance.length > 0 && `${governance.length}개`}
                      {governanceLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-2 text-xs gap-1 w-full mb-1.5"
                      onClick={runGovernance}
                      disabled={governanceLoading || !inputText.trim()}
                    >
                      {governanceLoading ? '분석 중...' : '제약·공리 제안 받기'}
                    </Button>
                    {governance.length > 0 && (
                      <div className="space-y-2">
                        {governance.map((p, i) =>
                          ignoredGov.has(i) ? null : (
                            <GovernanceProposalCard
                              key={i}
                              proposal={p}
                              applied={appliedGov.has(i)}
                              applying={applyingGov.has(i)}
                              onApprove={() => applyGovernance(p, i)}
                              onIgnore={() => setIgnoredGov((prev) => new Set(prev).add(i))}
                            />
                          ),
                        )}
                      </div>
                    )}
                  </section>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" size="sm" className="h-8 text-xs gap-1" onClick={() => setPhase('input')}>
                  <ArrowLeft className="w-3 h-3" />
                  수정
                </Button>
                {/* PRD-L M5: 확정 문구에 트리아지 반영 — 반영 총수 + 검토(review) 선택 수 */}
                <Button size="sm" className="h-8 text-xs gap-1" onClick={handleConfirm}>
                  <Check className="w-3 h-3" />
                  확정 · {appliedCount}개 반영
                  {reviewSelectedCount > 0 && ` (검토 ${reviewSelectedCount}개 포함)`}
                </Button>
              </div>
            </>
          )}
        </m.div>
      </AnimatePresence>

      {/* PRD-K M3: 이탈 가드 — 실수 1클릭으로 LLM 결과 전량 소실 방지 */}
      <AlertDialog open={exitGuardOpen} onOpenChange={setExitGuardOpen}>
        <AlertDialogContent onClick={(e) => e.stopPropagation()} data-testid="exit-guard">
          <AlertDialogHeader>
            <AlertDialogTitle>생성된 초안 {draftCount}건을 버릴까요?</AlertDialogTitle>
            <AlertDialogDescription>
              지금 닫으면 AI가 구조화한 결과가 모두 사라집니다. 확정 전에는 그래프에 아무것도
              반영되지 않습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setExitGuardOpen(false)}>계속 검토</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={resetAndClose}
            >
              버리기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
