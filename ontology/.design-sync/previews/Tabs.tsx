import { Tabs, TabsList, TabsTrigger, TabsContent } from "ontology";

export const NodeInspector = () => (
  <Tabs defaultValue="properties" style={{ width: 380 }}>
    <TabsList>
      <TabsTrigger value="properties">속성</TabsTrigger>
      <TabsTrigger value="relations">관계</TabsTrigger>
      <TabsTrigger value="evidence">근거</TabsTrigger>
    </TabsList>
    <TabsContent value="properties">
      <div style={{ fontSize: 14, lineHeight: 1.7 }}>
        <div><strong>이름</strong> · 엔진 과열</div>
        <div><strong>클래스</strong> · Symptom</div>
        <div><strong>신뢰도</strong> · 0.92</div>
      </div>
    </TabsContent>
    <TabsContent value="relations">
      <div style={{ fontSize: 14, lineHeight: 1.7 }}>
        <div>→ <em>원인</em> · 냉각수 부족</div>
        <div>→ <em>점검</em> · 냉각계통 압력 측정</div>
      </div>
    </TabsContent>
    <TabsContent value="evidence">
      <div style={{ fontSize: 14, color: "hsl(var(--muted-foreground))" }}>
        정비 매뉴얼 §4.2 · 사용자 확정 2건
      </div>
    </TabsContent>
  </Tabs>
);

export const TwoTab = () => (
  <Tabs defaultValue="graph" style={{ width: 300 }}>
    <TabsList>
      <TabsTrigger value="graph">그래프</TabsTrigger>
      <TabsTrigger value="table">테이블</TabsTrigger>
    </TabsList>
    <TabsContent value="graph">
      <div style={{ fontSize: 14 }}>그래프 뷰 — 노드 42 · 엣지 68</div>
    </TabsContent>
    <TabsContent value="table">
      <div style={{ fontSize: 14 }}>테이블 뷰 — 행 42</div>
    </TabsContent>
  </Tabs>
);
