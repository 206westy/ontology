'use client';

import { useMemo } from 'react';
import { Filter, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { NODE_COLORS, NODE_COLOR_LABELS } from '../constants/colors';
import type { NodeColorKey } from '../lib/types';
import { hasActiveFilter } from '../lib/graph-filter';

const COLOR_ENTRIES = Object.entries(NODE_COLORS) as [NodeColorKey, string][];

export default function FilterPanel() {
  const classes = useOntologyStore((s) => s.classes);
  const instances = useOntologyStore((s) => s.instances);
  const edges = useOntologyStore((s) => s.edges);
  const showClasses = useOntologyStore((s) => s.showClasses);
  const showInstances = useOntologyStore((s) => s.showInstances);
  const colorFilter = useOntologyStore((s) => s.colorFilter);
  const minDegree = useOntologyStore((s) => s.minDegree);
  const setShowClasses = useOntologyStore((s) => s.setShowClasses);
  const setShowInstances = useOntologyStore((s) => s.setShowInstances);
  const toggleColorFilter = useOntologyStore((s) => s.toggleColorFilter);
  const clearColorFilter = useOntologyStore((s) => s.clearColorFilter);
  const setMinDegree = useOntologyStore((s) => s.setMinDegree);

  // 슬라이더 상한 = 실제 최대 차수(렌더 엣지 기준). god node가 있어도 직관적인 범위 제공.
  const maxDegree = useMemo(() => {
    const deg = new Map<string, number>();
    const bump = (id: string) => deg.set(id, (deg.get(id) ?? 0) + 1);
    const classIds = new Set(classes.map((c) => c.id));
    const nodeIds = new Set<string>([...classIds, ...instances.map((i) => i.id)]);
    classes.forEach((c) => {
      if (c.parentId && classIds.has(c.parentId)) {
        bump(c.id);
        bump(c.parentId);
      }
    });
    instances.forEach((i) => {
      if (classIds.has(i.classId)) {
        bump(i.id);
        bump(i.classId);
      }
    });
    edges.forEach((e) => {
      if (nodeIds.has(e.sourceId) && nodeIds.has(e.targetId)) {
        bump(e.sourceId);
        bump(e.targetId);
      }
    });
    return Math.max(1, ...deg.values());
  }, [classes, instances, edges]);

  const isActive = hasActiveFilter({
    showClasses,
    showInstances,
    colorFilter,
    minDegree,
  });

  const handleReset = () => {
    setShowClasses(true);
    setShowInstances(true);
    clearColorFilter();
    setMinDegree(0);
  };

  const colorSet = new Set(colorFilter);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0 relative"
          title="필터"
        >
          <Filter className="w-3.5 h-3.5" />
          {isActive && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[220px] p-3"
        sideOffset={8}
      >
        <div className="space-y-3">
          {/* Node type filters */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              노드 타입
            </p>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={showClasses}
                  onCheckedChange={(v) => setShowClasses(!!v)}
                />
                클래스
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <Checkbox
                  checked={showInstances}
                  onCheckedChange={(v) => setShowInstances(!!v)}
                />
                인스턴스
              </label>
            </div>
          </div>

          {/* Color filters */}
          <div>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
              색상
            </p>
            <div className="flex flex-wrap gap-1.5">
              {COLOR_ENTRIES.map(([key, hex]) => {
                const selected = colorSet.has(key);
                return (
                  <button
                    key={key}
                    aria-label={`${NODE_COLOR_LABELS[key]} 색상 필터`}
                    aria-pressed={selected}
                    className="w-6 h-6 rounded-full transition-[box-shadow,opacity] touch-manipulation"
                    style={{
                      backgroundColor: hex,
                      boxShadow: selected
                        ? `0 0 0 2px hsl(var(--background)), 0 0 0 4px ${hex}`
                        : 'none',
                      opacity: colorFilter.length > 0 && !selected ? 0.35 : 1,
                    }}
                    title={NODE_COLOR_LABELS[key]}
                    onClick={() => toggleColorFilter(key)}
                  />
                );
              })}
            </div>
            {colorFilter.length > 0 && (
              <p className="text-[10px] text-muted-foreground mt-1.5">
                {colorFilter.length}개 색상 선택됨
              </p>
            )}
          </div>

          {/* Degree filter — 잡음(저차수) 노드 숨기기 */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                최소 연결 차수
              </p>
              <span className="text-[10px] font-mono text-muted-foreground tabular-nums">
                {minDegree === 0 ? '전체' : `≥ ${minDegree}`}
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={maxDegree}
              step={1}
              value={Math.min(minDegree, maxDegree)}
              onChange={(e) => setMinDegree(Number(e.target.value))}
              aria-label="최소 연결 차수 필터"
              className="w-full h-1.5 cursor-pointer touch-manipulation appearance-none rounded-full bg-muted accent-primary"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              차수 낮은 잡음 노드를 숨겨 허브만 남깁니다.
            </p>
          </div>

          {/* Reset */}
          {isActive && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full h-7 text-xs gap-1.5 text-muted-foreground"
              onClick={handleReset}
            >
              <RotateCcw className="w-3 h-3" />
              필터 초기화
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
