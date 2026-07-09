import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuLabel,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
} from "ontology";

export const CanvasMenu = () => (
  <div style={{ padding: 24 }}>
    <ContextMenu>
      <ContextMenuTrigger
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          height: 72,
          width: 240,
          border: "1px dashed hsl(var(--border))",
          borderRadius: 8,
          fontSize: 13,
          color: "hsl(var(--muted-foreground))",
        }}
      >
        캔버스 우클릭
      </ContextMenuTrigger>
      <ContextMenuContent forceMount style={{ width: 220 }}>
        <ContextMenuLabel>캔버스</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem>
          노드 추가 <ContextMenuShortcut>⌘N</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>관계 그리기</ContextMenuItem>
        <ContextMenuItem>포커스 모드</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem>전체 정렬</ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  </div>
);
