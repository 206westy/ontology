# Ontology Studio — PRD-F: 재현 가능한 생성 · 입력 완전성 · Critic 적중률 측정

> **범위**: AI 추출 파이프라인이 (1) **재현 가능**하고, (2) **입력 전체**를 보고 생성하며, (3) 그 품질을 **숫자로 증명**하도록 만든다. 그 위에 (4) category 신뢰 게이트와 (5) web 보강 검증으로 Critic을 정밀화한다.
> **버전**: 1.0
> **작성일**: 2026-06-30
> **대상**: Claude Code (태스크 단위 순차 구현)
> **선행**: v5 완료(무손실 적재·dedup·assist apply), v6 Critic(진행 중). 본 PRD는 Critic의 **선결 전제**를 메우고 그 위에 올라간다.
> **비범위**: Critic 검수 파이프라인 본체(= v6 prd-critic), Grounder/Operator/Steward(v6 P2~P4), 멀티테넌시·인증.

---

## 배경: 비판적 검토에서 살아남은 것

v5에서 "무손실 운반"은 해결됐고, v6 Critic이 "입력 시점 검수"를 계획 중이다. 그러나 Critic이 작동하기 위한 **세 가지 전제**가 비어 있다.

1. **재현 불가능한 생성** — parse 추출 entity에 매번 random UUID가 발급된다. 같은 문서를 두 번 넣으면 동일성이 깨지고, `cypher-builder`의 MERGE는 dedup 사후 청소에 의존한다. "단일 진실 모델"인데 생성이 재현 불가능하면 모순이다.
2. **입력의 머리만 읽는 생성** — `app/api/llm/parse/route.ts`의 8,000자 상한이 살아 있고, 대량 문서 청킹은 v5에서 P2로 미뤄진 뒤 v6가 그 슬롯을 Grounder로 바꿔 **로드맵 어디에도 없다**. 실제 PSK 매뉴얼이 들어오면 꼬리를 말없이 버린다. **입력의 절반을 못 본 Critic은 무의미하다.**
3. **측정되지 않는 category** — `extraction-score.ts`는 관계를 `(source, target, type)`로만 채점하고 **category를 채점하지 않는다.** Stage-2 프롬프트의 정교한 분류 루브릭이 실제로 몇 % 맞히는지 모른다. 그 category가 myATHENA traversal 라우팅을 좌우하는데도.

여기에 두 가지 정밀화(category 신뢰 게이트, web 주장 검증)를 더한다.

---

## 현재 상태 대조 (코드 직접 확인)

| 영역 | 현재 | 갭 | 본 PRD |
|---|---|---|---|
| entity 식별 | parse가 random UUID 발급 | 같은 입력 → 다른 id, MERGE 무력 | P1 |
| 결정성 | `generateObject` 기본 온도 | 재파싱 시 그래프 변동 | P1 |
| 입력 길이 | `parse/route.ts` 8,000자 상한 | 긴 문서 머리만 추출 | P2 |
| 청크 병합 | 없음 | 청크 경계마다 별모양·섬 재발 | P2 |
| 추출 채점 | `scoreExtraction`: entity/relation P/R/F1 | **category 미채점**, calibration 없음 | P3 |
| 골든셋 | `__tests__/fixtures/golden/`: synthetic 1건 | 실 라벨 케이스 0건, category 필드 없음 | P3 |
| category 신뢰 | 관계에 `confidence`만 | category 전용 신뢰·게이트 없음 | P4 |
| web 보강 | `enrich/source`: "검증 필요" 배지만 | 인용 페이지가 주장을 지지하는지 미검증 | P4 |

확인된 자산(재사용): `parse-prompts.ts`(Stage1/2), `schemas.ts`(`parsedRelationSchema`·`relationCategoryEnum`), `metrics/extraction-score.ts`, `metrics/health.ts`, `fixtures/golden/index.ts`, `similarity.ts`(`normalizeName`), `cypher-builder.ts`, `lib/drizzle/schema.ts`.

---

## 공통 규칙

- LLM은 AI SDK(`generateObject`/`generateText`), strict structured output(모든 필드 required, optional 금지 — nullable 사용).
- 그래프 변경은 **store 액션 경유**(pendingChanges/Undo). 인터랙티브 `/api/batch` 금지.
- 모든 AI 산출은 **제안만**, 자동 확정 없음. evidence·confidence 필수. 신규 노드에 attribution 기록.
- shadcn/ui·Lucide·Tailwind v4·CSS 변수, 하드코딩 색상·이모지 금지, UI 문구 한국어. border-radius 8–10px.
- 마이그레이션 무손실. 회귀 테스트 통과.
- 멀티스테이지 LLM 호출은 작고 focused하게, 독립 단계 병렬화.

