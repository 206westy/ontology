'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  MousePointer2,
  Hand,
  Eye,
  Pencil,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Undo2,
  Redo2,
  Download,
  Upload,
  ShieldCheck,
  Loader2,
  GitMerge,
  GitPullRequest,
  Activity,
  Wand2,
  ChevronDown,
  Store,
} from 'lucide-react';
import FilterPanel from './FilterPanel';
import PartitionSwitcher from './PartitionSwitcher';
import BranchSwitcher from './BranchSwitcher';
import OntologySwitcher from '@/features/workspace/components/OntologySwitcher';
import FunctionsPanel from '@/features/functions/components/FunctionsPanel';
import MergeRequestSheet from './MergeRequestSheet';
import ValidationResultsPanel from './ValidationResultsPanel';
import EntityResolutionSheet from './EntityResolutionSheet';
import HealthDashboardSheet from './HealthDashboardSheet';
import HealthScoreBadge from './HealthScoreBadge';
import { UserMenu } from '@/features/auth/components/UserMenu';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useOntologyStore, useTemporalStore } from '../hooks/useOntologyStore';
import { validateApi, importExportApi } from '../api';
import type { ValidationResult } from '../lib/types';
import { toast } from 'sonner';

export default function Toolbar() {
  const openPopover = useOntologyStore((s) => s.openPopover);
  const openGuided = useOntologyStore((s) => s.openGuided);
  const pastStates = useTemporalStore((s) => s.pastStates);
  const futureStates = useTemporalStore((s) => s.futureStates);
  const undo = useTemporalStore((s) => s.undo);
  const redo = useTemporalStore((s) => s.redo);
  const toolMode = useOntologyStore((s) => s.toolMode);
  const setToolMode = useOntologyStore((s) => s.setToolMode);
  const editMode = useOntologyStore((s) => s.editMode);
  const setEditMode = useOntologyStore((s) => s.setEditMode);
  const triggerZoom = useOntologyStore((s) => s.triggerZoom);
  const [validating, setValidating] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [showValidation, setShowValidation] = useState(false);
  const [showEntityResolution, setShowEntityResolution] = useState(false);
  const [showHealth, setShowHealth] = useState(false);
  // PRD-J M3: 병합 요청 패널.
  const [showMergeRequests, setShowMergeRequests] = useState(false);

  // Allow CommandPalette (and other components) to open these sheets via events.
  useEffect(() => {
    const openER = () => setShowEntityResolution(true);
    const openHealth = () => setShowHealth(true);
    // PRD-PF-C 5.4: 문제(분기) 컨텍스트에서 병합 요청 화면으로 진입.
    const openMR = () => setShowMergeRequests(true);
    window.addEventListener('ontology:duplicate-check', openER);
    window.addEventListener('ontology:health', openHealth);
    window.addEventListener('ontology:merge-requests', openMR);
    return () => {
      window.removeEventListener('ontology:duplicate-check', openER);
      window.removeEventListener('ontology:health', openHealth);
      window.removeEventListener('ontology:merge-requests', openMR);
    };
  }, []);

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
    <div className="h-[46px] min-h-[46px] flex items-center px-4 gap-2 border-b border-border bg-card/80 backdrop-blur-sm" data-testid="toolbar">
      {/* PRD-K M5 (B9): 툴바 4그룹 — ① 보기(도구·줌·필터) */}
      <div className="flex items-center gap-0.5" data-testid="toolbar-group-view">
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
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="확대" onClick={() => triggerZoom('in')}>
          <ZoomIn className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="축소" onClick={() => triggerZoom('out')}>
          <ZoomOut className="w-3.5 h-3.5" />
        </Button>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" title="전체 보기" onClick={() => triggerZoom('fit')}>
          <Maximize2 className="w-3.5 h-3.5" />
        </Button>
        <FilterPanel />
      </div>

      <Separator orientation="vertical" className="h-5 mx-1.5" />

      {/* ② 편집(모드 전환·실행 취소/다시 실행) */}
      <div className="flex items-center gap-0.5" data-testid="toolbar-group-edit">
        <Button
          variant={editMode === 'read' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setEditMode('read')}
          title="읽기 모드 (탐색)"
        >
          <Eye className="w-3.5 h-3.5" />
        </Button>
        <Button
          variant={editMode === 'edit' ? 'secondary' : 'ghost'}
          size="sm"
          className="h-7 w-7 p-0"
          onClick={() => setEditMode('edit')}
          title="편집 모드 (드래그로 관계·계층 생성)"
        >
          <Pencil className="w-3.5 h-3.5" />
        </Button>
        {/* PRD-K M5: undo/redo 단일 진입점 — CommitBar 되돌리기는 '전체 취소'로 역할 분리 */}
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

      <Separator orientation="vertical" className="h-5 mx-1.5" />

      {/* Ontology switcher (PRD-PF-A M5) — 최상위 스코프: 어떤 온톨로지를 편집 중인가 */}
      <OntologySwitcher />

      {/* Partition switcher (PRD-B B-3) */}
      <PartitionSwitcher />

      {/* Branch switcher (PRD-J M2) — 구획=도메인 분리, 브랜치=작업 격리 */}
      <BranchSwitcher />

      {/* 결정함수(키네틱) — PRD-PF-B: 속성→판정 실행요소(자연어+HITL 컨펌) */}
      <FunctionsPanel />

      <div className="flex-1" />

      {/* ③ AI(가이드 여정·어시스턴트) */}
      <div className="flex items-center gap-0.5" data-testid="toolbar-group-ai">
        {/* PRD-I (M2): 어디서든 가이드 여정(패턴 발견→검수)을 여는 단일 진입점 */}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={() => openGuided()}
          title="가이드 여정 (패턴으로 시작)"
        >
          <Wand2 className="w-3.5 h-3.5" />
          가이드
        </Button>
        {/* PRD-BM-D01 (M1-6): 공유 패턴 카탈로그 진입점 */}
        <Button
          asChild
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1"
          title="패턴 마켓플레이스 (공유 패턴 카탈로그)"
        >
          <Link href="/marketplace">
            <Store className="w-3.5 h-3.5" />
            마켓플레이스
          </Link>
        </Button>
      </div>

      <Separator orientation="vertical" className="h-5 mx-1.5" />

      {/* ④ 품질(검증 + 저빈도 관리 액션은 드롭다운으로 접기 — PRD-K M5 B9) */}
      <div className="flex items-center gap-0.5" data-testid="toolbar-group-quality">
        {/* S5: 상시 구조 건강도 점수 (라이브) */}
        <HealthScoreBadge />
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
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1"
              title="품질 도구 — 건강도·중복 검사·병합 요청"
              data-testid="quality-menu-btn"
            >
              품질
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onSelect={() => setShowHealth(true)} className="text-xs gap-2">
              <Activity className="w-3.5 h-3.5" />
              건강도
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setShowEntityResolution(true)} className="text-xs gap-2">
              <GitMerge className="w-3.5 h-3.5" />
              중복 검사 / 병합
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() => setShowMergeRequests(true)}
              className="text-xs gap-2"
              data-testid="mr-open-btn"
            >
              <GitPullRequest className="w-3.5 h-3.5" />
              병합 요청 (브랜치)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <Separator orientation="vertical" className="h-5 mx-1.5" />

      {/* 파일 입출력 */}
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

      <Separator orientation="vertical" className="h-5 mx-1.5" />

      {/* 사용자 메뉴 (로그아웃) */}
      <UserMenu />

      {/* Validation Results Panel */}
      <ValidationResultsPanel
        open={showValidation}
        onOpenChange={setShowValidation}
        result={validationResult}
        isLoading={validating}
      />

      {/* Entity Resolution / Merge (P0-2) */}
      <EntityResolutionSheet
        open={showEntityResolution}
        onOpenChange={setShowEntityResolution}
      />

      {/* Health Dashboard (P0-3) */}
      <HealthDashboardSheet open={showHealth} onOpenChange={setShowHealth} />

      {/* PRD-J M3: 병합 요청 패널 */}
      <MergeRequestSheet open={showMergeRequests} onOpenChange={setShowMergeRequests} />
    </div>
  );
}
