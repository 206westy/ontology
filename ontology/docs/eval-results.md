# 추출 Eval 결과 (PRD-F P3-4)

`RUN_EVAL=1`로 골든셋 위 라이브 parse 를 실행할 때마다 아래 표에 한 줄씩 누적된다.
매 커밋이 아니라 nightly(또는 수동)로 돈다 — LLM 비용·지연 때문.

- **rel F1**: 관계 (source,target,type) 미세평균 F1. 시작 임계 ≥ 0.6.
- **cat acc**: 매칭된 관계의 category 정확도. 시작 임계 ≥ 0.7.
- **ECE**: expected calibration error(낮을수록 confidence 보정 양호).
- **overconf**: 과신(confidence↑·정답률↓) bin 수.

수동 실행:

```bash
RUN_EVAL=1 OPENAI_API_KEY=... npx vitest run src/__tests__/eval/extraction-eval.test.ts
```

| 시각(UTC) | 케이스 | rel F1 | cat acc | ECE | overconf |
|---|---|---|---|---|---|
