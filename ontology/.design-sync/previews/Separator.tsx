import { Separator } from "ontology";

export const HorizontalSection = () => (
  <div style={{ width: 320 }}>
    <div style={{ fontWeight: 600, fontSize: 14 }}>엔진 과열</div>
    <div style={{ fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
      냉각계통 이상으로 온도가 임계치를 초과한 상태
    </div>
    <Separator style={{ margin: "12px 0" }} />
    <div style={{ display: "flex", gap: 16, fontSize: 13 }}>
      <span>인스턴스 12</span>
      <span>관계 5</span>
      <span>신뢰도 0.92</span>
    </div>
  </div>
);

export const VerticalMeta = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      height: 24,
      gap: 12,
      fontSize: 13,
      color: "hsl(var(--muted-foreground))",
    }}
  >
    <span>클래스 Symptom</span>
    <Separator orientation="vertical" />
    <span>브랜치 main</span>
    <Separator orientation="vertical" />
    <span>커밋 #a1f3</span>
  </div>
);
