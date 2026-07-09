import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
  Button,
} from "ontology";

export const NodeActions = () => (
  <div style={{ padding: 24 }}>
    <DropdownMenu open>
      <DropdownMenuTrigger asChild>
        <Button variant="outline">작업</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent style={{ width: 200 }}>
        <DropdownMenuLabel>노드 작업</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>이름 변경</DropdownMenuItem>
        <DropdownMenuItem>관계 추가</DropdownMenuItem>
        <DropdownMenuItem>AI로 확장</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem style={{ color: "hsl(var(--destructive))" }}>삭제</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  </div>
);
