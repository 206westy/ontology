# Plan: PRD-N M5 — Steward 잔여: 계보·버전 정책

**Source PRD**: `docs/진행중/PRD-N.md` (§M5, v6 P4 잔여)
**Selected Milestone**: M5 — Steward 잔여 (후순위, M1~M4 후)
**Complexity**: Medium (얇은 잔여 — 계보 뷰 확장 + 발행 버전 태그)
**앱 루트**: `ontology/ontology/ontology/` · 경로는 `src/` 기준

## Summary

v6 P4 대부분은 기구현(드리프트 PRD-H·커밋/브랜치 PRD-J·거버넌스 PRD-E·어휘집 PRD-L). 잔여 2개만: (1) 임의 노드의 "어디서 왔나"(커밋 체인+provenance+패턴 출처)를 근거(Evidence) 탭에서 한 화면 추적, (2) 발행 스냅샷에 시맨틱 버전 태그 + 구획별 변경 요약.

## 핵심 설계 결정 (분석 근거)

1. **계보 = commit_details 조회 + 기존 Evidence 탭 확장.** 노드 이력은 `commit_details.target_id = nodeId`([schema.ts:425](../../ontology/src/lib/drizzle/schema.ts#L425))를 커밋과 조인해 얻는다. provenance는 EvidencePanel이 이미 표시([EvidencePanel.tsx:104](../../ontology/src/features/ontology/components/EvidencePanel.tsx#L104)) — 계보 섹션만 추가.
2. **버전 태그 = 발행 시점 부여.** push 라우트가 커밋을 pushed 로 마킹하는 지점([push/route.ts:453](../../ontology/src/app/api/neo4j/push/route.ts#L453))에서 버전 태그·구획별 요약을 함께 set. 신규 컬럼 `commits.version_tag`·`change_summary`(마이그레이션).
3. **결정론.** 버전 태그는 기발행 커밋 수 기반 단조(같은 발행 배치는 동일 태그). 구획 요약은 detail 스냅샷의 partitionId로 집계. LLM 불필요.
4. **순수 분리.** `summarizeLineage`·`computePublishVersion`·`summarizeChangesByPartition`을 순수 함수로(테스트).

## Files to Change

| File | Action | Why |
|---|---|---|
| `src/features/ontology/lib/lineage/lineage.ts` | CREATE | 계보 요약·버전 태그·구획 변경요약(순수) |
| `src/features/ontology/lib/lineage/lineage.test.ts` | CREATE | 단위 테스트(TDD) |
| `src/app/api/commits/lineage/route.ts` | CREATE | 노드별 커밋 이력 조회 |
| `src/features/ontology/api.ts` | UPDATE | `commitsApi.lineage` |
| `src/features/ontology/components/EvidencePanel.tsx` | UPDATE | 계보 섹션(생성·변경·발행·패턴 출처) |
| `src/features/ontology/components/RightPanel.tsx` | UPDATE | 선택 노드 계보 fetch → EvidencePanel |
| `supabase/migrations/*_commit_version_tag.sql` | CREATE | `commits.version_tag`·`change_summary` |
| `src/lib/drizzle/schema.ts` | UPDATE | commits 컬럼 추가 |
| `src/app/api/neo4j/push/route.ts` | UPDATE | 발행 시 버전 태그·구획 요약 set |

## Tasks

### Task 1: lineage.ts 순수 (TDD)
- **Action**: `summarizeLineage(events)` → `{ createdAt, createdBy, lastChangedAt, changeCount, publishedAt }`(ADD=생성, MOD 수, pushedAt). `computePublishVersion(priorPushedCount)` → `v1.{priorPushedCount+1}` 단조 태그. `summarizeChangesByPartition(details)` → `{ byPartition:[{partitionId,added,modified,deleted}], totals }`(class detail의 partitionId 집계).
- **Validate**: `npm test -- lineage`

### Task 2: 마이그레이션 + 스키마
- **Action**: `commits.version_tag text`·`change_summary jsonb`(nullable) 마이그레이션(MCP apply_migration) + drizzle schema 반영.
- **Validate**: MCP list_tables 확인

### Task 3: 계보 라우트 + 클라이언트
- **Action**: `GET /api/commits/lineage?targetId=` — commit_details(targetId) ⨝ commits, createdAt 오름차순 → `{ operation, message, createdAt, authorEmail, pushedAt, versionTag }[]`. `commitsApi.lineage`.
- **Mirror**: `commits/route.ts`, `api.ts` commitsApi
- **Validate**: `npm test`, 타입

### Task 4: Evidence 탭 계보 섹션
- **Action**: EvidencePanel에 `lineage?` prop + "계보(어디서 왔나)" 섹션: 생성(첫 ADD+작성자+일시)·변경 N회·발행(버전 태그·일시)·패턴 출처(sourceType='pattern' 등). RightPanel이 선택 노드 계보 fetch(react-query) → 전달.
- **Mirror**: `EvidencePanel.tsx:104-120`, RightPanel EvidencePanel 호출(1461)
- **Validate**: `npm test`(Evidence 회귀 0)

### Task 5: 발행 버전 태그
- **Action**: push 라우트가 `priorPushedCount`(count pushedToNeo4j=true) 조회 → `computePublishVersion` + `summarizeChangesByPartition(effectiveDetails)` → commits update(453)에 `versionTag`·`changeSummary` set. dryRun 제외.
- **Mirror**: `push/route.ts:449-464`
- **Validate**: `npm test`, MCP로 발행 후 version_tag 확인

### Task 6: 검증
- **Action**: 빌드(불가 시 tsc)·lint·전체 테스트 그린 + MCP 대조.
- **Validate**: `npm test && npm run lint && npx tsc --noEmit`

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| 마이그레이션이 발행 회귀 유발 | Low | nullable 컬럼(기존 행 무영향), push set은 부가 |
| 계보 fetch가 노드 선택마다 왕복 | Low | react-query 캐시, 선택 시에만 |
| 버전 스킴 단순함 | Low | 단조·결정론(발행 구분 목적 충족), 후속 정교화 여지 |

## Acceptance (PRD-N §M5)
- [ ] 임의 노드에서 생성 이력(커밋·출처·패턴)을 한 화면에서 추적
- [ ] 발행 이력이 버전 태그로 구분되고 구획별 변경 요약을 가진다
- [ ] `npm test`·lint·타입 그린, 회귀 0
