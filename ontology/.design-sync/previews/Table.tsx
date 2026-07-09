import {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableRow,
  TableHead,
  TableCell,
  TableCaption,
  Badge,
} from "ontology";

export const NodeTable = () => (
  <Table style={{ width: 520 }}>
    <TableCaption>정비 온톨로지 · 노드 목록 (커밋 #A1f3)</TableCaption>
    <TableHeader>
      <TableRow>
        <TableHead>이름</TableHead>
        <TableHead>클래스</TableHead>
        <TableHead>인스턴스</TableHead>
        <TableHead style={{ textAlign: "right" }}>신뢰도</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell style={{ fontWeight: 500 }}>엔진 과열</TableCell>
        <TableCell><Badge variant="secondary">증상</Badge></TableCell>
        <TableCell>12</TableCell>
        <TableCell style={{ textAlign: "right" }}>0.92</TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ fontWeight: 500 }}>냉각수 부족</TableCell>
        <TableCell><Badge variant="secondary">원인</Badge></TableCell>
        <TableCell>8</TableCell>
        <TableCell style={{ textAlign: "right" }}>0.88</TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ fontWeight: 500 }}>냉각계통 압력 측정</TableCell>
        <TableCell><Badge variant="secondary">점검</Badge></TableCell>
        <TableCell>5</TableCell>
        <TableCell style={{ textAlign: "right" }}>0.79</TableCell>
      </TableRow>
      <TableRow>
        <TableCell style={{ fontWeight: 500 }}>서모스탯 교체</TableCell>
        <TableCell><Badge variant="secondary">조치</Badge></TableCell>
        <TableCell>3</TableCell>
        <TableCell style={{ textAlign: "right" }}>0.71</TableCell>
      </TableRow>
    </TableBody>
    <TableFooter>
      <TableRow>
        <TableCell colSpan={2}>합계</TableCell>
        <TableCell>28</TableCell>
        <TableCell style={{ textAlign: "right" }}>평균 0.83</TableCell>
      </TableRow>
    </TableFooter>
  </Table>
);

export const RelationTable = () => (
  <Table style={{ width: 460 }}>
    <TableHeader>
      <TableRow>
        <TableHead>출발 노드</TableHead>
        <TableHead>관계</TableHead>
        <TableHead>도착 노드</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      <TableRow>
        <TableCell>엔진 과열</TableCell>
        <TableCell style={{ color: "hsl(var(--muted-foreground))" }}>원인이다</TableCell>
        <TableCell>냉각수 부족</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>냉각수 부족</TableCell>
        <TableCell style={{ color: "hsl(var(--muted-foreground))" }}>점검한다</TableCell>
        <TableCell>냉각계통 압력 측정</TableCell>
      </TableRow>
      <TableRow>
        <TableCell>냉각계통 압력 측정</TableCell>
        <TableCell style={{ color: "hsl(var(--muted-foreground))" }}>조치한다</TableCell>
        <TableCell>서모스탯 교체</TableCell>
      </TableRow>
    </TableBody>
  </Table>
);
