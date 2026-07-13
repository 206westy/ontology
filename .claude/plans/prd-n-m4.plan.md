# Plan: PRD-N M4 — Operator: 가드레일 질의 + 근거경로

**Source PRD**: `docs/진행중/PRD-N.md` (§M4, v6 P3 승계)
**Selected Milestone**: M4 — Operator (M2 스코프·M3 접지 위)
**Complexity**: Large (신규 순수 탐색 + 진단형 RAG 라우트 + AI 질의 UI)
**앱 루트**: `ontology/ontology/ontology/` · 경로는 `src/` 기준
**선행 환경**: Neo4j(Docker) 반영본 데이터

## Summary

AI 질의가 온톨로지를 통해서만(구획 스코프+bridge 경계) 탐색하고 모든 결론에 추적 가능한 근거경로+출처를 붙인다. 진입(벡터·M2 스코프) → 구획 스코프 그래프 탐색(가드레일: 경로 상 모든 노드 `partition=$partition`) → 경로·provenance 수집 → LLM 종합(모델 밖 추측은 "근거 없음" 분리). 경로 클릭 → 캔버스 하이라이트.

## 핵심 설계 결정 (분석 근거)

1. **탐색 가드레일 = 결정론 Cypher.** `MATCH p=(start)-[*1..D]-(m) WHERE start.id IN $ids AND ALL(n IN nodes(p) WHERE n.partition=$partition)` — 경로 상 한 노드라도 타 구획이면 배제(bridge 이탈 자동 차단). 노드 속성 = `partition`·`_src`·`_conf`·`_srcRef`·description(확인: [cypher-builder.ts:191](../../ontology/src/lib/neo4j/cypher-builder.ts#L191), [schema.ts:21](../../ontology/src/lib/neo4j/schema.ts#L21) ATTRIBUTION_KEYS). 엣지 `r.bridge`·`type(r)`.
2. **LLM은 종합 1회.** 탐색은 결정론(Cypher), LLM은 수집된 경로만으로 답을 쓰고 스키마 밖은 "모델에 근거 없음"으로 분리(환각 억제·비용). enrich/detect의 `generateText`+`Output.object` 패턴.
3. **진입은 M2 스코프 재사용.** [rag/entrypoint](../../ontology/src/app/api/rag/entrypoint/route.ts)의 벡터+partition 필터를 answer 라우트가 내부 재사용(또는 동일 Cypher).
4. **순수 분리.** 탐색 Cypher 빌드·레코드 정형·provenance 수집을 `lib/rag/traverse.ts` 순수 함수로(테스트 가능). 라우트는 얇게.
5. **UI = AIAssistantTab에 근거 모드.** 채팅 표면에 "근거 기반 답변" 토글 → `ragApi.answer` 라우팅, assistant 메시지에 답변+근거경로(클릭 시 `highlightNodes`)+출처+근거없음 렌더. 기존 액션 채팅 무회귀.

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 벡터 진입·스코프 | `app/api/rag/entrypoint/route.ts` | queryNodes + partition 필터 |
| LLM 구조화 종합 | `app/api/llm/enrich/detect/route.ts:75-85` | generateText+Output.object, 실패 보존 |
| read 전용 Neo4j | `app/api/llm/text2cypher/route.ts:89-126` | executeRead 세션 |
| 순수 로직 분리 | `lib/neo4j/scope.ts` (M2) | Cypher 빌드/정형 순수 함수 |
| 하이라이트 | `Text2CypherTab.tsx:574-589` `handleShowOnCanvas` | `highlightNodes(ids)` |
| 채팅 UI | `AIAssistantTab.tsx:127+` `submitMessage` | 메시지 모델 확장 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `src/features/ontology/lib/rag/traverse.ts` | CREATE | 스코프 탐색 Cypher 빌드·경로 정형·provenance(순수) |
| `src/features/ontology/lib/rag/traverse.test.ts` | CREATE | 단위 테스트(TDD) |
| `src/app/api/rag/answer/route.ts` | CREATE | 진단형 RAG(진입→탐색→근거경로→종합) |
| `src/app/api/rag/answer/route.test.ts` | CREATE | 라우트 테스트(모킹) |
| `src/features/ontology/lib/schemas.ts` | UPDATE | ragAnswer 요청/응답 스키마 |
| `src/features/ontology/api.ts` | UPDATE | `ragApi.answer` + 타입 |
| `src/features/ontology/components/ai/EvidencePathCard.tsx` | CREATE | 근거경로·출처·근거없음 렌더(클릭 하이라이트) |
| `src/features/ontology/components/AIAssistantTab.tsx` | UPDATE | 근거 모드 토글 + 메시지에 evidence |

## Tasks

### Task 1: traverse.ts 순수 (TDD)
- **Action**: `buildTraversalCypher(entryIds, {partition, maxDepth=2, limit=25})` → `{ cypher, params }`(가드레일 ALL-in-partition). `shapeEvidencePaths(records)` → `EvidencePath[]`(nodes/edges/partition). `collectProvenance(paths)` → `Provenance[]`(고유 노드 src/srcRef). `pathsToPromptText(paths)` → LLM 입력 문자열.
- **Mirror**: `scope.ts`
- **Validate**: `npm test -- rag/traverse`

### Task 2: rag/answer 라우트 (TDD)
- **Action**: `POST /api/rag/answer` — `{ question, partitionId?, k?, maxDepth? }` → embed → 진입 노드(스코프) → `buildTraversalCypher` 실행(executeRead) → `shapeEvidencePaths`+`collectProvenance` → `generateText`(Output.object `{answer, hasUngrounded, ungroundedNote}`, 경로만 근거) → `{ answer, paths, sources, grounded, ungroundedNote }`. 경로 0이면 "근거 없음" 명시. LLM 실패는 결정론 경로 보존.
- **Mirror**: `enrich/detect/route.ts`, `text2cypher/route.ts`
- **Validate**: `npm test -- rag/answer`(ai+neo4j client 모킹)

### Task 3: 클라이언트 + UI
- **Action**: `ragApi.answer` + 타입. `EvidencePathCard`(경로 칩·출처 목록·근거없음 배지, 칩 클릭 `onHighlight(nodeIds)`). AIAssistantTab에 "근거 기반" 토글 상태 + submit 분기(on→ragApi.answer, off→기존 assistApi), assistant 메시지에 `evidence` 저장·렌더, 경로 클릭 `highlightNodes`.
- **Mirror**: `Text2CypherTab.tsx` 하이라이트, `ai/ActionCard.tsx`
- **Validate**: `npm test`(AIAssistant 회귀 0), 타입

### Task 4: 검증 + MCP 라이브
- **Action**: 빌드(불가 시 tsc)·lint·전체 테스트 그린. MCP로 합성 2구획 경로 생성→스코프 탐색이 타 구획 경로 배제 실증→정리.
- **Validate**: 아래

## Validation
```bash
cd ontology/ontology/ontology
npm test && npm run lint && npx tsc --noEmit
```
MCP: `MATCH p=(a)-[*1..2]-(b) WHERE ... ALL(n IN nodes(p) WHERE n.partition=$p)` 로 스코프 격리 탐색 실증.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| 가변길이 탐색 폭주(성능) | Med | maxDepth=2·LIMIT 25 상한, partition 인덱스 |
| LLM이 경로 밖 추측(환각) | Med | 경로만 컨텍스트·근거없음 분리 필드·경로 0시 명시 |
| AIAssistantTab(대형) 회귀 | Med | 근거 렌더 별도 컴포넌트, 모드 분기 최소 |
| Neo4j 데이터 없어 라이브 불가 | Med | 순수+모킹 테스트로 커버, MCP 합성 실증 |

## Acceptance (PRD-N §M4)
- [ ] 모든 결론에 추적 가능한 그래프 경로+출처(근거경로 제공률 측정 가능)
- [ ] 탐색이 구획·제약·bridge 가드레일 준수
- [ ] 모델에 근거 없는 내용 명시 분리
- [ ] 경로 클릭 → 캔버스 하이라이트
- [ ] `npm test`·lint·타입 그린, 회귀 0
