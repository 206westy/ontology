import { Input, Label } from "ontology";

export const Fields = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 320 }}>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label htmlFor="i-name">노드 이름</Label>
      <Input id="i-name" defaultValue="엔진 과열" />
    </div>
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <Label htmlFor="i-search">그래프 검색</Label>
      <Input id="i-search" placeholder="클래스·속성·인스턴스 검색" />
    </div>
  </div>
);

export const States = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 320 }}>
    <Input placeholder="신규 관계 이름 입력" />
    <Input defaultValue="냉각수 부족" />
    <Input defaultValue="커밋됨 (수정 불가)" disabled />
  </div>
);

export const Confidence = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 320 }}>
    <Label htmlFor="i-conf">신뢰도 임계치</Label>
    <Input id="i-conf" type="number" defaultValue={0.7} step={0.1} min={0} max={1} />
  </div>
);
