import { Button } from "ontology";

export const Variants = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
    <Button>온톨로지 저장</Button>
    <Button variant="secondary">취소</Button>
    <Button variant="outline">미리보기</Button>
    <Button variant="ghost">더보기</Button>
    <Button variant="destructive">삭제</Button>
    <Button variant="link">문서 열기</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
    <Button size="sm">작게</Button>
    <Button size="default">기본</Button>
    <Button size="lg">크게</Button>
    <Button size="icon" aria-label="추가">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
    </Button>
  </div>
);

export const WithIcon = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
    <Button>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 5v14M5 12h14" strokeLinecap="round" />
      </svg>
      노드 추가
    </Button>
    <Button variant="outline">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M21 12a9 9 0 1 1-6.2-8.5" strokeLinecap="round" />
      </svg>
      다시 분석
    </Button>
  </div>
);

export const States = () => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center" }}>
    <Button>활성</Button>
    <Button disabled>비활성</Button>
    <Button variant="secondary" disabled>비활성 보조</Button>
  </div>
);
