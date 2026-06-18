'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Paperclip, ClipboardPaste, ArrowRight, ArrowLeft, Check, Trash2, Loader2, ChevronRight, Link2, Circle, Plus, Table, AlertTriangle } from 'lucide-react';
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
import { useOntologyStore } from '../hooks/useOntologyStore';
import { NODE_COLORS } from '../constants/colors';
import { llmApi, enrichApi, type LlmParseResult, type DetectSubgraphInput } from '../api';
import { mapParseResult, findPossibleDuplicates, computeIslands } from '../lib/parse-mapping';
import { buildParseSchemaContext } from '../lib/schema-context';
import type { EnrichmentItem, EnrichProposal } from '../lib/enrich-types';
import IslandList from './preview/IslandList';
import EnrichmentCard from './preview/EnrichmentCard';
import { toast } from 'sonner';
import { calcPopoverPosition } from '../lib/popover-position';
import { useClassAutocomplete, fuzzyMatch } from '../hooks/useAutocomplete';
import AutocompleteSuggestions from './AutocompleteSuggestions';

type ParsedResult = ReturnType<typeof mapParseResult>;

function mockParse(input: string): ParsedResult {
  const lines = input.split('\n').map((l) => l.trim()).filter(Boolean);
  const result: ParsedResult = { classes: [], properties: [], relations: [], instances: [] };

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

interface CsvRow {
  name: string;
  type: 'class' | 'instance';
  description: string;
  parentClass: string;
}

function parseCsv(input: string): CsvRow[] {
  const lines = input.split('\n').map((l) => l.trim()).filter(Boolean);
  if (lines.length === 0) return [];

  // Detect if first line is a header
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('name') || firstLine.includes('이름') || firstLine.includes('type') || firstLine.includes('타입');
  const dataLines = hasHeader ? lines.slice(1) : lines;

  return dataLines.map((line) => {
    const cols = line.split(',').map((c) => c.trim());
    return {
      name: cols[0] ?? '',
      type: (cols[1]?.toLowerCase() === 'instance' ? 'instance' : 'class') as 'class' | 'instance',
      description: cols[2] ?? '',
      parentClass: cols[3] ?? '',
    };
  }).filter((row) => row.name.length > 0);
}

const popoverAnimation = {
  initial: { opacity: 0, scale: 0.95, y: -8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, damping: 25, stiffness: 350 } },
  exit: { opacity: 0, scale: 0.95, y: -8, transition: { duration: 0.15 } },
};

const POPOVER_WIDTH = 400;
const POPOVER_EST_HEIGHT = 400;

