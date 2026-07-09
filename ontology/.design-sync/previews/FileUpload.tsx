import { FileUpload, Button } from "ontology";
import { UploadCloud, FileText } from "lucide-react";

const noop = () => {};

export const KnowledgeDropzone = () => (
  <FileUpload
    onFileChange={noop}
    accept=".txt,.md,.pdf"
    style={{ width: 380 }}
  >
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 8,
        padding: "24px 16px",
        textAlign: "center",
      }}
    >
      <UploadCloud size={28} color="hsl(var(--muted-foreground))" />
      <div style={{ fontSize: 14, fontWeight: 500 }}>정비 매뉴얼을 끌어다 놓으세요</div>
      <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
        .txt · .md · .pdf — LLM이 클래스·속성·관계로 구조화합니다
      </div>
      <Button size="sm" variant="outline" style={{ marginTop: 4 }}>
        파일 선택
      </Button>
    </div>
  </FileUpload>
);

export const AttachedFile = () => (
  <FileUpload onFileChange={noop} style={{ width: 380 }}>
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        padding: "12px 8px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 40,
          height: 40,
          borderRadius: 8,
          background: "hsl(var(--muted))",
          flexShrink: 0,
        }}
      >
        <FileText size={20} color="hsl(var(--foreground))" />
      </div>
      <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 500 }}>냉각계통_정비지침.pdf</div>
        <div style={{ fontSize: 12, color: "hsl(var(--muted-foreground))" }}>
          2.4 MB · 노드 42건 추출 완료
        </div>
      </div>
    </div>
  </FileUpload>
);
