# Ontology Studio — PRD-A: Parse 재설계 + 온톨로지 보강

> **범위**: 문서/자연어 → 온톨로지 추출 품질 개선 + 자동 보강
> **버전**: 1.0
> **작성일**: 2026-06-16
> **대상**: Claude Code (태스크 단위 순차 구현)
> **선행**: Phase 0 완료(검증·지연패치). 본 PRD는 그 위에 올라감.
> **비범위**: 구획(Named Graph) 분리 = 별도 **PRD-B**. 대량 문서 청킹 = P2.

---

## 배경: 실측으로 드러난 3대 문제

plasma strip 보고서(2,026자)를 parse한 실제 결과에서:

1. **별 모양(star)**: 관계 70개가 대부분 `Low damage plasma strip 공정` 한 노드에서 방사. 원인 = parse가 **문서 제목/주제를 암묵적 허브로 강제**하고 모든 노드를 거기 매닮. `공정→관련_하드웨어→Chuck`은 "같은 문서에 나옴" 수준의 정보량 0 관계.
2. **성긴 연결 / 섬**: 의미 있는 관계가 덜 추출됨. 단, **억지 연결보다 정직한 섬이 낫다**(연결 근거 없으면 섬 허용).
3. **빈약한 노드**: `RF Matcher`가 뭔지 정의 없음, "low RF가 낮을수록 좋다"는 정성 서술만 있고 정량 axiom 없음, 수치·근거 부재. → **보강 필요 지점이 방치됨**.

## 설계 원칙

- **추출과 연결을 분리**: 엔티티(점) 먼저 → 관계(선) 나중.
- **문서 제목을 허브로 강제 금지**: 원문에 명시적·의미적 근거(인과/구성/시간/측정 등)가 있는 관계만 생성.
- **섬 허용**: 근거 없으면 연결하지 않고 섬으로 둠. HITL에서 "연결 제안"만.
- **동일성 보수 처리**: 동의어(병합)와 연관(관계연결)을 구분. 병합은 기존 P0-2 ER에 위임, 본 PRD는 **관계 연결 제안**까지만.
- **보강은 별도 단계**: 추출 완료 후, **빈약한 곳을 자동 탐지**(개수 고정 금지)하여 내부→(opt-in)웹→HITL 순으로 채움.
- **출처(provenance) 필수**: 모든 관계/보강은 근거 출처(원문/기존그래프/웹/사용자)와 confidence를 달고, **자동 확정 없음**(HITL).

## 공통 규칙
- shadcn/ui·Lucide·Tailwind v4·CSS 변수만. 이모지 금지. 한국어 문구.
- LLM은 AI SDK(`generateObject`/`generateText`), 모델 `gpt-5.4-mini`(parse 현행). PATCH-4의 8000자 입력 상한 유지.
- 그래프 변경은 **store 액션 경유**(pendingChanges 기록, Undo 호환). `/api/batch` 금지.
- 멀티스테이지로 LLM 호출이 늘어나므로, 각 호출은 작고 focused하게. 독립 단계는 병렬화.

### 권장 순서
`A-1` → `A-2` → `A-5(프리뷰 골격)` → `A-3` → `A-4`
(추출 품질 먼저 → 기존그래프 연결 → 프리뷰로 눈으로 확인 → 보강 탐지 → 보강 소싱)

---

# A-1: 멀티스테이지 추출 (엔티티 → 관계)

### 배경
현재 `/api/llm/parse`는 단일 `generateObject` 호출로 엔티티+관계를 한꺼번에 뽑아 "제목 허브" 편향과 별 모양을 유발.

### 목표
추출을 **2개 LLM 호출로 분리**: (1) 엔티티+타입, (2) 근거 있는 관계만. 제목 허브 금지, 섬 허용.

### 현재 코드 상태
- `app/api/llm/parse/route.ts`: `generateObject` + `ParsedOntology` zod(classes/properties/instances/relationTypes/edges 한 묶음), `gpt-5.4-mini`, 8000자 상한.
- `NewNodePopover.tsx`: Text 탭 → `llmApi.parse()` → 프리뷰 → `handleConfirm`(토폴로지 정렬 후 store 액션).

