# 골든셋 라벨링 가이드 (PRD-F P3-1)

추출 품질을 숫자로 증명하려면 "정답(expected)"이 있어야 한다. 이 문서는 실데이터
(plasma strip 보고서 등)를 골든 케이스로 라벨링하는 절차·기준을 정의한다.

## 포맷

각 케이스는 `src/__tests__/fixtures/golden/index.ts`의 `GoldenCase` 형태다.

```ts
{
  id: 'plasma-strip-01',
  description: '한 줄 설명(도메인·출처)',
  inputText: '추출에 넣을 자유 텍스트 원문',
  expected: {
    entities: [{ name, type }],                      // 나와야 할 개념
    relations: [{ source, target, type, category }], // 나와야 할 관계(+분류)
  },
}
```

라벨 포맷은 parse 출력 스키마(`parsedEntitySchema`/`parsedRelationSchema`)와 1:1
대응한다. entity name 은 정규화 매칭(대소문자·공백·특수문자 무시)되므로 표기 흔들림은
허용된다.

## category 판정 기준 (Stage2 루브릭과 동일)

| category | 의미 | 예 |
|---|---|---|
| structural | 구성·포함·계층(부분-전체) | "챔버는 히터를 포함한다" |
| causal | 원인→결과 | "과열이 마모를 유발한다" |
| diagnostic | 측정·진단·증상 관계 | "마모는 진동으로 측정된다" |
| procedural | 절차·순서·선후 | "세정 후 건조한다" |
| descriptive | 정의·서술·레이아웃 등 액션성 낮은 서술 | "A는 B의 일종이다" |

동일 관계에 두 해석이 가능하면 **더 액션 지향적인 쪽**을 택한다(descriptive 는 최후).

## 절차

1. 원문을 `inputText`에 그대로 넣는다(가공 최소화).
2. 도메인 전문가가 나와야 할 entity/relation 을 직접 나열한다(LLM 출력 참고 금지 —
   정답 오염 방지).
3. 각 relation 에 category 를 위 기준으로 부여한다.
4. 소규모(20~30건)부터 시작한다. synthetic 케이스와 혼재해도 컴파일·실행된다.
5. `GOLDEN_CASES` 배열에 추가한다.

## 측정

`RUN_EVAL=1`로 eval 스위트를 돌리면 라이브 parse 를 골든셋에 실행해
entity/relation/category 점수 + calibration(ECE) 리포트를 `docs/eval-results.md`에
누적하고, 임계 미달 시 실패한다(P3-4).
