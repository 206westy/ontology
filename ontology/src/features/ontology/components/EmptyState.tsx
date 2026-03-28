'use client';

import { useState, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Sparkles,
  FileText,
  Upload,
  Link2,
  Type,
  Loader2,
  ArrowRight,
  Cpu,
  Server,
  Building2,
  HeartPulse,
  Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { importExportApi } from '../api';
import { TEMPLATES, buildImportPayload } from '../constants/templates';
import type { TemplateMetadata } from '../constants/templates';
import { safeTransition, nodeEnter } from '@/lib/motion-presets';

interface EmptyStateProps {
  onDoubleClick: (event: React.MouseEvent) => void;
}

function EmptyStateGuide() {
  return (
    <>
      <div className="relative w-16 h-16 mx-auto mb-4">
        <div
          className="absolute inset-0 rounded-2xl bg-ai-surface animate-ping"
          style={{ animationDuration: '3s' }}
        />
        <div className="relative w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="w-7 h-7 text-primary/60" />
        </div>
      </div>

      <h3 className="text-base font-semibold text-foreground mb-1.5">
        지식을 입력하면 AI가 구조화합니다
      </h3>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">
        자유 형식의 텍스트, 파일, URL 등 어떤 형태로든 지식을 입력하세요.
      </p>
    </>
  );
}

function InlineTextInput({ onSubmit }: { onSubmit: (text: string) => void }) {
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (text.trim()) {
          setIsSubmitting(true);
          onSubmit(text.trim());
        }
      }
    },
    [text, onSubmit],
  );

  return (
    <div className="w-full mb-4">
      <div className="relative">
        <Textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="지식을 자유롭게 입력하세요..."
          className="min-h-[100px] text-sm resize-none rounded-xl border-border/60 bg-surface-1 shadow-elevation-1 focus:shadow-elevation-2 transition-shadow placeholder:text-muted-foreground/60 pr-12"
          autoFocus
        />
        <div className="absolute right-2 bottom-2">
          <Button
            size="sm"
            className="h-8 w-8 p-0 rounded-lg"
            disabled={!text.trim() || isSubmitting}
            onClick={() => {
              if (text.trim()) {
                setIsSubmitting(true);
                onSubmit(text.trim());
              }
            }}
          >
            {isSubmitting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <ArrowRight className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>
      <p className="text-[11px] text-muted-foreground mt-1.5 text-left">
        <kbd className="font-mono bg-muted px-1 py-0.5 rounded border border-border text-[11px]">Enter</kbd>
        {' '}AI 구조화 시작
        <span className="text-border mx-1.5">|</span>
        <kbd className="font-mono bg-muted px-1 py-0.5 rounded border border-border text-[11px]">Shift+Enter</kbd>
        {' '}줄바꿈
      </p>
    </div>
  );
}

function ExampleCard() {
  return (
    <div className="bg-muted/50 border border-border rounded-lg p-3 mb-4 text-left">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2">입력 예시</p>
      <p className="text-xs text-muted-foreground leading-relaxed font-mono">
        <span className="text-foreground/70">&quot;반도체 FAB에는 DryAsher, WetStation 장비가 있고,</span>
        <br />
        <span className="text-foreground/70">엔지니어 김철수가 SUPRA 장비를 관리한다&quot;</span>
      </p>
    </div>
  );
}

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  Cpu,
  Server,
  Building2,
  HeartPulse,
  Truck,
};

function TemplateCard({
  template,
  onSelect,
  disabled,
}: {
  template: TemplateMetadata;
  onSelect: (t: TemplateMetadata) => void;
  disabled: boolean;
}) {
  const Icon = ICON_MAP[template.icon] ?? Cpu;

  return (
    <button
      className="group flex flex-col items-center gap-1.5 rounded-xl border border-border/60 bg-muted/30 p-2.5 transition-all hover:border-primary/40 hover:bg-muted/60 disabled:opacity-50 disabled:cursor-not-allowed"
      onClick={() => onSelect(template)}
      disabled={disabled}
    >
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary/70 transition-colors group-hover:bg-primary/15">
        <Icon className="w-4 h-4" />
      </div>
      <div className="text-center">
        <p className="text-[11px] font-semibold text-foreground leading-tight">
          {template.nameKo}
        </p>
        <p className="text-[10px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
          {template.descriptionKo}
        </p>
      </div>
      <p className="text-[9px] text-muted-foreground/70 font-mono">
        {template.classCount}C {template.relationCount}R {template.propertyCount}P
      </p>
    </button>
  );
}

