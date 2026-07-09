import { Skeleton } from "ontology";

export const NodeCardLoading = () => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 12,
      width: 320,
      border: "1px solid hsl(var(--border))",
      borderRadius: 8,
      padding: 16,
    }}
  >
    <Skeleton style={{ height: 48, width: 48, borderRadius: "9999px" }} />
    <div style={{ display: "flex", flexDirection: "column", gap: 8, flex: 1 }}>
      <Skeleton style={{ height: 14, width: "70%" }} />
      <Skeleton style={{ height: 12, width: "45%" }} />
    </div>
  </div>
);

export const ListLoading = () => (
  <div style={{ display: "flex", flexDirection: "column", gap: 10, width: 320 }}>
    <Skeleton style={{ height: 12, width: "90%" }} />
    <Skeleton style={{ height: 12, width: "80%" }} />
    <Skeleton style={{ height: 12, width: "60%" }} />
    <Skeleton style={{ height: 12, width: "72%" }} />
  </div>
);
