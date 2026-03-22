'use client';

import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronRight, Box, Plus, Circle } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { NODE_COLORS } from '../constants/colors';
import type { OntologyClass, OntologyInstance, NodeColorKey } from '../lib/types';

const panelVariants = {
  hidden: { x: -260, opacity: 0 },
  visible: { x: 0, opacity: 1, transition: { type: 'spring', damping: 24, stiffness: 260 } },
  exit: { x: -260, opacity: 0, transition: { duration: 0.2 } },
};

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
        color: '#86efac',
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

function TreeItem({ item, searchQuery }: { item: TreeItemData; searchQuery: string }) {
  const selectedNodeId = useOntologyStore((s) => s.selectedNodeId);
  const selectNode = useOntologyStore((s) => s.selectNode);
  const focusNode = useOntologyStore((s) => s.focusNode);
  const expandedNodes = useOntologyStore((s) => s.expandedNodes);
  const toggleExpanded = useOntologyStore((s) => s.toggleExpanded);

  const isSelected = selectedNodeId === item.id;
  const isExpanded = expandedNodes.has(item.id) || !!searchQuery;
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
              backgroundColor: item.color,
              opacity: isEmpty ? 0.5 : 1,
            }}
          />
        ) : (
          <Circle
            className="w-2 h-2 shrink-0"
            style={{ color: '#86efac' }}
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
          <span className="text-[10px] font-mono text-muted-foreground ml-auto shrink-0">
            ({item.instanceCount})
          </span>
        )}
        {isClass && item.instanceCount === 0 && (
          <span className="text-[10px] font-mono text-muted-foreground/50 ml-auto shrink-0">
            (0)
          </span>
        )}
      </div>

      {/* Children */}
      <AnimatePresence>
        {isExpanded && hasChildren && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            {item.children.map((child) => (
              <TreeItem key={child.id} item={child} searchQuery={searchQuery} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function ExplorerPanel() {
  const [searchQuery, setSearchQuery] = useState('');
  const classes = useOntologyStore((s) => s.classes);
  const instances = useOntologyStore((s) => s.instances);
  const openPopover = useOntologyStore((s) => s.openPopover);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const tree = useMemo(() => buildTree(classes, instances), [classes, instances]);
  const filteredTree = useMemo(() => filterTree(tree, searchQuery), [tree, searchQuery]);

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
    <motion.aside
      variants={panelVariants}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="w-[260px] min-w-[260px] h-full flex flex-col border-r border-border bg-card"
    >
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-[52px] shrink-0">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <Box className="w-4 h-4 text-primary-foreground" />
        </div>
        <div className="flex flex-col">
          <span className="font-semibold text-sm tracking-tight leading-tight">Ontology Studio</span>
          <span className="text-[10px] text-muted-foreground leading-tight">PSK PEE Domain</span>
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
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-2">
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
            <TreeItem key={item.id} item={item} searchQuery={searchQuery} />
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
    </motion.aside>
  );
}
