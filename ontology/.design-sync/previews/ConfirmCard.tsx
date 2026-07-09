import { ConfirmCard, Button, Badge } from "ontology";

export const DedupVerdict = () => (
  <ConfirmCard
    style={{ width: 380 }}
    eyebrow="중복 검사"
    verdict="possible_duplicate"
    confidence={0.72}
    attention
    title={<>&ldquo;엔진 과열&rdquo; 노드가 기존 &ldquo;엔진 온도 상승&rdquo;과 중복일 수 있습니다.</>}
    evidence="근거 · 임베딩 유사도 0.89 · 정비 매뉴얼 §4.2 공통 출처"
    preview={
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12 }}>
        <Badge variant="secondary">엔진 과열</Badge>
        <span style={{ color: "hsl(var(--muted-foreground))" }}>→ 병합 →</span>
        <Badge variant="outline">엔진 온도 상승</Badge>
      </div>
    }
    actions={
      <>
        <Button size="sm" variant="ghost">건너뛰기</Button>
        <Button size="sm" variant="outline">새 노드로 유지</Button>
        <Button size="sm">병합</Button>
      </>
    }
  />
);

export const ReuseApplied = () => (
  <ConfirmCard
    style={{ width: 380 }}
    eyebrow="용어 해소"
    verdict="reuse"
    confidence={0.94}
    applied
    title={<>&ldquo;냉각수&rdquo;를 기존 클래스 <strong>Coolant</strong>에 연결했습니다.</>}
    evidence="근거 · 용어집 정확 일치 · 사용 3회"
    actions={
      <Button size="sm" variant="ghost" disabled>
        반영됨
      </Button>
    }
  />
);

export const BlockVerdict = () => (
  <ConfirmCard
    style={{ width: 380 }}
    eyebrow="계층 검증"
    verdict="block"
    confidence={0.81}
    attention
    title={<>순환 관계가 감지되어 커밋을 차단했습니다.</>}
    evidence="근거 · 엔진 과열 → 냉각수 부족 → 엔진 과열 (순환)"
    actions={
      <>
        <Button size="sm" variant="ghost">무시</Button>
        <Button size="sm" variant="destructive">관계 수정</Button>
      </>
    }
  />
);
