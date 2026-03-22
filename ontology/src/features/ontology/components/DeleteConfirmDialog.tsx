'use client';

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

interface DeleteConfirmDialogProps {
  open: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function DeleteConfirmDialog({ open, onConfirm, onCancel }: DeleteConfirmDialogProps) {
  const selectedNodeId = useOntologyStore((s) => s.selectedNodeId);
  const selectedNodeType = useOntologyStore((s) => s.selectedNodeType);
  const classes = useOntologyStore((s) => s.classes);
  const instances = useOntologyStore((s) => s.instances);

  if (!selectedNodeId) return null;

  const nodeName = selectedNodeType === 'class'
    ? classes.find((c) => c.id === selectedNodeId)?.name
    : instances.find((i) => i.id === selectedNodeId)?.name;

  const typeLabel = selectedNodeType === 'class' ? '클래스' : '인스턴스';

  const cascadeCount = selectedNodeType === 'class'
    ? instances.filter((i) => i.classId === selectedNodeId).length
    : 0;

  return (
    <AlertDialog open={open} onOpenChange={(o) => { if (!o) onCancel(); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{typeLabel} 삭제</AlertDialogTitle>
          <AlertDialogDescription>
            <strong>&quot;{nodeName}&quot;</strong> {typeLabel}를 삭제하시겠습니까?
            {cascadeCount > 0 && (
              <>
                <br />
                이 클래스에 속한 인스턴스 {cascadeCount}개와 관련 프로퍼티, 관계도 함께 삭제됩니다.
              </>
            )}
            <br />
            이 작업은 Ctrl+Z로 되돌릴 수 있습니다.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>취소</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            삭제
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
