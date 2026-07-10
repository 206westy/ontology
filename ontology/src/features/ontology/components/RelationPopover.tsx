'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { m } from 'motion/react';
import { X, ArrowRight, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { calcPopoverPosition } from '../lib/popover-position';
import { useDraggable } from '../hooks/useDraggable';
import { useRelationAutocomplete, fuzzyMatch } from '../hooks/useAutocomplete';
import AutocompleteSuggestions from './AutocompleteSuggestions';

const popoverAnimation = {
  initial: { opacity: 0, scale: 0.95, y: -8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring' as const, damping: 25, stiffness: 350 } },
  exit: { opacity: 0, scale: 0.95, y: -8, transition: { duration: 0.15 } },
};

const POPOVER_WIDTH = 360;
const POPOVER_EST_HEIGHT = 300;

export default function RelationPopover() {
  const popoverState = useOntologyStore((s) => s.popoverState);
  const closePopover = useOntologyStore((s) => s.closePopover);
  const classes = useOntologyStore((s) => s.classes);
  const instances = useOntologyStore((s) => s.instances);
  const relationTypes = useOntologyStore((s) => s.relationTypes);
  const addRelationType = useOntologyStore((s) => s.addRelationType);
  const addEdge = useOntologyStore((s) => s.addEdge);

  const [selectedRelId, setSelectedRelId] = useState<string | null>(null);
  const [newRelName, setNewRelName] = useState('');
  const [selectedTargetId, setSelectedTargetId] = useState<string | null>(null);
  const [targetSearch, setTargetSearch] = useState('');

  // Autocomplete
  const relationAC = useRelationAutocomplete();
  const [showRelationAC, setShowRelationAC] = useState(false);
  const localRelMatches = useMemo(
    () => fuzzyMatch(relationTypes, newRelName),
    [relationTypes, newRelName],
  );

  const isOpen = popoverState?.type === 'relation';

  const handleClose = useCallback(() => {
    setSelectedRelId(null);
    setNewRelName('');
    setSelectedTargetId(null);
    setTargetSearch('');
    relationAC.clear();
    setShowRelationAC(false);
    closePopover();
  }, [closePopover, relationAC]);

  // Esc key handler
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // 팝오버를 헤더로 드래그해 옮길 수 있게 한다(하단에서 가려질 때 위로 이동).
  const drag = useDraggable();
  const popoverOpenKey =
    isOpen && popoverState ? `${popoverState.position.x},${popoverState.position.y}` : null;
  useEffect(() => {
    drag.reset();
  }, [popoverOpenKey, drag.reset]);

  if (!isOpen) return null;

  const { sourceId } = popoverState;
  if (!sourceId) return null;

  const resolvedTargetId = popoverState.targetId ?? selectedTargetId;
  const needsTargetSelection = !popoverState.targetId;

  const sourceName = classes.find((c) => c.id === sourceId)?.name
    ?? instances.find((i) => i.id === sourceId)?.name
    ?? '?';
  const targetName = resolvedTargetId
    ? (classes.find((c) => c.id === resolvedTargetId)?.name
      ?? instances.find((i) => i.id === resolvedTargetId)?.name
      ?? '?')
    : null;

  // Build candidate list for target selection (exclude source)
  const targetCandidates = needsTargetSelection
    ? [
        ...classes.filter((c) => c.id !== sourceId).map((c) => ({ id: c.id, name: c.name, kind: 'class' as const })),
        ...instances.filter((i) => i.id !== sourceId).map((i) => ({ id: i.id, name: i.name, kind: 'instance' as const })),
      ].filter((c) => !targetSearch || c.name.toLowerCase().includes(targetSearch.toLowerCase()))
    : [];

  const handleConnect = () => {
    if (!resolvedTargetId) return;

    let relTypeId = selectedRelId;

    if (!relTypeId && newRelName.trim()) {
      relTypeId = addRelationType({ name: newRelName.trim() });
    }

    if (!relTypeId) return;

    const sourceIsClass = classes.some((c) => c.id === sourceId);
    const targetIsClass = classes.some((c) => c.id === resolvedTargetId);

    addEdge({
      sourceId,
      targetId: resolvedTargetId,
      relationTypeId: relTypeId,
      sourceKind: sourceIsClass ? 'class' : 'instance',
      targetKind: targetIsClass ? 'class' : 'instance',
    });

    handleClose();
  };

  const popoverPos = calcPopoverPosition(popoverState.position, { w: POPOVER_WIDTH, h: POPOVER_EST_HEIGHT });

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="관계 설정"
    >
      <m.div
        {...popoverAnimation}
        className="absolute w-[360px] max-w-[360px] bg-white dark:bg-card border border-border rounded-xl shadow-lg p-4"
        style={{
          left: popoverPos.left + drag.offset.x,
          top: popoverPos.top + drag.offset.y,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* 드래그 핸들: 팝오버를 잡고 옮길 수 있는 상단 그립 */}
        <div
          {...drag.dragHandleProps}
          style={{ ...drag.dragHandleProps.style, cursor: drag.isDragging ? 'grabbing' : 'grab' }}
          className="group/drag absolute left-0 right-0 top-0 z-10 flex h-4 items-center justify-center rounded-t-xl pt-1"
          title="드래그해서 창 이동"
          aria-label="팝오버 이동 핸들"
        >
          <div className="h-1 w-10 rounded-full bg-border transition-colors group-hover/drag:bg-muted-foreground/50" />
        </div>

        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">관계 설정</h3>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Source → Target display */}
        <div className="flex items-center justify-center gap-2 py-3 mb-3 bg-muted/30 rounded-lg">
          <span className="text-xs font-semibold">{sourceName}</span>
          <span className="text-muted-foreground">───?───</span>
          <ArrowRight className="w-3 h-3 text-muted-foreground" />
          {targetName ? (
            <span className="text-xs font-semibold">{targetName}</span>
          ) : (
            <span className="text-xs text-muted-foreground italic">대상 선택...</span>
          )}
        </div>

        {/* Target selection — only when targetId was not provided */}
        {needsTargetSelection && !resolvedTargetId && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">대상 노드 선택:</p>
            <div className="relative mb-2">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
              <Input
                value={targetSearch}
                onChange={(e) => setTargetSearch(e.target.value)}
                placeholder="노드 검색..."
                className="h-7 text-xs pl-7"
                autoFocus
              />
            </div>
            <ScrollArea className="max-h-[120px]">
              <div className="space-y-0.5">
                {targetCandidates.map((candidate) => (
                  <button
                    key={candidate.id}
                    className="flex items-center gap-2 w-full text-left px-2 py-1.5 rounded-md hover:bg-muted/50 transition-colors"
                    onClick={() => setSelectedTargetId(candidate.id)}
                  >
                    <span className="text-xs truncate flex-1">{candidate.name}</span>
                    <Badge variant="outline" className="text-xs px-1 py-0.5 shrink-0 uppercase">
                      {candidate.kind}
                    </Badge>
                  </button>
                ))}
                {targetCandidates.length === 0 && (
                  <p className="text-xs text-muted-foreground text-center py-2">대상 노드가 없습니다</p>
                )}
              </div>
            </ScrollArea>
          </div>
        )}

        {/* Show selected target with change option */}
        {needsTargetSelection && resolvedTargetId && (
          <div className="mb-3">
            <div className="flex items-center gap-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">대상:</p>
              <span className="text-xs font-semibold">{targetName}</span>
              <button
                className="text-xs text-primary hover:underline ml-auto"
                onClick={() => setSelectedTargetId(null)}
              >
                변경
              </button>
            </div>
          </div>
        )}

        {/* Existing relation types — only show after target is selected */}
        {resolvedTargetId && relationTypes.length > 0 && (
          <div className="mb-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase mb-2">기존 관계:</p>
            <div className="space-y-1">
              {relationTypes.map((rt) => (
                <label
                  key={rt.id}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${
                    selectedRelId === rt.id ? 'bg-primary/10' : 'hover:bg-muted/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="relationType"
                    checked={selectedRelId === rt.id}
                    onChange={() => {
                      setSelectedRelId(rt.id);
                      setNewRelName('');
                    }}
                    className="w-3 h-3 accent-primary"
                  />
                  <span className="text-xs">{rt.name}</span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* New relation input — only show after target is selected */}
        {resolvedTargetId && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-muted-foreground uppercase">
                {relationTypes.length > 0 ? '\uB610\uB294 \uC0C8\uB85C \uC785\uB825:' : '\uAD00\uACC4 \uC774\uB984:'}
              </p>
              <AutocompleteSuggestions
                suggestions={relationAC.suggestions}
                isLoading={relationAC.isLoading}
                error={relationAC.error}
                visible={showRelationAC}
                label={`AI \uCD94\uCC9C`}
                onTrigger={() => {
                  setShowRelationAC(true);
                  relationAC.trigger(newRelName, sourceName, targetName ?? '');
                }}
                onSelect={(s) => {
                  setNewRelName(s.name);
                  setSelectedRelId(null);
                  setShowRelationAC(false);
                  relationAC.clear();
                }}
              />
            </div>
            <Input
              value={newRelName}
              onChange={(e) => {
                setNewRelName(e.target.value);
                if (e.target.value) setSelectedRelId(null);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleConnect();
                if (e.ctrlKey && e.key === ' ') {
                  e.preventDefault();
                  setShowRelationAC(true);
                  relationAC.trigger(newRelName, sourceName, targetName ?? '');
                }
              }}
              placeholder={'\uAD00\uACC4 \uC774\uB984 \uC785\uB825...'}
              className="h-8 text-xs"
              autoFocus={!needsTargetSelection || !!resolvedTargetId}
            />
            {/* Local fuzzy matches */}
            {newRelName.trim() && localRelMatches.length > 0 && (
              <div className="mt-1 text-xs text-muted-foreground">
                {'\uC720\uC0AC: '}{localRelMatches.map((r) => r.name).join(', ')}
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClose}>
            취소
          </Button>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={handleConnect}
            disabled={!resolvedTargetId || (!selectedRelId && !newRelName.trim())}
          >
            연결
          </Button>
        </div>
      </m.div>
    </div>
  );
}