### 구현 범위
**In**
1. parse를 2단계로 재구성:
   - **Stage 1 — 엔티티+타입**: 입력 텍스트 → `{ entities: [{ name, type, evidence }] }`. 관계 없음. 타입은 기존 클래스 재사용 우선, 없으면 신규 타입 제안.
   - **Stage 2 — 관계**: Stage 1 엔티티 목록 + 원문 → `{ relations: [{ source, target, type, evidence, confidence }] }`.
2. **프롬프트 제약(핵심)**:
   - "문서 제목·주제를 모든 노드의 부모/허브로 삼지 마라."
   - "원문에 명시적 근거(인과·구성·시간·측정·교체이력 등)가 있는 관계만 생성하라. 단지 같은 문서에 등장한다는 이유로 연결하지 마라."
   - "근거가 없으면 연결하지 말고 비워 둬라(섬 허용)."
   - "이름이 유사하지만 종류가 다른 개념(예: 부품 'Chuck' vs 파라미터 'Chuck 온도')은 **합치지 말고**, 의미 관계가 있으면 관계로 연결하라."
3. 각 엔티티/관계에 **evidence(원문 근거 스팬)** 와 관계 **confidence(0~1)** 부착.
4. 기존 단일 호출 폴백(`mockParse`)은 유지하되 신규 경로 우선.

**Out**: 보강(A-3/A-4), 기존그래프 매칭 고도화(A-2).

### API 계약
- `POST /api/llm/parse` (재구성, 응답 스키마 확장)
  - req: `{ text, existingSchema }` (existingSchema = 클래스 계층+타입, A-2에서 강화)
  - 내부: Stage1 `generateObject` → Stage2 `generateObject`
  - res: `{ entities: [{name,type,evidence}], relations: [{source,target,type,evidence,confidence}] }`

### 파일 변경
| 파일 | 구분 | 내용 |
|------|------|------|
| `app/api/llm/parse/route.ts` | 수정 | 2단계 호출 + 제약 프롬프트 |
| `features/ontology/lib/schemas.ts` | 수정 | 응답 스키마에 evidence/confidence 추가 |
| `features/ontology/lib/parse-prompts.ts` | 신규 | Stage1/Stage2 프롬프트(제목-허브 금지 규칙 포함) |
| `NewNodePopover.tsx` | 수정 | 신규 응답 형태 수용, 프리뷰 데이터 매핑 |

### 수용 기준
- [ ] plasma strip 텍스트 재투입 시 **별 모양 현저히 감소** (한 노드 방사 관계 수 < 이전의 절반, 정성 판단).
- [ ] `MW Power→Particle 증가` 같은 인과 관계는 유지.
- [ ] 근거 없는 노드는 섬으로 남음(억지 연결 안 함).
- [ ] `Chuck`과 `Chuck 온도`가 **병합되지 않고** 별개 유지(관계 연결은 허용).
- [ ] 각 관계에 evidence + confidence 존재.

### 테스트 포인트
- [ ] 제목만 거창하고 내용 빈약한 문서 → 노드는 생기되 관계는 적게(허브 강제 안 됨).
- [ ] 인과·교체이력 관계가 evidence와 함께 추출.

---

# A-2: 기존 그래프 연결성 검토 (노드 재사용)

### 배경
문서 A, B, C를 따로 넣으면 이름이 정확히 같을 때만 우연히 이어짐. "T를 텍스트에서 언급하면 기존 T에 붙어야"(parse=assist 동일 동작).

### 목표
추출된 엔티티를 **기존 그래프와 대조**해 동일 개념이면 재사용하고, 연관되면 교차 관계를 제안.

