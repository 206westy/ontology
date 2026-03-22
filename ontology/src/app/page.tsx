'use client';

import { AnimatePresence } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import ExplorerPanel from '@/features/ontology/components/ExplorerPanel';
import GraphCanvas from '@/features/ontology/components/GraphCanvas';
import Toolbar from '@/features/ontology/components/Toolbar';
import RightPanel from '@/features/ontology/components/RightPanel';
import CommitBar from '@/features/ontology/components/CommitBar';
import NewNodePopover from '@/features/ontology/components/NewNodePopover';
import RelationPopover from '@/features/ontology/components/RelationPopover';
import HierarchyPopover from '@/features/ontology/components/HierarchyPopover';
import DeleteConfirmDialog from '@/features/ontology/components/DeleteConfirmDialog';
import { useLoadOntology } from '@/features/ontology/hooks/useLoadOntology';
import { useKeyboardShortcuts } from '@/features/ontology/hooks/useKeyboardShortcuts';
import { useApiSync } from '@/features/ontology/hooks/useApiSync';

export default function Home() {
  const { isLoading, isError } = useLoadOntology();
  const { showDeleteDialog, requestDelete, confirmDelete, cancelDelete } = useKeyboardShortcuts();
  useApiSync();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-6 h-6 animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">온톨로지 로딩 중...</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm text-destructive">데이터를 불러오는 중 오류가 발생했습니다</span>
          <span className="text-xs text-muted-foreground">네트워크 연결을 확인하세요</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden bg-background">
      {/* Left: Explorer Panel */}
      <AnimatePresence mode="wait">
        <ExplorerPanel />
      </AnimatePresence>

      {/* Center: Toolbar + Canvas + CommitBar */}
      <div className="flex-1 flex flex-col min-w-0">
        <Toolbar />
        <GraphCanvas />
        <CommitBar />
      </div>

      {/* Right: Property Panel */}
      <AnimatePresence mode="wait">
        <RightPanel onDeleteRequest={requestDelete} />
      </AnimatePresence>

      {/* Popovers (rendered as overlays) */}
      <NewNodePopover />
      <RelationPopover />
      <HierarchyPopover />
      <DeleteConfirmDialog
        open={showDeleteDialog}
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </div>
  );
}
