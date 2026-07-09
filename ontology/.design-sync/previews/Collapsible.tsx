import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
  Button,
} from "ontology";
import { ChevronsUpDown } from "lucide-react";

export const RelationDetails = () => (
  <Collapsible defaultOpen style={{ width: 340 }}>
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
      <span style={{ fontWeight: 600, fontSize: 14 }}>엔진 과열 · 연결된 관계</span>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm">
          <ChevronsUpDown style={{ height: 16, width: 16 }} />
        </Button>
      </CollapsibleTrigger>
    </div>
    <CollapsibleContent>
      <div
        style={{
          marginTop: 8,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div style={{ border: "1px solid hsl(var(--border))", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
          →원인: 냉각수 부족
        </div>
        <div style={{ border: "1px solid hsl(var(--border))", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
          →조치: 냉각계통 점검
        </div>
        <div style={{ border: "1px solid hsl(var(--border))", borderRadius: 6, padding: "8px 12px", fontSize: 13 }}>
          →부품: 서모스탯
        </div>
      </div>
    </CollapsibleContent>
  </Collapsible>
);

export const AdvancedOptions = () => (
  <Collapsible style={{ width: 340 }}>
    <CollapsibleTrigger asChild>
      <Button variant="outline" size="sm" style={{ width: "100%", justifyContent: "space-between" }}>
        고급 병합 옵션
        <ChevronsUpDown style={{ height: 16, width: 16 }} />
      </Button>
    </CollapsibleTrigger>
    <CollapsibleContent>
      <div style={{ marginTop: 8, fontSize: 13, color: "hsl(var(--muted-foreground))" }}>
        3-way 병합 · 충돌 시 mine/theirs 수동 선택 · 신뢰도 임계치 0.7
      </div>
    </CollapsibleContent>
  </Collapsible>
);
