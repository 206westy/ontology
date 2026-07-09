import {
  Popover,
  PopoverTrigger,
  PopoverContent,
  Button,
  Label,
  Input,
} from "ontology";

export const FilterPopover = () => (
  <div style={{ padding: 24 }}>
    <Popover open>
      <PopoverTrigger asChild>
        <Button variant="outline">필터</Button>
      </PopoverTrigger>
      <PopoverContent style={{ width: 260 }}>
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ fontWeight: 600, fontSize: 14 }}>신뢰도 범위</div>
          <div style={{ display: "grid", gap: 6 }}>
            <Label htmlFor="min">최소</Label>
            <Input id="min" defaultValue="0.80" />
          </div>
          <Button size="sm">적용</Button>
        </div>
      </PopoverContent>
    </Popover>
  </div>
);