### 구현 범위
**In**
1. **스키마 컨텍스트 강화**: parse에 이름 목록 대신 **클래스 계층 + 타입 + 주요 관계**를 전달(v4 `buildSchemaContext` 제안 활용) → LLM이 "이 새 개념은 기존 X와 같다/X에 붙는다"를 판단.
2. **노드 동일성 해소(보수)**:
   - 신규 엔티티가 기존 노드와 **동일 개념**으로 판정되면 → 신규 생성 대신 **기존 노드 재사용**(이름·타입·의미 매칭).
   - 동일하진 않지만 **연관**이면 → 기존 노드로 향하는 **관계 제안**(병합 아님).
   - **병합(동의어 통합)은 본 PRD에서 자동 수행하지 않음** → 기존 P0-2 ER 큐로 위임(프리뷰에서 "중복 가능" 플래그만).
3. parse=assist 동일성: 텍스트에 "T에 A·B·C 포함, T 경량버전 X"라고 쓰면, T가 기존 노드면 거기에 A·B·C·X를 붙이고 T를 새로 만들지 않음.

**Out**: 자동 병합(ER 영역), 의미 임베딩 매칭(있으면 +, 없으면 이름·타입 기반).

### 파일 변경
| 파일 | 구분 | 내용 |
|------|------|------|
| `features/ontology/lib/schema-context-builder.ts` | 신규 | 계층+타입+관계 컨텍스트 생성 |
| `app/api/llm/parse/route.ts` | 수정 | 강화 컨텍스트 주입 + 재사용 판정 |
| `NewNodePopover.tsx` | 수정 | "기존 노드 재사용" 표시(이미 `isExisting` 패턴 있음 활용), "중복 가능" 플래그 |

### 수용 기준
- [ ] 기존에 `Chuck` 노드가 있을 때 새 문서가 `Chuck` 언급 → 신규 생성 없이 기존 재사용.
- [ ] "T 경량버전 X" 텍스트 → 기존 T에 X가 관계로 연결(T 중복 생성 없음).
- [ ] 동의어 의심 케이스는 병합하지 않고 "중복 가능" 플래그만 → P0-2 ER로 안내.

### 테스트 포인트
- [ ] A 문서 적재 후 B 문서 적재 시 겹치는 개념이 재사용되는지.
- [ ] parse 결과가 동일 노드를 두 번 만들지 않는지.

---

# A-3: 보강 대상 자동 탐지 (Gap Detection)

### 배경
추출이 끝난 온톨로지엔 "빈약한 곳"이 남음 — 정의 없는 노드, 정성 서술만 있고 정량 axiom 없는 관계, 고립 노드. **개수를 정하지 말고 자동 탐지**해야 함.

### 목표
방금 만들어진(+기존) 서브그래프를 스캔해 **보강이 필요한 지점을 자동 식별**하고 심각도로 정렬.

### 구현 범위
**In**
1. **결정론적 신호**(LLM 불필요, 빠름):
   - 설명/정의 없는 노드.
   - 관계 0~1개인 (준)고립 노드.
   - 형제 노드는 프로퍼티가 있는데 본인은 없는 노드.
   - 인스턴스인데 필수 프로퍼티 값이 빈 것.
2. **LLM 기반 신호**(정성 판단):
   - 정성 서술만 있고 **정량 근거/axiom이 빠진 관계** (예: "low RF가 낮을수록 좋다" → 임계치·제약 없음 → 보강 후보).
   - 타입 확신도 낮은 엔티티(A-1 confidence 활용).
   - 대상으로 참조되지만 **정의되지 않은 개념**(예: `RF Matcher`가 관계 대상이나 정의 없음).
3. **개수 고정 금지**: 탐지된 갭을 **전부** 산출하되 심각도(high/med/low)로 정렬. UI(A-5)에서 그룹핑해 과부하 방지.
4. 출력: `gaps: [{ targetId, kind, reason, severity }]`.

**Out**: 자동 수정(항상 제안만), 사용자 정의 규칙.

### API 계약
- `POST /api/llm/enrich/detect`
  - req: `{ subgraph }` (방금 추출분 + 인접 기존 노드)
  - 내부: 결정론적 스캔 + LLM 정성 스캔
  - res: `{ gaps: [{ targetId, kind: 'no_definition'|'isolated'|'missing_property'|'missing_axiom'|'undefined_concept'|'low_confidence', reason, severity }] }`