---

# PHASE 1 — 재현 가능한 생성 (결정성·동일성)

> Critic이 "단일 진실 모델에 대한 diff"를 계산하려면, 같은 입력이 같은 노드로 수렴해야 한다.

## P1-1: 안정 식별자 (content-hash identity)

**In**
1. `features/ontology/lib/identity.ts`(신규): `stableEntityId(name, classHint, partition)` — `normalizeName`(기존 `similarity.ts`) 적용 후 `partition|classHint|norm`을 SHA-1.
2. parse apply 경로(`NewNodePopover.handleConfirm`, `AIAssistantTab` apply)에서 신규 entity id를 random UUID 대신 `stableEntityId`로 생성.
3. **이름 변경(rename)은 본 함수로 풀지 않음** — 기존 dedup(`/api/dedup/candidates` → `/api/llm/resolve`)에 위임. 본 태스크는 "같은 입력 재유입"만 고정.

**파일**: `features/ontology/lib/identity.ts`(신규), `features/ontology/lib/similarity.ts`(재사용), apply 경로(수정), `__tests__/lib/identity.test.ts`(신규).

**수용**
- [ ] 동일 텍스트 2회 parse → 신규 entity id 동일.
- [ ] 대소문자·공백·특수문자만 다른 이름 → 같은 id.
- [ ] 다른 classHint/partition → 다른 id.
- [ ] 재유입 시 `cypher-builder` MERGE가 중복 노드 0건 생성.

## P1-2: 결정성 + parse 캐시

**In**
1. parse Stage1/Stage2의 `generateObject` 호출에 `temperature: 0`. "bit-identical 아님, 분산 최소화"로 주석·문서화.
2. 입력 텍스트(+모드+기존 스키마 컨텍스트) 해시를 키로 parse 결과 캐시. 적중 시 LLM 호출 생략.
3. 캐시는 단순 KV(예: `parse_cache` 테이블 또는 메모리+TTL). 무효화: 입력 변경 시 자연 미스.

**파일**: `app/api/llm/parse/route.ts`(수정), `features/ontology/lib/parse-cache.ts`(신규), `lib/drizzle/schema.ts`(선택: 캐시 테이블).

**수용**
- [ ] 동일 입력 재요청 시 캐시 적중(LLM 비호출) + 동일 결과.
- [ ] 입력 1글자 변경 시 캐시 미스.

---

# PHASE 2 — 입력 완전성 (청킹)

> 8,000자 상한 제거. Critic의 전제: 입력 전체를 본다.

## P2-1: 청킹 분할 + 상한 제거

**In**
1. `features/ontology/lib/chunk.ts`(신규): heading/문단 경계 기준 ~3–6k 토큰 청크 + 청크 간 overlap(문맥 단절 방지). 표/코드 블록은 분할 금지.
2. `parse/route.ts`의 8,000자 하드 상한 제거 → 입력이 단일 청크 한도를 넘으면 청킹 경로로 분기. 단일 청크 이하 입력은 기존 경로 유지(back-compat).
3. 공통 규칙의 "8000자 상한 유지" 문구 폐기.

**파일**: `features/ontology/lib/chunk.ts`(신규), `app/api/llm/parse/route.ts`(수정), `__tests__/lib/chunk.test.ts`(신규).

**수용**
- [ ] 20k자 문서가 잘리지 않고 전량 처리.
- [ ] 청크 경계가 문단/heading에 정렬, overlap 존재.
- [ ] 단일 청크 이하 입력은 기존 단일 경로로 동작(회귀 없음).

## P2-2: 청크 간 전역 entity 병합

**In**
1. 청크별 Stage1(entity) 추출을 **병렬** 실행.
2. 청크 결과를 **전역 병합**: `stableEntityId`(P1-1) 1차 + 임베딩 유사도(`text-embedding-3-small`, 기존 정책) 2차로 경계 넘어 동일 entity 합침.
3. 병합은 **보수적** — 동의어 의심은 합치지 말고 기존 ER 큐로(자동 병합 금지, v5 원칙 유지).

**파일**: `app/api/llm/parse/route.ts`(수정: 청크 오케스트레이션), `features/ontology/lib/entity-merge.ts`(신규), `features/ontology/lib/embedding.ts`(재사용).

**수용**
- [ ] 청크 A·B에 등장하는 동일 개념이 단일 entity로 병합.
- [ ] stable id 일치 → 자동 병합, 임베딩 근접만 → 후보 제안(자동 병합 X).

## P2-3: 전역 관계 추출

