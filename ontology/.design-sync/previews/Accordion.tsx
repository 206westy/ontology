import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "ontology";

export const SchemaSections = () => (
  <Accordion type="single" collapsible defaultValue="props" style={{ width: 360 }}>
    <AccordionItem value="props">
      <AccordionTrigger>속성 (Properties)</AccordionTrigger>
      <AccordionContent>
        <div style={{ color: "hsl(var(--muted-foreground))" }}>
          엔진 과열 클래스는 온도, 발생시각, 심각도 속성을 가집니다.
        </div>
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="relations">
      <AccordionTrigger>관계 (Relations)</AccordionTrigger>
      <AccordionContent>
        <div style={{ color: "hsl(var(--muted-foreground))" }}>
          →원인: 냉각수 부족 · →조치: 냉각계통 점검
        </div>
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="instances">
      <AccordionTrigger>인스턴스 (Instances)</AccordionTrigger>
      <AccordionContent>
        <div style={{ color: "hsl(var(--muted-foreground))" }}>
          현재 12건의 인스턴스가 연결되어 있습니다.
        </div>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
);

export const CommitHistory = () => (
  <Accordion type="single" collapsible style={{ width: 360 }}>
    <AccordionItem value="c1">
      <AccordionTrigger>커밋 #a1f3 · 클래스 병합</AccordionTrigger>
      <AccordionContent>
        <div style={{ color: "hsl(var(--muted-foreground))" }}>
          증상/원인 브랜치를 main에 병합. 신뢰도 0.88.
        </div>
      </AccordionContent>
    </AccordionItem>
    <AccordionItem value="c2">
      <AccordionTrigger>커밋 #b7e0 · 관계 추가</AccordionTrigger>
      <AccordionContent>
        <div style={{ color: "hsl(var(--muted-foreground))" }}>
          부품→점검 관계 3건 신규 등록.
        </div>
      </AccordionContent>
    </AccordionItem>
  </Accordion>
);
