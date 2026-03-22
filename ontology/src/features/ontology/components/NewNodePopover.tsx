'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Paperclip, ClipboardPaste, ArrowRight, ArrowLeft, Check, Trash2, Loader2, ChevronRight, Link2, Circle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { NODE_COLORS } from '../constants/colors';
import { llmApi } from '../api';
import { toast } from 'sonner';
import { calcPopoverPosition } from '../lib/popover-position';

interface ParsedResult {
  classes: { name: string; description: string; color: string | null; parentName: string | null }[];
  properties: { className: string; name: string; dataType: string; isRequired: boolean; enumValues: string[] | null }[];
  relations: { sourceName: string; targetName: string; relationName: string }[];
  instances: { className: string; name: string }[];
}

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
    } else if (line.includes('->') || line.includes('→')) {
      const parts = line.split(/->|→/).map((s) => s.trim());
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
    }
  });

  return items;
}

const popoverAnimation = {
  initial: { opacity: 0, scale: 0.95, y: -8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 350 } },
  exit: { opacity: 0, scale: 0.95, y: -8, transition: { duration: 0.15 } },
};

const POPOVER_WIDTH = 360;
const POPOVER_EST_HEIGHT = 320;

export default function NewNodePopover() {
  const popoverState = useOntologyStore((s) => s.popoverState);
  const closePopover = useOntologyStore((s) => s.closePopover);
  const addClass = useOntologyStore((s) => s.addClass);
  const addProperty = useOntologyStore((s) => s.addProperty);
  const addRelationType = useOntologyStore((s) => s.addRelationType);
  const addEdge = useOntologyStore((s) => s.addEdge);
  const addInstance = useOntologyStore((s) => s.addInstance);

  const classes = useOntologyStore((s) => s.classes);
  const relationTypes = useOntologyStore((s) => s.relationTypes);

  const [phase, setPhase] = useState<'input' | 'loading' | 'preview'>('input');
  const [inputText, setInputText] = useState('');
  const [parsed, setParsed] = useState<ParsedResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [loadingSteps, setLoadingSteps] = useState<{ label: string; status: 'pending' | 'running' | 'done' }[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const isOpen = popoverState?.type === 'newNode';

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

  const resetAndClose = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setPhase('input');
    setInputText('');
    setParsed(null);
    setIsLoading(false);
    setLoadingProgress(0);
    setLoadingSteps([]);
    closePopover();
  }, [closePopover]);

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

  const handleGenerate = async () => {
    if (!inputText.trim()) return;

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
      const result = await llmApi.parse({
        text: inputText,
        existingClasses: classes.map((c) => c.name),
        existingRelationTypes: relationTypes.map((r) => r.name),
      });

      if (controller.signal.aborted) return;

      if (stepInterval) clearInterval(stepInterval);
      setLoadingProgress(100);
      setLoadingSteps((prev) => prev.map((s) => ({ ...s, status: 'done' as const })));

      setParsed(result);
      setPhase('preview');
    } catch {
      if (controller.signal.aborted) return;

      if (stepInterval) clearInterval(stepInterval);
      toast.error('LLM 구조화 실패', { description: '로컬 파서로 대체합니다.' });
      const result = mockParse(inputText);
      setParsed(result);
      setPhase('preview');
    } finally {
      setIsLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleConfirm = () => {
    if (!parsed) return;

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
      const id = addClass({
        name: cls.name,
        description: cls.description,
        color: cls.color ?? NODE_COLORS.mid,
        parentId,
        positionX: popoverState!.position.x + Math.random() * 200 - 100,
        positionY: popoverState!.position.y + Math.random() * 200 - 100,
      });
      classIdMap.set(cls.name, id);
    });

    parsed.properties.forEach((prop) => {
      const classId = classIdMap.get(prop.className) ?? classIdMap.values().next().value;
      if (classId) {
        addProperty({
          name: prop.name,
          classId,
          dataType: prop.dataType as 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'enum',
          isRequired: prop.isRequired,
          enumValues: prop.enumValues,
        });
      }
    });

    parsed.relations.forEach((rel) => {
      const sourceId = classIdMap.get(rel.sourceName);
      const targetId = classIdMap.get(rel.targetName);
      if (sourceId && targetId) {
        const relTypeId = addRelationType({ name: rel.relationName });
        addEdge({ sourceId, targetId, relationTypeId: relTypeId });
      }
    });

    parsed.instances.forEach((inst) => {
      const classId = classIdMap.get(inst.className);
      if (classId) {
        addInstance({
          name: inst.name,
          classId,
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

  const popoverPos = popoverState
    ? calcPopoverPosition(popoverState.position, { w: POPOVER_WIDTH, h: POPOVER_EST_HEIGHT })
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
          key={phase}
          {...popoverAnimation}
          className="absolute w-[360px] max-w-[360px] bg-white dark:bg-card border border-border rounded-xl shadow-lg p-4"
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

              <div className="max-h-[300px] overflow-y-auto">
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
                            {!item.isExisting && item.originalIndex >= 0 && (
                              <button
                                className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive ml-auto"
                                onClick={() => removeItem('classes', item.originalIndex)}
                              >
                                <Trash2 className="w-3 h-3" />
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <span className="w-2 h-2 rounded-sm bg-emerald-400 shrink-0" />
                            <Badge variant="secondary" className="text-[10px] h-5">
                              + {item.name}
                            </Badge>
                            <span className="text-[9px] text-muted-foreground">({item.className})</span>
                            <button
                              className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive ml-auto"
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