**In**
1. Stage2(관계)는 청크별로 돌리되 **전역 병합된 entity 목록**을 컨텍스트로 전달(`buildStage2User`는 이미 entity 목록 인자를 받음 → 전역 목록 주입).
2. 청크별 관계를 병합·dedup: 동일 `(source, target, type, category)`는 1건으로, confidence는 최댓값 유지.
3. **별모양·섬 방지 규칙은 전역 기준 적용** — "같은 청크에 나왔다"는 근거 불충분, 기존 grounding 규칙 그대로.

**파일**: `app/api/llm/parse/route.ts`(수정), `features/ontology/lib/parse-prompts.ts`(`buildStage2User` 재사용), `features/ontology/lib/relation-merge.ts`(신규).

**수용**
- [ ] 청크 경계에서 별모양 허브 재발 없음(`health.ts` 별모양 지수로 측정).
- [ ] 중복 관계 dedup, 동일 관계 1건.
- [ ] 근거 없는 청크 간 연결 미생성(섬 허용).

---

# PHASE 3 — Critic 적중률 측정 (category 실측 + calibration)

> 기존 하니스를 확장해, Critic 규칙이 **실제로 몇 % 맞히는지**를 숫자로 만든다.

## P3-1: 골든셋 category 필드 + 실 라벨 포맷

**In**
1. `fixtures/golden/index.ts`의 `GoldenRelation`에 `category: RelationCategory` 추가.
2. 실 라벨링 가이드 문서(`docs/golden-labeling.md`): plasma strip 보고서 등 실데이터 라벨 절차·기준(category 판정 기준은 Stage2 루브릭과 동일).
3. 실 케이스 슬롯 마련(데이터는 owner 제공) — 코드는 synthetic + 실 케이스 혼재로 컴파일·실행 가능.

**파일**: `__tests__/fixtures/golden/index.ts`(수정), `docs/golden-labeling.md`(신규).

**수용**
- [ ] `GoldenRelation`에 category 존재, synthetic 케이스 백필.
- [ ] 라벨 포맷이 parse 출력 스키마와 1:1 대응.

## P3-2: scoreExtraction category 채점 + 혼동행렬

**In**
1. `ScoredRelation`에 `category` 추가, `scoreExtraction`에 **category 정확도** 산출: `(source,target,type)`로 매칭된 관계 중 category가 일치하는 비율.
2. **혼동행렬** 반환: 5×5(structural/causal/diagnostic/procedural/descriptive) — 어느 카테고리가 어디로 오분류되는지.
3. 기존 entity/relation P/R/F1은 불변(회귀 없음).

**파일**: `features/ontology/lib/metrics/extraction-score.ts`(수정), `__tests__/lib/extraction-score.test.ts`(수정).

**수용**
- [ ] 매칭된 관계의 category 정확도 산출.
- [ ] 혼동행렬로 diagnostic↔procedural 혼동 등 가시화.
- [ ] 기존 테스트 전부 통과.

## P3-3: confidence calibration 측정

**In**
1. `features/ontology/lib/metrics/calibration.ts`(신규): 관계 confidence를 bin으로 묶어 **예측 confidence vs 실제 정답률**(reliability) + ECE(expected calibration error) 산출. 골든셋 라벨 필요.
2. v6 북극성의 "confidence 보정도" 지표를 코드로 연결.

**파일**: `features/ontology/lib/metrics/calibration.ts`(신규), `features/ontology/lib/metrics/index.ts`(export), `__tests__/lib/calibration.test.ts`(신규).

**수용**
- [ ] reliability 곡선 데이터 + ECE 산출.
- [ ] 과신(confidence↑·정답률↓) 구간 탐지.

## P3-4: 추출 eval CI 게이트 (nightly)

**In**
1. `scripts/eval-extraction.ts`(신규): 골든셋 위에서 라이브 parse 실행 → entity/relation/category 점수 + calibration 리포트 출력.
2. **nightly CI**(매 커밋 아님 — LLM 비용/지연). 임계 미달 시 fail. 시작 임계: relation F1 ≥ 0.6, category 정확도 ≥ 0.7(점진 상향).
3. 결과를 `docs/eval-results.md`에 누적 기록.

**파일**: `scripts/eval-extraction.ts`(신규), CI 워크플로(수정), `docs/eval-results.md`(신규).

**수용**
- [ ] nightly로 점수 산출·게이트 작동.
- [ ] 임계 미달 시 빌드 실패.
- [ ] 모델 비교 결과로 **추출 모델 단일 고정**(parse/assist 산개 종료).

---

# PHASE 4 — Critic 정밀화 (category 신뢰 게이트 + web 검증)

## P4-1: category 전용 신뢰 + 저신뢰 라우팅

