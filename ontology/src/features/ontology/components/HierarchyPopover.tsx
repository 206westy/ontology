'use client';

import { useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { X, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { calcPopoverPosition } from '../lib/popover-position';
import { toast } from 'sonner';
import type { OntologyClass } from '../lib/types';

const popoverAnimation = {
  initial: { opacity: 0, scale: 0.95, y: -8 },
  animate: { opacity: 1, scale: 1, y: 0, transition: { type: 'spring', damping: 25, stiffness: 350 } },
  exit: { opacity: 0, scale: 0.95, y: -8, transition: { duration: 0.15 } },
};

const POPOVER_WIDTH = 340;
const POPOVER_EST_HEIGHT = 240;

function wouldCreateCycle(classes: OntologyClass[], childId: string, newParentId: string): boolean {
  let current: string | null = newParentId;
  while (current) {
    if (current === childId) return true;
    const parentClass = classes.find((c) => c.id === current);
    current = parentClass?.parentId ?? null;
  }
  return false;
}

export default function HierarchyPopover() {
  const popoverState = useOntologyStore((s) => s.popoverState);
  const closePopover = useOntologyStore((s) => s.closePopover);
  const classes = useOntologyStore((s) => s.classes);
  const updateClass = useOntologyStore((s) => s.updateClass);

  const isOpen = popoverState?.type === 'hierarchy';

  const handleClose = useCallback(() => {
    closePopover();
  }, [closePopover]);

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

  if (!isOpen) return null;

  const { sourceId, targetId } = popoverState;
  if (!sourceId || !targetId) return null;

  const sourceClass = classes.find((c) => c.id === sourceId);
  const targetClass = classes.find((c) => c.id === targetId);

  if (!sourceClass || !targetClass) return null;

  const parentClass = targetClass;
  const childClasses = classes.filter((c) => c.parentId === targetId);

  const handleConfirm = () => {
    if (wouldCreateCycle(classes, sourceId, targetId)) {
      toast.error('순환 참조 불가', {
        description: `${sourceClass.name}을(를) ${targetClass.name}의 하위로 이동하면 순환이 발생합니다.`,
      });
      return;
    }
    updateClass(sourceId, { parentId: targetId });
    closePopover();
  };

  const popoverPos = calcPopoverPosition(popoverState.position, { w: POPOVER_WIDTH, h: POPOVER_EST_HEIGHT });

  return (
    <div
      className="fixed inset-0 z-50"
      onClick={handleClose}
      role="dialog"
      aria-modal="true"
      aria-label="계층 이동"
    >
      <motion.div
        {...popoverAnimation}
        className="absolute w-[340px] max-w-[360px] bg-white dark:bg-card border border-border rounded-xl shadow-lg p-4"
        style={{
          left: popoverPos.left,
          top: popoverPos.top,
          boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">계층 이동</h3>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-xs text-foreground mb-3">
          <span className="font-semibold">{sourceClass.name}</span>을(를){' '}
          <span className="font-semibold">{targetClass.name}</span>의 하위로 이동할까요?
        </p>

        {/* Tree preview */}
        <div className="bg-muted/30 rounded-lg p-3 mb-4 text-xs font-mono">
          <div className="text-foreground">{parentClass.name}</div>
          {childClasses.map((c) => (
            <div key={c.id} className="ml-4 text-muted-foreground">
              ├── {c.name}
            </div>
          ))}
          <div className="ml-4 text-primary font-semibold">
            └── {sourceClass.name} <span className="text-[10px] text-muted-foreground">(new)</span>
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={handleClose}>
            취소
          </Button>
          <Button size="sm" className="h-7 text-xs gap-1" onClick={handleConfirm}>
            확정
            <Check className="w-3 h-3" />
          </Button>
        </div>
      </motion.div>
    </div>
  );
}