### 파일 변경
| 파일 | 구분 | 내용 |
|------|------|------|
| `app/api/llm/enrich/detect/route.ts` | 신규 | 갭 탐지(결정론+LLM) |
| `features/ontology/lib/gap-detector.ts` | 신규 | 결정론적 신호 계산 |
| `features/ontology/api.ts` | 수정 | `enrichApi.detect()` |

### 수용 기준
- [ ] 정의 없는 `RF Matcher`가 `undefined_concept`/`no_definition`으로 탐지.
- [ ] "낮을수록 좋다"류 정성 관계가 `missing_axiom`으로 탐지.
- [ ] 고립 노드가 `isolated`로 탐지.
- [ ] 탐지 개수가 고정되지 않고 실제 갭 수에 따라 가변.

### 테스트 포인트
- [ ] 일부러 정의/프로퍼티 비운 노드 → 해당 갭 탐지.
- [ ] 잘 채워진 노드는 갭으로 안 잡힘(오탐 낮음).

---

# A-4: 보강 소싱 (내부 → 웹(opt-in) → HITL)

### 배경
탐지된 갭을 **근거로 채움**. 단 PSK 사내 도메인 특성상 웹은 오염·보안 리스크 → 내부 우선, 웹은 선택.

### 목표
각 갭에 대해 **우선순위 소스로 보강 후보를 생성**하고, 출처·confidence를 달아 HITL에 올림.

### 구현 범위
**In**
1. **소스 우선순위**:
   1. 기존 온톨로지(그래프 조회) — 가장 정확.
   2. 세션 내 다른 문서(같은 import 묶음).
   3. **웹 검색(Tavily) — opt-in 토글**, 기본 OFF. 도메인 중립 개념에 한정.
   4. HITL — 사용자에게 직접 질문.
2. **보강 산출물**: 정의(description), 프로퍼티, **axiom/제약**, 수치/값 — 각각 `{ value, source_type, evidence, confidence }`.
3. **보안 가드(웹 사용 시)**: 사내 식별자(부품번호 `KC*`, 호기명 `*호기`, 내부 코드)는 웹 쿼리에서 **마스킹/제외**. 도메인 중립 용어만 질의.
4. **자동 확정 금지**: 모든 보강은 제안. 출처 표기 필수. 웹 출처는 "검증 필요" 배지.
5. **비용/속도 가드**: 갭별로만 호출(전수 호출 금지), 웹은 opt-in일 때만. 동시 호출 상한.

**Out**: 자동 axiom 적용, 웹 결과 무검증 반영.

### API 계약
- `POST /api/llm/enrich/source`
  - req: `{ gap, context, useWeb: boolean }`
  - 내부: 내부 그래프 조회 → (useWeb면) Tavily → LLM 종합
  - res: `{ proposals: [{ kind, value, source_type: 'existing_graph'|'session_doc'|'web'|'inferred', evidence, confidence, needsReview }] }`
- 웹 커넥터: Tavily API(또는 검색 도구). 키는 서버 env, opt-in 시에만 호출.

### 파일 변경
| 파일 | 구분 | 내용 |
|------|------|------|
| `app/api/llm/enrich/source/route.ts` | 신규 | 소스 우선순위 + 웹 opt-in + 마스킹 |
| `features/ontology/lib/identifier-mask.ts` | 신규 | 사내 식별자 마스킹(부품번호/호기명 패턴) |
| `features/ontology/api.ts` | 수정 | `enrichApi.source()` |
| (스키마) `lib/drizzle/schema.ts` | 수정 | edges/classes에 경량 provenance: `source_type`, `confidence`, `evidence`(nullable) 추가 마이그레이션 |

### 수용 기준
- [ ] `RF Matcher` 정의 보강 시 내부 우선 → 없으면 (opt-in) 웹 → 출처 표기.
- [ ] "낮을수록 좋다" → 정량 axiom 제안(예: 임계/방향 제약), source_type·confidence 부착.
- [ ] 웹 OFF가 기본. ON일 때만 외부 호출.
- [ ] 사내 식별자가 웹 쿼리에 포함되지 않음(마스킹 확인).
- [ ] 모든 보강은 제안 상태(자동 반영 없음).

