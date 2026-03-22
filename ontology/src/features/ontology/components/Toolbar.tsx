'use client';

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
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useOntologyStore, useTemporalStore } from '../hooks/useOntologyStore';

export default function Toolbar() {
  const openPopover = useOntologyStore((s) => s.openPopover);
  const pastStates = useTemporalStore((s) => s.pastStates);
  const futureStates = useTemporalStore((s) => s.futureStates);
  const undo = useTemporalStore((s) => s.undo);
  const redo = useTemporalStore((s) => s.redo);
  const toolMode = useOntologyStore((s) => s.toolMode);
  const setToolMode = useOntologyStore((s) => s.setToolMode);
  const triggerZoom = useOntologyStore((s) => s.triggerZoom);

  const handleImport = () => {
    openPopover({
      type: 'newNode',
      position: { x: window.innerWidth / 2, y: 200 },
    });
  };

  return (
    <div className="h-[46px] min-h-[46px] flex items-center px-4 gap-2 border-b border-border bg-card/80 backdrop-blur-sm">
      <span className="text-sm font-semibold tracking-tight">PSK PEE Ontology</span>
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

      <div className="flex-1" />

      {/* Right side actions */}
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0"
        title="내보내기"
        disabled
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
        className="h-7 text-xs gap-1 text-primary"
        title="AI 어시스턴트"
        disabled
      >
        <Sparkles className="w-3.5 h-3.5" />
      </Button>
    </div>
  );
}
