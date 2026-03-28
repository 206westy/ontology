'use client';

import { useState } from 'react';
import {
  MousePointer2,
  Hand,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  Download,
  Upload,
  Sparkles,
  ShieldCheck,
  Loader2,
} from 'lucide-react';
import FilterPanel from './FilterPanel';
import ValidationResultsPanel from './ValidationResultsPanel';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useOntologyStore, useTemporalStore } from '../hooks/useOntologyStore';
import { validateApi, importExportApi } from '../api';
import type { ValidationResult } from '../lib/types';
import { toast } from 'sonner';

export default function Toolbar() {
  const openPopover = useOntologyStore((s) => s.openPopover);
  const pastStates = useTemporalStore((s) => s.pastStates);
  const futureStates = useTemporalStore((s) => s.futureStates);
  const undo = useTemporalStore((s) => s.undo);
  const redo = useTemporalStore((s) => s.redo);
  const toolMode = useOntologyStore((s) => s.toolMode);
  const setToolMode = useOntologyStore((s) => s.setToolMode);
  const triggerZoom = useOntologyStore((s) => s.triggerZoom);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showValidation, setShowValidation] = useState(false);

  const handleImport = () => {
    openPopover({
      type: 'newNode',
      position: { x: window.innerWidth / 2, y: 200 },
    });
  };

  const handleValidate = async () => {
    setValidating(true);
    setShowValidation(true);
    setValidationResult(null);
    try {
      const result = await validateApi.run();
      setValidationResult(result);
      const { errors, warnings, infos } = result.summary;
      if (errors > 0) {
        toast.error(`검증 실패: 오류 ${errors}건, 경고 ${warnings}건`, {
          description: result.errors[0]?.message,
        });
      } else if (warnings > 0) {
        toast.warning(`검증 완료: 경고 ${warnings}건, 참고 ${infos}건`);
      } else {
        toast.success('검증 통과: 문제가 없습니다');
      }
    } catch {
      toast.error('검증 실행 중 오류가 발생했습니다');
      setShowValidation(false);
    } finally {
      setValidating(false);
    }
  };

  const handleExport = async () => {
    try {
      await importExportApi.exportAsFile();
      toast.success('온톨로지가 내보내기 되었습니다');
    } catch {
      toast.error('내보내기 중 오류가 발생했습니다');
    }
  };

  return (
    <div className="h-[46px] min-h-[46px] flex items-center px-4 gap-2 border-b border-border bg-card/80 backdrop-blur-sm">
      <span className="text-sm font-semibold tracking-tight gradient-brand-text">PSK PEE Ontology</span>
      <Badge variant="secondary" className="h-5 text-[10px] px-1.5 font-mono">
        v0.1 draft
      </Badge>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Selection / Pan tools */}
      <div className="flex items-center gap-0.5">
        <Button
          variant={toolMode === 'select' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setToolMode('select')}
          title="선택 도구 (V)"
        >
          <MousePointer2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant={toolMode === 'pan' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setToolMode('pan')}
          title="이동 도구 (H)"
        >
          <Hand className="w-3.5 h-3.5" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Zoom tools */}
      <div className="flex items-center gap-0.5">
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="확대" onClick={() => triggerZoom('in')}>
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="축소" onClick={() => triggerZoom('out')}>
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="전체 보기" onClick={() => triggerZoom('fit')}>
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Undo / Redo */}
      <div className="flex items-center gap-0.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={pastStates.length === 0}
          onClick={() => undo()}
          title="실행 취소 (Ctrl+Z)"
        >
          <Undo2 className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 w-7 p-0"
          disabled={futureStates.length === 0}
          onClick={() => redo()}
          title="다시 실행 (Ctrl+Shift+Z)"
        >
          <Redo2 className="w-3.5 h-3.5" />
        </Button>
      </div>

      <Separator orientation="vertical" className="h-5 mx-1" />

      {/* Filter (P1-4) */}
      <FilterPanel />

      <div className="flex-1" />

      {/* Right side actions */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1"
        onClick={handleValidate}
        disabled={validating}
        title="스키마 검증"
      >
        {validating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ShieldCheck className="w-3.5 h-3.5" />}
        검증
      </Button>

      <Separator orientation="vertical" className="h-5 mx-1" />

      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        title="내보내기"
        onClick={handleExport}
      >
        <Download className="w-3.5 h-3.5" />
      </Button>

      <Button
        variant="outline"
        size="sm"
        className="h-7 text-xs gap-1.5"
        onClick={handleImport}
      >
        <Upload className="w-3 h-3" />
        가져오기
      </Button>

      <Button
        variant="ghost"
        size="sm"
        className="h-7 text-xs gap-1 text-[hsl(var(--ai-primary))] hover:text-[hsl(var(--ai-primary))]"
        title="AI 어시스턴트"
        style={{ boxShadow: 'var(--elevation-ai)' }}
      >
        <Sparkles className="w-3.5 h-3.5" />
      </Button>

      {/* Validation Results Panel */}
      <ValidationResultsPanel
        open={showValidation}
        onOpenChange={setShowValidation}
        result={validationResult}
        isLoading={validating}
      />
    </div>
  );
}