### 테스트 포인트
- [ ] 웹 OFF에서 내부 소스만으로 보강 동작.
- [ ] `KC0330655` 포함 갭 → 웹 쿼리에서 마스킹.

---

# A-5: HITL 프리뷰 재설계 (추출+섬+보강 통합)

### 배경
기존 NewNodePopover 프리뷰는 계층/관계 목록 + 개별 삭제만. 섬 연결 제안, 보강 제안, 출처/confidence를 보여줘야 함.

### 목표
사용자가 **추출 결과 + 섬 + 보강 제안**을 한 화면에서 검토·취사선택·확정.

### 구현 범위
**In**
1. 프리뷰를 3영역으로:
   - **구조**: 추출된 엔티티/관계 트리(기존 유지 + 재사용 노드 표시).
   - **섬**: 연결 안 된 노드 목록 + "연결 제안" 버튼(강제 아님). 무시하고 섬으로 둘 수 있음.
   - **보강**: A-3/A-4 결과를 카드로. 각 카드에 출처 배지(원문/기존/웹/추론) + confidence + [채택]/[무시]. 웹 출처는 "검증 필요" 표시.
2. **취사선택**: 항목별 채택/제외. 확정 시 선택분만 **store 액션으로** 반영(pendingChanges 기록, Undo 호환).
3. provenance 영속화: 채택된 관계/보강은 `source_type`/`confidence`/`evidence` 저장(A-4 스키마).
4. "중복 가능" 플래그 노드는 P0-2 ER로 가는 링크 제공.

**Out**: 보강 항목 인라인 재편집 고도화(기본 채택/무시 + 이름수정 수준).

### 파일 변경
| 파일 | 구분 | 내용 |
|------|------|------|
| `NewNodePopover.tsx` | 수정 | 프리뷰 3영역(구조/섬/보강), 취사선택, 확정 시 선택분만 반영 |
| `features/ontology/components/preview/IslandList.tsx` | 신규 | 섬 노드 + 연결 제안 |
| `features/ontology/components/preview/EnrichmentCard.tsx` | 신규 | 보강 제안 카드(출처 배지+confidence) |
| `features/ontology/hooks/useOntologyStore.ts` | 수정(필요시) | 추출+보강 일괄 적용 헬퍼(단일 트랜잭션) |

### 수용 기준
- [ ] 프리뷰에 구조/섬/보강 3영역 표시.
- [ ] 섬 노드를 "그대로 섬으로 두기" 가능(강제 연결 없음).
- [ ] 보강 카드에 출처·confidence 표시, 웹 출처는 검증 필요 배지.
- [ ] 선택 채택분만 확정 → CommitBar 변경 기록 + Undo.
- [ ] 채택 항목에 provenance 저장됨.

### 테스트 포인트
- [ ] plasma strip 재투입 → 구조(별모양 완화)+섬+보강(RF Matcher 정의, axiom)이 프리뷰에 뜨고, 선택 확정.
- [ ] 보강 무시 시 그래프에 반영 안 됨.

---

## PRD-A 완료 정의 (DoD)
- [ ] plasma strip 재투입 시: 별 모양 완화 + 섬 정직 표시 + 빈약 노드 자동 탐지 + 보강 제안.
- [ ] parse=assist 동일성: 텍스트에서 기존 노드 언급 시 재사용(중복 생성 없음).
- [ ] 동의어는 병합 안 하고 ER로 위임, 연관은 관계 제안.
- [ ] 웹은 opt-in·마스킹·출처표기, 기본 OFF.
- [ ] 모든 반영은 store 액션 경유(pendingChanges/Undo) + provenance 저장.
- [ ] `npm run build` 성공, 기존 테스트 회귀 없음.

## 다음 (PRD-B)
도메인이 커져 "반도체 + 행정"처럼 갈릴 때 → **구획(Named Graph) 분리**. 스키마에 `graph_id`(quad의 `g`) 추가, AI가 연결성 낮은 입력을 새 구획으로 제안, 추론 격리(구획 내 탐색 → 경계 넘을 때 컨텍스트 전환). 본 PRD의 provenance·연결성 검토가 그 토대.