export default function NewNodePopover() {
  const popoverState = useOntologyStore((s) => s.popoverState);
  const closePopover = useOntologyStore((s) => s.closePopover);
  const addClass = useOntologyStore((s) => s.addClass);
  const addProperty = useOntologyStore((s) => s.addProperty);
  const addRelationType = useOntologyStore((s) => s.addRelationType);
  const addEdge = useOntologyStore((s) => s.addEdge);
  const addInstance = useOntologyStore((s) => s.addInstance);
  const setInstanceValue = useOntologyStore((s) => s.setInstanceValue);

  const classes = useOntologyStore((s) => s.classes);
  const relationTypes = useOntologyStore((s) => s.relationTypes);
  const instances = useOntologyStore((s) => s.instances);
  const properties = useOntologyStore((s) => s.properties);
  const edges = useOntologyStore((s) => s.edges);

  const [activeTab, setActiveTab] = useState<'quick' | 'text' | 'csv'>('quick');
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
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingSteps, setLoadingSteps] = useState<{ label: string; status: 'pending' | 'running' | 'done' }[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Quick input state
  const [quickName, setQuickName] = useState('');
  const [quickDesc, setQuickDesc] = useState('');
  const [quickType, setQuickType] = useState<'class' | 'instance'>('class');
  const [quickParentId, setQuickParentId] = useState<string>('');

  // CSV state
  const [csvText, setCsvText] = useState('');
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [csvPreviewed, setCsvPreviewed] = useState(false);

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
    if (isOpen && popoverState?.initialText && popoverState.initialText !== initialTextRef.current) {
      initialTextRef.current = popoverState.initialText;
      setInputText(popoverState.initialText);
      setActiveTab('text');
      autoTriggerRef.current = true;
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
    setPhase('input');
    setActiveTab('quick');
    setInputText('');
    setParsed(null);
    setEnrichments([]);
    setAdoptedEnrichments(new Set());
    setEnrichLoading(false);
    setSourcingIds(new Set());
    setUseWeb(false);
    setIsLoading(false);
    setLoadingProgress(0);
    setLoadingSteps([]);
    setQuickName('');
    setQuickDesc('');
    setQuickType('class');
    setQuickParentId('');
    setCsvText('');
    setCsvRows([]);
    setCsvPreviewed(false);
    classAC.clear();
    setShowClassAC(false);
    closePopover();
  }, [closePopover, classAC]);

  // Esc key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        resetAndClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, resetAndClose]);

  const handleCancelLoading = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setPhase('input');
    setIsLoading(false);
    setLoadingProgress(0);
    setLoadingSteps([]);
  }, []);

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

  // --- CSV handlers ---
  const handleCsvPreview = () => {
    const rows = parseCsv(csvText);
    if (rows.length === 0) {
      toast.error('CSV 데이터를 파싱할 수 없습니다');
      return;
    }
    setCsvRows(rows);
    setCsvPreviewed(true);
  };

  const handleCsvConfirm = () => {
    if (csvRows.length === 0) return;

    const classIdMap = new Map<string, string>();
    classes.forEach((c) => classIdMap.set(c.name, c.id));

    // First pass: add classes
    csvRows
      .filter((r) => r.type === 'class')
      .forEach((row) => {
        if (existingClassNames.has(row.name)) return;
        const parentId = row.parentClass ? classIdMap.get(row.parentClass) : undefined;
        const id = addClass({
          name: row.name,
          description: row.description,
          color: NODE_COLORS.mid,
          parentId,
          positionX: popoverState!.position.x + Math.random() * 200 - 100,
          positionY: popoverState!.position.y + Math.random() * 200 - 100,
        });
        classIdMap.set(row.name, id);
      });

    // Second pass: add instances
    csvRows
      .filter((r) => r.type === 'instance')
      .forEach((row) => {
        const classId = classIdMap.get(row.parentClass);
        if (!classId) {
          toast.error(`인스턴스 "${row.name}"의 부모 클래스 "${row.parentClass}"를 찾을 수 없습니다`);
          return;
        }
        addInstance({ name: row.name, classId });
      });

    toast.success(`CSV에서 ${csvRows.length}개 항목 추가됨`);
    resetAndClose();
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
      const { gaps } = await enrichApi.detect(subgraph);
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

  // --- Text input (LLM) handler ---
  const handleGenerate = async () => {
    if (!inputText.trim()) return;

    // PATCH-4: single-call parse cap. Block giant docs before the round-trip so
    // we don't fall into the retry loop or silently mock-parse garbage.
    if (inputText.length > 8000) {
      toast.error('문서가 너무 깁니다', {
        description: `${inputText.length.toLocaleString()}자 — 8,000자 이하로 섹션을 나눠 입력해 주세요.`,
      });
      return;
    }

    const isLargeInput = inputText.length >= 100;
    const controller = new AbortController();
    abortControllerRef.current = controller;

    if (isLargeInput) {
      const steps = [
        { label: '텍스트 파싱', status: 'pending' as const },
        { label: '엔티티 추출', status: 'pending' as const },
        { label: '관계 추론', status: 'pending' as const },
        { label: '기존 온톨로지와 매칭', status: 'pending' as const },
        { label: '계층 구조 최적화', status: 'pending' as const },
      ];
      setLoadingSteps(steps);
      setLoadingProgress(0);
      setPhase('loading');
    }

    setIsLoading(true);

    // Simulate step progress for large inputs
    let stepInterval: ReturnType<typeof setInterval> | null = null;
    if (isLargeInput) {
      let stepIdx = 0;
      stepInterval = setInterval(() => {
        if (controller.signal.aborted) return;
        setLoadingSteps((prev) => {
          const next = [...prev];
          if (stepIdx > 0 && stepIdx <= next.length) {
            next[stepIdx - 1] = { ...next[stepIdx - 1], status: 'done' };
          }
          if (stepIdx < next.length) {
            next[stepIdx] = { ...next[stepIdx], status: 'running' };
          }
          return next;
        });
        setLoadingProgress(Math.min(90, Math.round(((stepIdx + 1) / 5) * 100)));
        stepIdx++;
        if (stepIdx > 5 && stepInterval) clearInterval(stepInterval);
      }, 600);
    }

    try {
      const result: LlmParseResult = await llmApi.parse({
        text: inputText,
        existingClasses: classes.map((c) => c.name),
        existingRelationTypes: relationTypes.map((r) => r.name),
        existingSchema: classes.length
          ? buildParseSchemaContext({ classes, instances, properties, relationTypes, edges })
          : undefined,
      });

      if (controller.signal.aborted) return;

      if (stepInterval) clearInterval(stepInterval);
      setLoadingProgress(100);
      setLoadingSteps((prev) => prev.map((s) => ({ ...s, status: 'done' as const })));

      const mapped = mapParseResult(
        result,
        existingClassNames,
        new Set(instances.map((i) => i.name)),
      );
      setParsed(mapped);
      setPhase('preview');
      void runGapDetection(mapped);
    } catch {
      if (controller.signal.aborted) return;

      if (stepInterval) clearInterval(stepInterval);
      toast.error('LLM 구조화 실패', { description: '로컬 파서로 대체합니다.' });
      const result = mockParse(inputText);
      setParsed(result);
      setPhase('preview');
      void runGapDetection(result);
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleConfirm = () => {
    if (!parsed) return;

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
    const sorted = [...parsed.classes];
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

      let parentId: string | undefined;
      if (cls.parentName) {
        parentId = classIdMap.get(cls.parentName);
      }
      const enrich = adoptedDefinition.get(cls.name);
      const id = addClass({
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
    });

    // Properties (class-level definitions). Reuse existing prop ids where present.
    const propIdMap = new Map<string, string>();
    parsed.properties.forEach((prop) => {
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
    parsed.instances.forEach((inst) => {
      const classId = classIdMap.get(inst.className);
      if (!classId) return;
      const instId = addInstance({ name: inst.name, classId });
      instanceIdMap.set(inst.name, instId);
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
    parsed.relations.forEach((rel) => {
      const src = resolveNode(rel.sourceName);
      const tgt = resolveNode(rel.targetName);
      if (src && tgt && src.id !== tgt.id) {
        let relTypeId = relTypeIdByName.get(rel.relationName);
        if (!relTypeId) {
          relTypeId = addRelationType({ name: rel.relationName });
          relTypeIdByName.set(rel.relationName, relTypeId);
        }
        addEdge({
          sourceId: src.id,
          targetId: tgt.id,
          sourceKind: src.kind,
          targetKind: tgt.kind,
          relationTypeId: relTypeId,
          sourceType: rel.evidence ? 'session_doc' : null,
          confidence: rel.confidence ?? null,
          evidence: rel.evidence ?? null,
        });
      }
    });

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

  // A-5: the preview needs room for the structure / island / enrichment columns.
  const isPreview = phase === 'preview';
  const popoverW = isPreview ? 720 : POPOVER_WIDTH;
  const popoverPos = popoverState
    ? calcPopoverPosition(popoverState.position, {
        w: popoverW,
        h: isPreview ? 540 : POPOVER_EST_HEIGHT,
      })
    : { left: 0, top: 0 };

  return (
    <div
      className="fixed inset-0 z-50"
      data-testid="new-node-popover"
      onClick={resetAndClose}
      role="dialog"
      aria-modal="true"
      aria-label="새 노드 생성"
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={phase === 'input' ? `input-${activeTab}` : phase}
          {...popoverAnimation}
          className={`absolute bg-white dark:bg-card border border-border rounded-xl shadow-lg p-4 ${
            isPreview ? 'w-[720px] max-w-[92vw]' : 'w-[400px] max-w-[400px]'
          }`}
          style={{
            left: popoverPos.left,
            top: popoverPos.top,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {phase === 'input' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">새 노드</h3>
                <button onClick={resetAndClose} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'quick' | 'text' | 'csv')}>
                <TabsList className="w-full h-8 mb-3">
                  <TabsTrigger value="quick" className="flex-1 text-xs h-6 gap-1">
                    <Plus className="w-3 h-3" />
                    빠른 입력
                  </TabsTrigger>
                  <TabsTrigger value="text" className="flex-1 text-xs h-6 gap-1">
                    <ClipboardPaste className="w-3 h-3" />
                    텍스트 입력
                  </TabsTrigger>
                  <TabsTrigger value="csv" className="flex-1 text-xs h-6 gap-1">
                    <Table className="w-3 h-3" />
                    CSV
                  </TabsTrigger>
                </TabsList>

                {/* Quick Input Tab */}
                <TabsContent value="quick" className="space-y-2.5 mt-0">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[10px] text-muted-foreground block">{'\uC774\uB984'}</label>
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
                      <div className="mt-1 text-[10px] text-muted-foreground">
                        {'\uC720\uC0AC: '}{localClassMatches.map((c) => c.name).join(', ')}
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="text-[10px] text-muted-foreground mb-1 block">설명</label>
                    <Textarea
                      value={quickDesc}
                      onChange={(e) => setQuickDesc(e.target.value)}
                      placeholder="노드에 대한 간단한 설명 (선택)"
                      className="min-h-[60px] text-xs resize-none"
                    />
                  </div>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground mb-1 block">타입</label>
                      <Select value={quickType} onValueChange={(v) => setQuickType(v as 'class' | 'instance')}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="class">클래스</SelectItem>
                          <SelectItem value="instance">인스턴스</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex-1">
                      <label className="text-[10px] text-muted-foreground mb-1 block">
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
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetAndClose}>
                      취소
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 text-xs gap-1"
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

                  <p className="text-[10px] text-muted-foreground mb-3">
                    형식 제한 없음 — LLM이 자동 구조화합니다
                  </p>

                  <div className="flex items-center gap-2 mb-3">
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
                      <Paperclip className="w-3 h-3" />
                      파일
                    </Button>
                    <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground">
                      <ClipboardPaste className="w-3 h-3" />
                      붙여넣기
                    </Button>
                  </div>

                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetAndClose}>
                      취소
                    </Button>
                    <Button size="sm" className="h-7 text-xs gap-1" onClick={handleGenerate} disabled={!inputText.trim() || isLoading}>
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

                {/* CSV Tab */}
                <TabsContent value="csv" className="mt-0">
                  {!csvPreviewed ? (
                    <>
                      <Textarea
                        value={csvText}
                        onChange={(e) => setCsvText(e.target.value)}
                        placeholder={"이름,타입,설명,부모클래스\n동물,class,동물 클래스,\n강아지,instance,,동물"}
                        className="min-h-[120px] text-xs resize-none font-mono mb-2"
                        autoFocus
                      />
                      <p className="text-[10px] text-muted-foreground mb-3">
                        CSV 형식: 이름, 타입(class/instance), 설명, 부모클래스
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={resetAndClose}>
                          취소
                        </Button>
                        <Button size="sm" className="h-7 text-xs gap-1" onClick={handleCsvPreview} disabled={!csvText.trim()}>
                          미리보기
                          <ArrowRight className="w-3 h-3" />
                        </Button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="max-h-[240px] overflow-y-auto mb-3">
                        <table className="w-full text-[11px]">
                          <thead>
                            <tr className="border-b border-border">
                              <th className="text-left py-1 px-1.5 text-muted-foreground font-medium">이름</th>
                              <th className="text-left py-1 px-1.5 text-muted-foreground font-medium">타입</th>
                              <th className="text-left py-1 px-1.5 text-muted-foreground font-medium">설명</th>
                              <th className="text-left py-1 px-1.5 text-muted-foreground font-medium">부모</th>
                              <th className="w-6" />
                            </tr>
                          </thead>
                          <tbody>
                            {csvRows.map((row, i) => (
                              <tr key={i} className="border-b border-border/50 group">
                                <td className="py-1 px-1.5 font-medium">{row.name}</td>
                                <td className="py-1 px-1.5">
                                  <Badge variant="secondary" className="text-[9px] h-4 px-1">
                                    {row.type === 'class' ? '클래스' : '인스턴스'}
                                  </Badge>
                                </td>
                                <td className="py-1 px-1.5 text-muted-foreground truncate max-w-[80px]">{row.description}</td>
                                <td className="py-1 px-1.5 text-muted-foreground">{row.parentClass}</td>
                                <td className="py-1">
                                  <button
                                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                                    onClick={() => setCsvRows((prev) => prev.filter((_, idx) => idx !== i))}
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-[10px] text-muted-foreground mb-3">
                        {csvRows.length}개 항목이 추가됩니다
                      </p>
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setCsvPreviewed(false)}>
                          <ArrowLeft className="w-3 h-3" />
                          수정
                        </Button>
                        <Button size="sm" className="h-7 text-xs gap-1" onClick={handleCsvConfirm} disabled={csvRows.length === 0}>
                          확정
                          <Check className="w-3 h-3" />
                        </Button>
                      </div>
                    </>
                  )}
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
                AI가 입력을 분석하고 있습니다
              </p>

              {/* Progress bar */}
              <div className="mb-4">
                <div className="h-2 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-300 ease-out"
                    style={{
                      width: `${loadingProgress}%`,
                      backgroundColor: 'hsl(var(--progress-fill))',
                    }}
                  />
                </div>
                <span className="text-[10px] font-mono text-muted-foreground mt-1 block text-right">
                  {loadingProgress}%
                </span>
              </div>

              {/* Step checklist */}
              <div className="space-y-1.5 mb-4">
                {loadingSteps.map((step, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs">
                    {step.status === 'done' && (
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}
                    {step.status === 'running' && (
                      <Loader2 className="w-3.5 h-3.5 text-primary animate-spin shrink-0" />
                    )}
                    {step.status === 'pending' && (
                      <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
                    )}
                    <span className={step.status === 'pending' ? 'text-muted-foreground' : 'text-foreground'}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-[10px] text-muted-foreground">
                  입력: {inputText.length.toLocaleString()}자
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
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
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      새로운 클래스 {newCount.classes}개
                      {newCount.instances > 0 && <>, 인스턴스 {newCount.instances}개</>}
                      {parsed.relations.length > 0 && <>, 관계 {parsed.relations.length}개</>}
                    </p>
                  )}
                </div>
                <button onClick={resetAndClose} className="text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex gap-3">
                {/* 구조 — extracted structure (left column) */}
                <div className="flex-1 min-w-0 overflow-y-auto max-h-[440px] pr-1">
                {/* Hierarchical tree */}
                {treeItems.length > 0 && (
                  <div className="space-y-0.5 mb-3">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 block">
                      계층 구조
                    </span>
                    {treeItems.map((item, i) => (
                      <div
                        key={`${item.type}-${item.name}-${i}`}
                        className={`flex items-center gap-1.5 py-0.5 group ${
                          item.isExisting ? 'opacity-50' : ''
                        }`}
                        style={{ paddingLeft: `${item.depth * 16 + 4}px` }}
                      >
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
                              className={`text-[10px] h-5 ${item.isExisting ? 'border-dashed text-muted-foreground' : ''}`}
                            >
                              {item.isExisting ? '기존' : '+'} {item.name}
                            </Badge>
                            {item.isExisting && (
                              <span className="text-[9px] text-muted-foreground italic">연결됨</span>
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
                                className="inline-flex"
                              >
                                <Badge
                                  variant="outline"
                                  className="text-[9px] h-4 px-1 border-dashed border-amber-400 text-amber-600 gap-0.5"
                                >
                                  <AlertTriangle className="w-2.5 h-2.5" />
                                  중복 가능
                                </Badge>
                              </button>
                            )}
                            {!item.isExisting && item.originalIndex >= 0 && (
                              <>
                                <button
                                  type="button"
                                  title="인스턴스(개체)로 전환"
                                  onClick={() => convertToInstance(item.originalIndex)}
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-muted-foreground hover:text-foreground ml-auto px-1 border border-border rounded"
                                >
                                  → 인스턴스
                                </button>
                                <button
                                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
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
                            <Badge variant="secondary" className="text-[10px] h-5">
                              + {item.name}
                            </Badge>
                            <Select
                              value={item.className || undefined}
                              onValueChange={(v) => setInstanceParent(item.originalIndex, v)}
                            >
                              <SelectTrigger
                                className={`h-5 text-[9px] px-1.5 w-auto gap-1 ${
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
                            <button
                              type="button"
                              title="클래스(범주)로 전환"
                              onClick={() => convertToClass(item.originalIndex)}
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-[9px] text-muted-foreground hover:text-foreground ml-auto px-1 border border-border rounded"
                            >
                              → 클래스
                            </button>
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
                              onClick={() => removeItem('instances', item.originalIndex)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Properties */}
                {parsed && parsed.properties.length > 0 && (
                  <div className="mb-3">
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 block">
                      프로퍼티 {parsed.properties.length}개
                    </span>
                    {parsed.properties.map((prop, i) => (
                      <div key={i} className="flex items-center gap-2 py-0.5 group pl-1">
                        <span className="text-[11px] font-mono">+ {prop.name}: {prop.dataType}</span>
                        {prop.className && (
                          <span className="text-[9px] text-muted-foreground">({prop.className})</span>
                        )}
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive ml-auto"
                          onClick={() => removeItem('properties', i)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Relations */}
                {parsed && parsed.relations.length > 0 && (
                  <div>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase mb-1 block">
                      관계 {parsed.relations.length}개
                    </span>
                    {parsed.relations.map((rel, i) => (
                      <div key={i} className="flex items-center gap-1.5 py-0.5 group pl-1">
                        <Link2 className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                        <span className="text-[11px]">
                          <span className={existingClassNames.has(rel.sourceName) ? 'text-muted-foreground' : ''}>{rel.sourceName}</span>
                          <span className="text-muted-foreground mx-1">&rarr;</span>
                          <span className="font-medium">{rel.relationName}</span>
                          <span className="text-muted-foreground mx-1">&rarr;</span>
                          <span className={existingClassNames.has(rel.targetName) ? 'text-muted-foreground' : ''}>{rel.targetName}</span>
                        </span>
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive ml-auto"
                          onClick={() => removeItem('relations', i)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                </div>

                {/* 섬 + 보강 (right column) */}
                <div className="w-[260px] shrink-0 flex flex-col gap-3 overflow-y-auto max-h-[440px] border-l border-border pl-3">
                  <IslandList islands={islands} onSuggest={handleIslandSuggest} />

                  <section>
                    <span className="text-[10px] font-semibold text-muted-foreground uppercase mb-1.5 flex items-center gap-1.5">
                      보강 {enrichments.length > 0 && `${enrichments.length}개`}
                      {enrichLoading && <Loader2 className="w-3 h-3 animate-spin" />}
                    </span>
                    <label className="flex items-center gap-1.5 mb-2 cursor-pointer select-none">
                      <Checkbox
                        checked={useWeb}
                        onCheckedChange={(v) => setUseWeb(v === true)}
                        className="h-3 w-3"
                      />
                      <span className="text-[10px] text-muted-foreground">
                        웹 검색 사용 (기본 꺼짐 · 검증 필요)
                      </span>
                    </label>
                    {enrichLoading && enrichments.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground/70 pl-1">
                        보강 대상 탐지 중...
                      </p>
                    ) : enrichments.length === 0 ? (
                      <p className="text-[10px] text-muted-foreground/70 pl-1">
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
                </div>
              </div>

              <div className="flex justify-end gap-2 mt-4">
                <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => setPhase('input')}>
                  <ArrowLeft className="w-3 h-3" />
                  수정
                </Button>
                <Button size="sm" className="h-7 text-xs gap-1" onClick={handleConfirm}>
                  확정
                  <Check className="w-3 h-3" />
                </Button>
              </div>
            </>
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
