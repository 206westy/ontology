import { Badge } from "ontology";

export const NodeKinds = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <Badge>증상</Badge>
    <Badge variant="secondary">원인</Badge>
    <Badge variant="outline">점검</Badge>
    <Badge variant="destructive">충돌</Badge>
  </div>
);

export const StatusLabels = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <Badge style={{ background: "hsl(var(--success))", color: "hsl(var(--primary-foreground))", border: "transparent" }}>
      확정됨
    </Badge>
    <Badge style={{ background: "hsl(var(--warning))", color: "hsl(var(--foreground))", border: "transparent" }}>
      검토 대기
    </Badge>
    <Badge variant="outline">초안</Badge>
  </div>
);

export const Counts = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
    <Badge variant="secondary">인스턴스 12</Badge>
    <Badge variant="secondary">관계 5</Badge>
    <Badge variant="outline">신뢰도 0.92</Badge>
  </div>
);
