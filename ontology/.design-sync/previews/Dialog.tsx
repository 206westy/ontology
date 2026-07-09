import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  Button,
  Input,
  Label,
} from "ontology";

export const EditNode = () => (
  <Dialog open>
    <DialogContent>
      <DialogHeader>
        <DialogTitle>노드 편집</DialogTitle>
        <DialogDescription>이 노드의 이름과 클래스를 수정합니다. 변경은 커밋 후 반영됩니다.</DialogDescription>
      </DialogHeader>
      <div style={{ display: "grid", gap: 12, padding: "8px 0" }}>
        <div style={{ display: "grid", gap: 6 }}>
          <Label htmlFor="name">이름</Label>
          <Input id="name" defaultValue="엔진 과열" />
        </div>
        <div style={{ display: "grid", gap: 6 }}>
          <Label htmlFor="cls">클래스</Label>
          <Input id="cls" defaultValue="Symptom" />
        </div>
      </div>
      <DialogFooter style={{ gap: 8 }}>
        <Button variant="outline">취소</Button>
        <Button>저장</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
);
