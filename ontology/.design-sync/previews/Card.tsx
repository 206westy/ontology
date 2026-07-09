import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Badge,
} from "ontology";

export const EntityCard = () => (
  <Card style={{ width: 340 }}>
    <CardHeader>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <CardTitle>엔진 과열</CardTitle>
        <Badge variant="secondary">증상</Badge>
      </div>
      <CardDescription>냉각계통 이상으로 엔진 온도가 임계치를 초과한 상태.</CardDescription>
    </CardHeader>
    <CardContent>
      <dl style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "8px 16px", fontSize: 14 }}>
        <dt style={{ color: "hsl(var(--muted-foreground))" }}>클래스</dt>
        <dd>Symptom</dd>
        <dt style={{ color: "hsl(var(--muted-foreground))" }}>인스턴스</dt>
        <dd>12건</dd>
        <dt style={{ color: "hsl(var(--muted-foreground))" }}>신뢰도</dt>
        <dd>0.92</dd>
      </dl>
    </CardContent>
    <CardFooter style={{ gap: 8 }}>
      <Button size="sm">확정</Button>
      <Button size="sm" variant="outline">수정</Button>
    </CardFooter>
  </Card>
);

export const StatCard = () => (
  <Card style={{ width: 240 }}>
    <CardHeader>
      <CardDescription>전체 노드</CardDescription>
      <CardTitle style={{ fontSize: 32 }}>1,284</CardTitle>
    </CardHeader>
    <CardContent>
      <span style={{ color: "hsl(var(--success))", fontSize: 13, fontWeight: 600 }}>▲ 8.2%</span>
      <span style={{ color: "hsl(var(--muted-foreground))", fontSize: 13, marginLeft: 8 }}>지난 커밋 대비</span>
    </CardContent>
  </Card>
);