**In**
1. `parsedRelationSchema`에 `categoryConfidence: z.number().min(0).max(1)` 추가(strict: required). Stage2 프롬프트에 "category 판정 확신도"를 별도로 요구.
2. `categoryConfidence < 0.7`인 관계는 **traversal 라우팅에서 강등** — category는 보존하되 `_catconf`를 Neo4j 관계 속성으로 운반(`cypher-builder` 수정), myATHENA는 저신뢰를 "포함하되 비우선"으로 명시 처리(드롭 아님).
3. 저신뢰 category는 Critic 검수 큐("분류 확인")로. **신규 enum 값 추가 금지**(DB `chk_relation_category` 불변) — 별도 신뢰 컬럼/속성으로만 처리.

**파일**: `features/ontology/lib/schemas.ts`(수정), `features/ontology/lib/parse-prompts.ts`(Stage2 수정), `lib/neo4j/cypher-builder.ts`(수정: `_catconf` 운반), `lib/drizzle/schema.ts`(선택: edges에 category_confidence).

**수용**
- [ ] 관계마다 categoryConfidence 산출.
- [ ] 저신뢰 관계가 Neo4j에 `_catconf`로 운반.
- [ ] 저신뢰 항목이 검수 큐로, traversal에서 비우선 처리.
- [ ] DB category 제약 불변(회귀 없음).

## P4-2: web 보강 주장 검증

**In**
1. `enrich/source`의 web 후보에 **검증 패스** 추가: LLM-as-judge로 "인용 페이지가 이 주장을 실제로 지지하는가" 0/1 판정.
2. 통과만 `source_type='web'`로 제안, 실패는 드롭/플래그. evidence에 지지 스팬 기록.
3. 사내 식별자 마스킹(기존 A-4 보안 가드) 유지.

**파일**: `app/api/llm/enrich/source/route.ts`(수정), `features/ontology/lib/web-verify.ts`(신규).

**수용**
- [ ] 인용 페이지가 미지원하는 web 주장은 제안에서 제외.
- [ ] 통과 주장에 지지 스팬 evidence 부착.
- [ ] 사내 식별자가 web 쿼리에 노출되지 않음.

---

## 실행 순서 (의존성 기준)

| 순서 | 태스크 | 근거 |
|---|---|---|
| 1 | **P1-1, P1-2** | 안정 식별자·결정성은 청크 병합과 MERGE의 전제. 작고 레버리지 큼. |
| 2 | **P2-1 → P2-2 → P2-3** | P1-1 의존. 실제 입력에서 생성이 작동하게. 임계 경로. |
| 3 | **P3-1 → P3-2 → P3-3 → P3-4** | 위 변경의 효과를 숫자로 증명. P3-4가 모델 고정 결정. |
| 4 | **P4-1, P4-2** | P3 측정으로 임계값을 정당화한 뒤 게이트 적용. |

> P3는 P1·P2와 부분 병렬 가능하나, **임계값 결정(P3-4)은 P1·P2 반영 후**가 의미 있다. P4의 0.7 같은 컷은 P3 측정 없이 정하면 또 감(感)이다.

---

## 리스크

| 리스크 | 심각도 | 대응 |
|---|---|---|
| 청크 경계에서 entity 병합 오류(과병합/미병합) | High | stable id 1차·임베딩 2차, 의심은 ER 큐로(자동 병합 금지) |
| 실 골든셋 라벨링이 owner 병목 | High | 소규모(20~30건)부터, 포맷·가이드 선제공, synthetic 병행 |
| 멀티스테이지+청킹으로 LLM 호출·비용 급증 | Medium | 청크 병렬화, parse 캐시(P1-2), nightly eval(매 커밋 아님) |
| categoryConfidence가 또 다른 미검증 LLM 출력 | Medium | P3-2 혼동행렬로 상시 검증, 저신뢰는 드롭 아닌 강등 |
| 결정성(temperature:0)이 추출 다양성 저하 | Low | 추출은 다양성보다 재현성이 우선, eval로 품질 모니터 |

---

## 비범위 (명시적 제외)

- Critic 검수 파이프라인 본체(diff 제안·헬스 점수·컨벤션 규칙셋) = **v6 prd-critic**.
- 인라인 정합 게이트(validation 사후→사전 당김) = v6 Critic P1에 이미 포함, 본 PRD 중복 제외.
- Grounder(데이터 접지)·Operator(운영 추론)·Steward(거버넌스) = v6 P2~P4.
- 문서 관리 UI(폴더·버전·태그), bulk ingestion UI — 청킹은 추출 경로까지만, UI는 별도.
- 멀티테넌시·인증·랜딩(외부 SaaS 결정 후).