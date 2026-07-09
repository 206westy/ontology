import { ScrollArea, Badge } from "ontology";

const nodes = [
  { name: "엔진 과열", cls: "증상", conf: "0.92" },
  { name: "냉각수 부족", cls: "원인", conf: "0.88" },
  { name: "냉각계통 압력 측정", cls: "점검", conf: "0.79" },
  { name: "서모스탯 교체", cls: "조치", conf: "0.71" },
  { name: "라디에이터 팬 모터", cls: "부품", conf: "0.83" },
  { name: "시동 불량", cls: "증상", conf: "0.84" },
  { name: "배터리 방전", cls: "원인", conf: "0.90" },
  { name: "충전 전압 점검", cls: "점검", conf: "0.76" },
  { name: "얼터네이터 교체", cls: "조치", conf: "0.68" },
  { name: "정기 점검 이력", cls: "행정", conf: "0.95" },
];

export const NodeList = () => (
  <ScrollArea
    style={{
      height: 240,
      width: 300,
      border: "1px solid hsl(var(--border))",
      borderRadius: 8,
    }}
  >
    <div style={{ padding: 8 }}>
      <div
        style={{
          fontSize: 12,
          fontWeight: 600,
          color: "hsl(var(--muted-foreground))",
          padding: "4px 8px",
        }}
      >
        추출된 노드 · {nodes.length}건
      </div>
      {nodes.map((n) => (
        <div
          key={n.name}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 8,
            padding: "8px",
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <Badge variant="secondary" style={{ flexShrink: 0 }}>{n.cls}</Badge>
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {n.name}
            </span>
          </span>
          <span style={{ color: "hsl(var(--muted-foreground))", flexShrink: 0 }}>{n.conf}</span>
        </div>
      ))}
    </div>
  </ScrollArea>
);
