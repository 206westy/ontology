'use client';

import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { NODE_COLORS, NODE_COLOR_LABELS } from '../constants/colors';
import type { NodeColorKey } from '../lib/types';

export default function FilterDropdown() {
  const [open, setOpen] = useState(false);

  const showClasses = useOntologyStore((s) => s.showClasses);
  const showInstances = useOntologyStore((s) => s.showInstances);
  const colorFilter = useOntologyStore((s) => s.colorFilter);
  const setShowClasses = useOntologyStore((s) => s.setShowClasses);
  const setShowInstances = useOntologyStore((s) => s.setShowInstances);
  const toggleColorFilter = useOntologyStore((s) => s.toggleColorFilter);
  const clearColorFilter = useOntologyStore((s) => s.clearColorFilter);

  const hasActiveFilter = !showClasses || !showInstances || colorFilter.length > 0;
  const colorEntries = Object.entries(NODE_COLORS) as [NodeColorKey, string][];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className={`h-7 w-7 p-0 relative ${hasActiveFilter ? 'text-primary' : ''}`}
          title="필터"
        >
          <Filter className="w-3.5 h-3.5" />
          {hasActiveFilter && (
            <div className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-primary" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3" align="end">
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              노드 필터
            </span>
            {hasActiveFilter && (
              <button
                className="text-[10px] text-primary hover:underline"
                onClick={() => {
                  setShowClasses(true);
                  setShowInstances(true);
                  clearColorFilter();
                }}
              >
                초기화
              </button>
            )}
          </div>

          {/* Type filter */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-muted-foreground">타입</span>
            <div className="flex gap-1.5">
              <button
                className={`
                  flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-colors
                  ${showClasses
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-muted/30 border-border text-muted-foreground'
                  }
                `}
                onClick={() => setShowClasses(!showClasses)}
              >
                클래스
              </button>
              <button
                className={`
                  flex items-center gap-1 px-2 py-1 rounded-md text-[11px] border transition-colors
                  ${showInstances
                    ? 'bg-primary/10 border-primary/30 text-primary'
                    : 'bg-muted/30 border-border text-muted-foreground'
                  }
                `}
                onClick={() => setShowInstances(!showInstances)}
              >
                인스턴스
              </button>
            </div>
          </div>

          <Separator />

          {/* Color filter */}
          <div className="space-y-1.5">
            <span className="text-[10px] text-muted-foreground">색상</span>
            <div className="grid grid-cols-5 gap-1.5">
              {colorEntries.map(([key, hex]) => {
                const isActive = colorFilter.length === 0 || colorFilter.includes(hex);
                return (
                  <button
                    key={key}
                    className={`
                      w-6 h-6 rounded-full border-2 transition-all
                      ${isActive
                        ? 'border-foreground/30 scale-100'
                        : 'border-transparent scale-75 opacity-30'
                      }
                    `}
                    style={{ backgroundColor: hex }}
                    title={NODE_COLOR_LABELS[key]}
                    onClick={() => toggleColorFilter(hex)}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
