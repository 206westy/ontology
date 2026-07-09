import { Checkbox, Label } from "ontology";

export const ReviewItems = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 300 }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Checkbox id="c1" defaultChecked />
      <Label htmlFor="c1">엔진 과열 (증상)</Label>
    </div>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Checkbox id="c2" defaultChecked />
      <Label htmlFor="c2">냉각수 부족 (원인)</Label>
    </div>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Checkbox id="c3" />
      <Label htmlFor="c3">냉각계통 점검 (조치)</Label>
    </div>
  </div>
);

export const States = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 300 }}>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Checkbox id="s1" />
      <Label htmlFor="s1">미선택 관계</Label>
    </div>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Checkbox id="s2" defaultChecked />
      <Label htmlFor="s2">선택된 관계</Label>
    </div>
    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
      <Checkbox id="s3" disabled />
      <Label htmlFor="s3" style={{ color: "hsl(var(--muted-foreground))" }}>잠긴 관계 (커밋됨)</Label>
    </div>
  </div>
);
