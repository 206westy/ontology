import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  Badge,
} from "ontology";

export const NodeDetail = () => (
  <Sheet open>
    <SheetContent side="right">
      <SheetHeader>
        <SheetTitle>엔진 과열</SheetTitle>
        <SheetDescription>Symptom · 인스턴스 12건 · 신뢰도 0.92</SheetDescription>
      </SheetHeader>
      <div style={{ display: "grid", gap: 12, paddingTop: 16, fontSize: 14 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Badge variant="secondary">증상</Badge>
          <Badge variant="outline">확정됨</Badge>
        </div>
        <p style={{ color: "hsl(var(--muted-foreground))", lineHeight: 1.6 }}>
          냉각계통 이상으로 엔진 온도가 임계치를 초과한 상태. 정비 매뉴얼 §4.2 참조.
        </p>
      </div>
    </SheetContent>
  </Sheet>
);
