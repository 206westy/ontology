'use client';

import { useState, useMemo, useCallback, useRef, useEffect, memo } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { useDebounce } from 'react-use';
import { Search, ChevronRight, Plus, Circle } from 'lucide-react';
import Image from 'next/image';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { getNodeCssColors } from '../constants/colors';
import { getColorKey } from '../lib/to-cytoscape-elements';
import type { OntologyClass, OntologyInstance, NodeColorKey } from '../lib/types';
import ExplorerContextMenu, { type ExplorerContextTarget } from './ExplorerContextMenu';


interface TreeItemData {
  id: string;
  name: string;
  color: string;
  type: 'class' | 'instance';
  instanceCount: number;
  children: TreeItemData[];
  depth: number;
}

function buildTree(
  classes: OntologyClass[],
  instances: OntologyInstance[],
): TreeItemData[] {
  const instanceCountMap = new Map<string, number>();
  instances.forEach((inst) => {
    instanceCountMap.set(inst.classId, (instanceCountMap.get(inst.classId) ?? 0) + 1);
  });

  const childMap = new Map<string, OntologyClass[]>();
  const roots: OntologyClass[] = [];

  classes.forEach((cls) => {
    if (!cls.parentId) {
      roots.push(cls);
    } else {
      const siblings = childMap.get(cls.parentId) ?? [];
      siblings.push(cls);
      childMap.set(cls.parentId, siblings);
    }
  });

  function buildNode(cls: OntologyClass, depth: number): TreeItemData {
    const childClasses = childMap.get(cls.id) ?? [];
    const classInstances = instances.filter((i) => i.classId === cls.id);

    const children: TreeItemData[] = [
      ...childClasses.map((c) => buildNode(c, depth + 1)),
      ...classInstances.map((inst) => ({
        id: inst.id,
        name: inst.name,
        color: '#c4b5fd',
        type: 'instance' as const,
        instanceCount: 0,
        children: [],
        depth: depth + 1,
      })),
    ];

    return {
      id: cls.id,
      name: cls.name,
      color: cls.color,
      type: 'class',
      instanceCount: instanceCountMap.get(cls.id) ?? 0,
      children,
      depth,
    };
  }

  return roots.map((r) => buildNode(r, 0));
}

function filterTree(items: TreeItemData[], query: string): TreeItemData[] {
  if (!query) return items;
  const lower = query.toLowerCase();

  function matches(item: TreeItemData): boolean {
    if (item.name.toLowerCase().includes(lower)) return true;
    return item.children.some(matches);
  }

  function prune(item: TreeItemData): TreeItemData | null {
    if (item.name.toLowerCase().includes(lower)) return item;
    const filtered = item.children.map(prune).filter(Boolean) as TreeItemData[];
    if (filtered.length === 0) return null;
    return { ...item, children: filtered };
  }

  return items.map(prune).filter(Boolean) as TreeItemData[];
}

