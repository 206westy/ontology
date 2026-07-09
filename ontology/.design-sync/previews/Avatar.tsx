import { Avatar, AvatarImage, AvatarFallback } from "ontology";

export const Editors = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Avatar>
      <AvatarImage src="https://picsum.photos/64" alt="편집자" />
      <AvatarFallback>온</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarImage src="https://picsum.photos/65" alt="편집자" />
      <AvatarFallback>정</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarFallback style={{ background: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>
        김
      </AvatarFallback>
    </Avatar>
  </div>
);

export const Sizes = () => (
  <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
    <Avatar style={{ height: 32, width: 32 }}>
      <AvatarImage src="https://picsum.photos/66" alt="작성자" />
      <AvatarFallback>온</AvatarFallback>
    </Avatar>
    <Avatar>
      <AvatarImage src="https://picsum.photos/67" alt="작성자" />
      <AvatarFallback>온</AvatarFallback>
    </Avatar>
    <Avatar style={{ height: 56, width: 56 }}>
      <AvatarImage src="https://picsum.photos/68" alt="작성자" />
      <AvatarFallback>온</AvatarFallback>
    </Avatar>
  </div>
);

export const CommitAuthor = () => (
  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
    <Avatar>
      <AvatarImage src="https://picsum.photos/69" alt="커밋 작성자" />
      <AvatarFallback>정</AvatarFallback>
    </Avatar>
    <div style={{ lineHeight: 1.3 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>정비관리자</div>
      <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
        커밋 #b7e0 · 관계 추가
      </div>
    </div>
  </div>
);
