import { Label, Input } from "ontology";

export const FieldLabels = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 300 }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label htmlFor="node-name">노드 이름</Label>
      <Input id="node-name" defaultValue="엔진 과열" />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label htmlFor="node-class">클래스</Label>
      <Input id="node-class" defaultValue="Symptom" />
    </div>
  </div>
);

export const RequiredAndHint = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 300 }}>
    <Label htmlFor="rel-name">
      관계 이름 <span style={{ color: "hsl(var(--destructive))" }}>*</span>
    </Label>
    <Input id="rel-name" placeholder="예: 냉각수 부족 →원인" />
    <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
      행동 지향형 동사로 작성하세요.
    </span>
  </div>
);
