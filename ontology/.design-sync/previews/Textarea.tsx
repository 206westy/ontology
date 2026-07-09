import { Textarea, Label } from "ontology";

export const KnowledgeDump = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 380 }}>
    <Label htmlFor="t-dump">지식 입력</Label>
    <Textarea
      id="t-dump"
      rows={5}
      defaultValue={
        "엔진 과열은 냉각수 부족이 원인이 될 수 있다. 냉각계통을 점검하고 서모스탯을 교체하면 조치가 된다."
      }
    />
    <span style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
      자유롭게 입력하면 LLM이 클래스·관계로 구조화합니다.
    </span>
  </div>
);

export const States = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 12, width: 380 }}>
    <Textarea placeholder="정비 매뉴얼 내용을 붙여넣으세요" rows={3} />
    <Textarea defaultValue="확정된 커밋 메시지 (수정 불가)" rows={2} disabled />
  </div>
);
