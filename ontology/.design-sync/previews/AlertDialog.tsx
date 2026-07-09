import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
  AlertDialogCancel,
} from "ontology";

export const DeleteConfirm = () => (
  <AlertDialog open>
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>노드를 삭제할까요?</AlertDialogTitle>
        <AlertDialogDescription>
          연결된 관계 3개도 함께 제거됩니다. 이 작업은 커밋 전까지 되돌릴 수 있습니다.
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter style={{ gap: 8 }}>
        <AlertDialogCancel>취소</AlertDialogCancel>
        <AlertDialogAction>삭제</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);
