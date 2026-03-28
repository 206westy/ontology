'use client';

import { useEffect } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOntologyStore } from '../hooks/useOntologyStore';

export default function FocusModeBar() {
  const focusModeNodeId = useOntologyStore((s) => s.focusModeNodeId);
  const focusDepth = useOntologyStore((s) => s.focusDepth);
  const setFocusDepth = useOntologyStore((s) => s.setFocusDepth);
  const exitFocusMode = useOntologyStore((s) => s.exitFocusMode);
  const classes = useOntologyStore((s) => s.classes);
  const instances = useOntologyStore((s) => s.instances);

  useEffect(() => {
    if (!focusModeNodeId) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        exitFocusMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusModeNodeId, exitFocusMode]);

  if (!focusModeNodeId) return null;

  const cls = classes.find((c) => c.id === focusModeNodeId);
  const inst = instances.find((i) => i.id === focusModeNodeId);
  const nodeName = cls?.name ?? inst?.name ?? 'Unknown';

  return (
    <div className="absolute top-2 left-1/2 -translate-x-1/2 z-10 flex items-center gap-3 px-4 py-2 rounded-full bg-primary/10 border border-primary/30 backdrop-blur-sm shadow-elevation-1">
      <span className="text-xs text-primary font-medium">
        포커스: {nodeName}
      </span>

      <div className="flex items-center gap-1.5">
        {[1, 2, 3].map((d) => (
          <button
            key={d}
            className={`
              w-6 h-6 rounded-full text-[10px] font-mono border transition-colors
              ${focusDepth === d
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-transparent text-muted-foreground border-border hover:border-primary/40'
              }
            `}
            onClick={() => setFocusDepth(d)}
            title={`${d}-hop 이웃`}
          >
            {d}
          </button>
        ))}
        <span className="text-[10px] text-muted-foreground">hop</span>
      </div>

      <Button
        variant="ghost"
        size="sm"
        className="h-6 text-[11px] px-2 gap-1 text-primary hover:text-primary/80"
        onClick={exitFocusMode}
      >
        <X className="w-3 h-3" />
        해제
      </Button>
    </div>
  );
}
