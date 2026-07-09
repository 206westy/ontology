import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from "ontology";

const boxStyle = {
  width: 440,
  height: 340,
  border: "1px solid hsl(var(--border))",
  borderRadius: 8,
  overflow: "hidden",
} as const;

export const NodePalette = () => (
  <Command style={boxStyle}>
    <CommandInput placeholder="노드 · 클래스 · 관계 검색..." />
    <CommandList>
      <CommandEmpty>일치하는 노드가 없습니다.</CommandEmpty>
      <CommandGroup heading="증상">
        <CommandItem>
          엔진 과열
          <CommandShortcut>0.92</CommandShortcut>
        </CommandItem>
        <CommandItem>
          시동 불량
          <CommandShortcut>0.84</CommandShortcut>
        </CommandItem>
      </CommandGroup>
      <CommandSeparator />
      <CommandGroup heading="조치">
        <CommandItem>
          서모스탯 교체
          <CommandShortcut>⌘⏎</CommandShortcut>
        </CommandItem>
        <CommandItem>
          냉각수 보충
          <CommandShortcut>⌘R</CommandShortcut>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
);

export const ActionMenu = () => (
  <Command style={boxStyle}>
    <CommandInput placeholder="명령 실행..." />
    <CommandList>
      <CommandEmpty>명령을 찾을 수 없습니다.</CommandEmpty>
      <CommandGroup heading="그래프">
        <CommandItem>
          새 노드 추가
          <CommandShortcut>⌘N</CommandShortcut>
        </CommandItem>
        <CommandItem>
          관계 연결
          <CommandShortcut>⌘L</CommandShortcut>
        </CommandItem>
        <CommandItem>
          브랜치 병합
          <CommandShortcut>⌘M</CommandShortcut>
        </CommandItem>
      </CommandGroup>
    </CommandList>
  </Command>
);
