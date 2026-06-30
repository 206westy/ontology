// S0 — Golden set scaffold. A golden case pairs an input document with the
// ontology we expect extraction to produce, so S6 can measure precision/recall
// and track 별모양 지수 / 재사용률 over time.
//
// NOTE: real labeled cases (plasma strip 보고서 등) are domain data the owner
// supplies. This file ships the FORMAT plus one small synthetic case so the
// harness and S6 measurement code have something to compile and run against.

export interface GoldenEntity {
  name: string;
  type: string; // expected class/type name
}

export interface GoldenRelation {
  source: string;
  target: string;
  type: string;
}

export interface GoldenCase {
  id: string;
  description: string;
  // The free-text input fed to extraction.
  inputText: string;
  // What a correct extraction should yield.
  expected: {
    entities: GoldenEntity[];
    relations: GoldenRelation[];
  };
}

// Synthetic placeholder — replace/extend with real labeled cases.
export const SYNTHETIC_CASE: GoldenCase = {
  id: 'synthetic-pump-overheat',
  description: '합성 예시: 펌프 과열 → 베어링 마모 인과. 실데이터로 교체 예정.',
  inputText:
    '펌프가 과열되면 베어링이 마모된다. 베어링 마모는 진동 증가로 측정된다. 윤활유 부족이 과열의 원인이다.',
  expected: {
    entities: [
      { name: '펌프', type: '설비' },
      { name: '과열', type: '현상' },
      { name: '베어링', type: '부품' },
      { name: '마모', type: '고장모드' },
      { name: '진동 증가', type: '증상' },
      { name: '윤활유 부족', type: '원인' },
    ],
    relations: [
      { source: '과열', target: '마모', type: 'causes' },
      { source: '마모', target: '진동 증가', type: 'measured_by' },
      { source: '윤활유 부족', target: '과열', type: 'causes' },
    ],
  },
};

export const GOLDEN_CASES: GoldenCase[] = [SYNTHETIC_CASE];
