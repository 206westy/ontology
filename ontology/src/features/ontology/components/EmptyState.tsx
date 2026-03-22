'use client';

import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MousePointerClick, Sparkles, FileText, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { SAMPLE_ONTOLOGY, SAMPLE_TEMPLATES } from '../constants/sample-ontology';

interface EmptyStateProps {
  onDoubleClick: (event: React.MouseEvent) => void;
}

function EmptyStateGuide() {
  return (
    <>
      <div className="relative w-20 h-20 mx-auto mb-6">
        <div
          className="absolute inset-0 rounded-2xl bg-primary/5 animate-ping"
          style={{ animationDuration: '3s' }}
        />
        <div className="relative w-20 h-20 rounded-2xl bg-primary/10 flex items-center justify-center">
          <MousePointerClick className="w-9 h-9 text-primary/60" />
        </div>
      </div>

      <h3 className="text-base font-semibold text-foreground mb-2">
        빈 공간을 더블클릭하여 지식을 입력하세요
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-5">
        자유 형식의 텍스트를 입력하면 AI가 클래스, 프로퍼티, 관계를 자동으로 구조화합니다.
      </p>
    </>
  );
}

function ExampleCard() {
  return (
    <div className="bg-muted/50 border border-border rounded-lg p-3 mb-5 text-left">
      <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-2">입력 예시</p>
      <p className="text-xs text-muted-foreground leading-relaxed font-mono">
        <span className="text-foreground/70">&quot;반도체 FAB에는 DryAsher, WetStation 장비가 있고,</span>
        <br />
        <span className="text-foreground/70">엔지니어 김철수가 SUPRA 장비를 관리한다&quot;</span>
      </p>
    </div>
  );
}

function TemplatePopover() {
  const loadOntology = useOntologyStore((s) => s.loadOntology);
  const [open, setOpen] = useState(false);

  const handleLoad = useCallback(
    (templateId: string) => {
      if (templateId === 'semiconductor') {
        loadOntology(SAMPLE_ONTOLOGY);
      }
      setOpen(false);
    },
    [loadOntology],
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs gap-1.5 border-dashed"
        >
          <FileText className="w-3.5 h-3.5" />
          예시 온톨로지 불러오기
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[280px] p-2" align="center">
        <p className="text-xs font-semibold text-muted-foreground px-2 pt-1 pb-2">
          예시 온톨로지 선택
        </p>
        {SAMPLE_TEMPLATES.map((t) => (
          <button
            key={t.id}
            className={`w-full text-left rounded-md px-2.5 py-2 transition-colors ${
              t.available
                ? 'hover:bg-muted/80 cursor-pointer'
                : 'opacity-50 cursor-not-allowed'
            }`}
            onClick={() => t.available && handleLoad(t.id)}
            disabled={!t.available}
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-foreground">{t.name}</span>
              {t.available ? (
                <ChevronRight className="w-3 h-3 text-muted-foreground" />
              ) : (
                <span className="text-[9px] text-muted-foreground">(추후)</span>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground mt-0.5">{t.description}</p>
            {t.stats && (
              <p className="text-[10px] text-muted-foreground/70 font-mono mt-0.5">{t.stats}</p>
            )}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

function EmptyStateActions({ onStartManually }: { onStartManually: () => void }) {
  return (
    <div className="flex items-center justify-center gap-3 mb-5">
      <TemplatePopover />
      <Button
        size="sm"
        className="h-8 text-xs gap-1.5"
        onClick={onStartManually}
      >
        직접 시작하기
      </Button>
    </div>
  );
}

function DropZoneOverlay({ active }: { active: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
          className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary rounded-lg"
        >
          <div className="text-center">
            <FileText className="w-10 h-10 text-primary/60 mx-auto mb-3" />
            <p className="text-sm font-semibold text-foreground">
              CSV/TXT 파일을 여기에 놓으세요
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              AI가 자동으로 구조화합니다
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

export default function EmptyState({ onDoubleClick }: EmptyStateProps) {
  const openPopover = useOntologyStore((s) => s.openPopover);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleStartManually = useCallback(() => {
    openPopover({
      type: 'newNode',
      position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    });
  }, [openPopover]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    // File handling will be implemented in Phase 3 (F3-11)
  }, []);

  return (
    <div
      className="flex-1 relative bg-background"
      data-testid="empty-state"
      onDoubleClick={onDoubleClick}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Subtle dot grid background */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />

      <DropZoneOverlay active={isDragOver} />

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="text-center max-w-md px-8 pointer-events-auto">
          <EmptyStateGuide />
          <ExampleCard />
          <EmptyStateActions onStartManually={handleStartManually} />

          <div className="flex items-center justify-center gap-5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded border border-border text-[10px]">더블클릭</kbd>
              새 노드 생성
            </span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              AI 자동 구조화
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