function TemplateSection({
  onSelectTemplate,
  loadingId,
}: {
  onSelectTemplate: (t: TemplateMetadata) => void;
  loadingId: string | null;
}) {
  return (
    <div className="w-full mb-4">
      <p className="text-[11px] font-semibold text-muted-foreground uppercase mb-2 text-left">
        도메인 템플릿으로 시작하기
      </p>
      <div className="grid grid-cols-5 gap-2">
        {TEMPLATES.map((t) => (
          <TemplateCard
            key={t.id}
            template={t}
            onSelect={onSelectTemplate}
            disabled={loadingId !== null}
          />
        ))}
      </div>
      {loadingId && (
        <div className="flex items-center justify-center gap-2 mt-3 text-xs text-muted-foreground">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          템플릿 불러오는 중...
        </div>
      )}
    </div>
  );
}

function CTAButtons({ onStartManually }: { onStartManually: () => void }) {
  return (
    <div className="grid grid-cols-4 gap-2 mb-4 w-full">
      <Button
        variant="outline"
        size="sm"
        className="h-9 text-xs gap-1.5 flex-1"
        onClick={onStartManually}
      >
        <Type className="w-3.5 h-3.5" />
        직접 입력
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="h-9 text-xs gap-1.5 flex-1 border-dashed"
        onClick={() => {
          /* File upload - Phase 3 (F3-11) */
        }}
      >
        <Upload className="w-3.5 h-3.5" />
        파일
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="h-9 text-xs gap-1.5 flex-1 border-dashed"
        onClick={() => {
          /* URL import - Phase 3 */
        }}
      >
        <Link2 className="w-3.5 h-3.5" />
        URL
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
  const [confirmTemplate, setConfirmTemplate] = useState<TemplateMetadata | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);

  const transition = safeTransition(nodeEnter);

  const handleStartManually = useCallback(() => {
    openPopover({
      type: 'newNode',
      position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
    });
  }, [openPopover]);

  const handleInlineSubmit = useCallback(
    (text: string) => {
      openPopover({
        type: 'newNode',
        position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
      });
    },
    [openPopover],
  );

  const handleSelectTemplate = useCallback((template: TemplateMetadata) => {
    setConfirmTemplate(template);
  }, []);

  const handleConfirmLoad = useCallback(async () => {
    if (!confirmTemplate) return;
    const templateId = confirmTemplate.id;
    setConfirmTemplate(null);
    setLoadingId(templateId);

    try {
      const payload = buildImportPayload(templateId);
      await importExportApi.importOntology(payload);
      window.location.reload();
    } catch (err) {
      console.error('Template import failed:', err);
      setLoadingId(null);
    }
  }, [confirmTemplate]);

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
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={transition}
          className="text-center max-w-2xl px-8 pointer-events-auto"
        >
          <EmptyStateGuide />

          <InlineTextInput onSubmit={handleInlineSubmit} />

          <CTAButtons onStartManually={handleStartManually} />

          <TemplateSection
            onSelectTemplate={handleSelectTemplate}
            loadingId={loadingId}
          />

          <ExampleCard />

          <div className="flex items-center justify-center gap-5 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <kbd className="font-mono bg-muted px-1.5 py-0.5 rounded border border-border text-[11px]">더블클릭</kbd>
              새 노드 생성
            </span>
            <span className="text-border">|</span>
            <span className="flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" />
              AI 자동 구조화
            </span>
          </div>
        </motion.div>
      </div>

      {/* Template confirmation dialog */}
      <AlertDialog
        open={confirmTemplate !== null}
        onOpenChange={(open) => { if (!open) setConfirmTemplate(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmTemplate?.nameKo} 템플릿 불러오기
            </AlertDialogTitle>
            <AlertDialogDescription>
              기존 데이터를 모두 삭제하고 <strong>{confirmTemplate?.nameKo}</strong> 템플릿으로
              교체합니다. 클래스 {confirmTemplate?.classCount}개,
              관계 {confirmTemplate?.relationCount}개,
              프로퍼티 {confirmTemplate?.propertyCount}개가 생성됩니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmLoad}>
              불러오기
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
