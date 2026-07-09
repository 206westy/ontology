import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectGroup,
  SelectLabel,
  SelectItem,
} from "ontology";

export const ClassSelect = () => (
  <div style={{ padding: 24 }}>
    <Select open defaultValue="symptom">
      <SelectTrigger style={{ width: 220 }}>
        <SelectValue placeholder="클래스 선택" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          <SelectLabel>온톨로지 역할</SelectLabel>
          <SelectItem value="symptom">증상</SelectItem>
          <SelectItem value="cause">원인</SelectItem>
          <SelectItem value="check">점검</SelectItem>
          <SelectItem value="action">조치</SelectItem>
          <SelectItem value="part">부품</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  </div>
);

export const Closed = () => (
  <Select defaultValue="symptom">
    <SelectTrigger style={{ width: 220 }}>
      <SelectValue placeholder="클래스 선택" />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="symptom">증상</SelectItem>
      <SelectItem value="cause">원인</SelectItem>
    </SelectContent>
  </Select>
);