// PRD-Perf M1-1: 각 행이 selectedNodeId/expandedNodes 전체 대신 자신에 관한
// 불리언만 구독한다 — 선택/토글 한 번에 전 행이 리렌더되던 스톰을 국소화.
const TreeItem = memo(function TreeItem({ item, searchQuery, onContextMenu }: { item: TreeItemData; searchQuery: string; onContextMenu?: (e: React.MouseEvent, item: TreeItemData) => void }) {
  const isSelected = useOntologyStore((s) => s.selectedNodeId === item.id);
  const selectNode = useOntologyStore((s) => s.selectNode);
  const focusNode = useOntologyStore((s) => s.focusNode);
  const isNodeExpanded = useOntologyStore((s) => s.expandedNodes.has(item.id));
  const toggleExpanded = useOntologyStore((s) => s.toggleExpanded);

  const isExpanded = isNodeExpanded || !!searchQuery;
  const hasChildren = item.children.length > 0;
  const isClass = item.type === 'class';
  const isEmpty = isClass && item.instanceCount === 0 && item.children.filter((c) => c.type === 'class').length === 0;

  const handleCaretClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    toggleExpanded(item.id);
  }, [item.id, toggleExpanded]);

  const handleItemClick = useCallback(() => {
    selectNode(item.id, item.type);
    focusNode(item.id);
  }, [item.id, item.type, selectNode, focusNode]);

  return (
    <div>
      <div
        className={`flex items-center gap-1.5 py-1.5 rounded-md text-sm cursor-pointer transition-colors group ${
          isSelected
            ? 'bg-accent/10 text-foreground'
            : 'hover:bg-muted/60 text-foreground'
        }`}
        style={{ paddingLeft: `${item.depth * 18 + 8}px`, paddingRight: 8 }}
        onClick={handleItemClick}
        onContextMenu={(e) => onContextMenu?.(e, item)}
      >
        {/* Caret */}
        <button
          className={`shrink-0 transition-transform ${hasChildren ? 'visible' : 'invisible'}`}
          onClick={handleCaretClick}
        >
          <ChevronRight
            className={`w-3.5 h-3.5 text-muted-foreground transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
        </button>

        {/* Color dot */}
        {isClass ? (
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{
              backgroundColor: getNodeCssColors(getColorKey(item.color)).borderColor,
              opacity: isEmpty ? 0.5 : 1,
            }}
          />
        ) : (
          <Circle
            className="w-2 h-2 shrink-0"
            style={{ color: 'hsl(var(--node-instance))' }}
            strokeWidth={2}
          />
        )}

        {/* Name */}
        <span
          className={`text-xs truncate ${
            isClass ? 'font-semibold' : 'font-normal text-muted-foreground'
          } ${isEmpty ? 'text-muted-foreground' : ''}`}
        >
          {item.name}
        </span>

        {/* Instance count */}
        {isClass && item.instanceCount > 0 && (
          <span className="text-xs font-mono text-muted-foreground ml-auto shrink-0">
            ({item.instanceCount})
          </span>
        )}
        {/* PRD-N M3: 미접지(인스턴스 0개) 개념 — 저채도 배지 + 데이터 연결 진입점. */}
        {isClass && item.instanceCount === 0 && (
          <button
            type="button"
            className="ml-auto shrink-0 rounded border border-warning/30 px-1.5 py-0.5 text-xs text-warning/70 transition-colors hover:border-warning hover:text-warning"
            title="이 개념은 실데이터(인스턴스)가 없습니다. 클릭해 데이터를 연결하세요."
            onClick={(e) => {
              e.stopPropagation();
              selectNode(item.id, 'class');
              focusNode(item.id);
              toast.info(`"${item.name}"에 데이터가 없습니다`, {
                description: '오른쪽 패널에서 인스턴스를 추가하거나 CSV로 데이터를 연결하세요.',
              });
            }}
          >
            미접지
          </button>
        )}
      </div>

      {/* Children — PRD-Perf M1-6: height(reflow) 대신 컴포지터 친화 opacity/transform.
          접힘 시 자식 언마운트(대형 트리 렌더 비용 절감)는 그대로 유지. */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <m.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            {item.children.map((child) => (
              <TreeItem key={child.id} item={child} searchQuery={searchQuery} onContextMenu={onContextMenu} />
            ))}
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default function ExplorerPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  // PRD-Perf M1-4: 입력창은 즉시 반응하되, 트리 필터·리렌더는 디바운스된 값으로만.
  const [debouncedQuery, setDebouncedQuery] = useState('');
  useDebounce(() => setDebouncedQuery(searchQuery), 150, [searchQuery]);
  const [contextTarget, setContextTarget] = useState<ExplorerContextTarget | null>(null);
  const classes = useOntologyStore((s) => s.classes);
  const instances = useOntologyStore((s) => s.instances);
  const currentPartitionId = useOntologyStore((s) => s.currentPartitionId);
  const showAllPartitions = useOntologyStore((s) => s.showAllPartitions);
  const openPopover = useOntologyStore((s) => s.openPopover);
  const focusNode = useOntologyStore((s) => s.focusNode);
  const selectNode = useOntologyStore((s) => s.selectNode);
  const removeClass = useOntologyStore((s) => s.removeClass);
  const removeInstance = useOntologyStore((s) => s.removeInstance);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const handleTreeContextMenu = useCallback((e: React.MouseEvent, item: TreeItemData) => {
    e.preventDefault();
    e.stopPropagation();
    selectNode(item.id, item.type);
    setContextTarget({
      nodeId: item.id,
      nodeName: item.name,
      nodeType: item.type,
      position: { x: e.clientX, y: e.clientY },
    });
  }, [selectNode]);

  const handleContextDelete = useCallback((nodeId: string, nodeType: 'class' | 'instance') => {
    if (nodeType === 'class') removeClass(nodeId);
    else removeInstance(nodeId);
  }, [removeClass, removeInstance]);

  const handleFocusOnCanvas = useCallback((nodeId: string) => {
    focusNode(nodeId);
  }, [focusNode]);

  // PRD-B B-3: 구획 스코프 — 전체 보기가 아니면 현재 구획의 클래스/인스턴스만
  const scoped = useMemo(() => {
    if (showAllPartitions || !currentPartitionId) return { classes, instances };
    const scopedClasses = classes.filter((c) => c.partitionId === currentPartitionId);
    const classIds = new Set(scopedClasses.map((c) => c.id));
    return { classes: scopedClasses, instances: instances.filter((i) => classIds.has(i.classId)) };
  }, [classes, instances, currentPartitionId, showAllPartitions]);

  const tree = useMemo(() => buildTree(scoped.classes, scoped.instances), [scoped]);
  const filteredTree = useMemo(() => filterTree(tree, debouncedQuery), [tree, debouncedQuery]);

  // Ctrl+F → focus search input
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleAddClass = () => {
    openPopover({ type: 'newNode', position: { x: window.innerWidth / 2, y: window.innerHeight / 2 } });
  };

  return (
    <aside
      className="w-full h-full flex flex-col bg-card overflow-hidden"
      data-testid="explorer-panel"
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-[52px] shrink-0">
        <div className="w-7 h-7 rounded-lg gradient-brand flex items-center justify-center">
          <Image src="/logo.svg" alt="Ontology Studio" width={18} height={18} className="brightness-0 invert" />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-sm tracking-tight leading-tight gradient-brand-text">Ontology Studio</span>
          <span className="text-xs text-muted-foreground leading-tight">PSK PEE Domain</span>
        </div>
      </div>

      <Separator />

      {/* Search */}
      <div className="px-3 py-2.5 shrink-0">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            ref={searchInputRef}
            data-testid="explorer-search"
            placeholder="검색... (Ctrl+F)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-8 pl-8 text-xs bg-muted/50 border-none focus-visible:ring-1 focus-visible:ring-primary/30"
          />
        </div>
      </div>

      {/* Tree */}
      <ScrollArea className="flex-1 px-2">
        <div className="py-1">
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground px-2 py-2">
            클래스 트리
          </div>
          {filteredTree.length === 0 && (
            <div className="px-2 py-6 text-center">
              <span className="text-xs text-muted-foreground">
                {classes.length === 0
                  ? '캔버스를 더블클릭하여 시작하세요'
                  : '검색 결과가 없습니다'}
              </span>
            </div>
          )}
          {filteredTree.map((item) => (
            <TreeItem key={item.id} item={item} searchQuery={debouncedQuery} onContextMenu={handleTreeContextMenu} />
          ))}
        </div>
      </ScrollArea>

      <Separator />

      {/* Bottom actions */}
      <div className="p-3 shrink-0">
        <Button
          variant="outline"
          size="sm"
          className="w-full h-8 text-xs gap-1.5 border-dashed hover:border-primary hover:text-primary transition-colors"
          onClick={handleAddClass}
        >
          <Plus className="w-3.5 h-3.5" />
          새 클래스 추가
        </Button>
      </div>

      {/* Explorer context menu */}
      <ExplorerContextMenu
        target={contextTarget}
        onClose={() => setContextTarget(null)}
        onFocusOnCanvas={handleFocusOnCanvas}
        onDelete={handleContextDelete}
      />
    </aside>
  );
}
