# Plan: PRD-N M3 — Grounder: 개념↔실데이터 접지

**Source PRD**: `docs/진행중/PRD-N.md` (§M3, v6 P2 승계)
**Selected Milestone**: M3 — Grounder (M2 완료 후)
**Complexity**: Large (순수 메트릭 + 헬스 UI 2곳 + 탐색기 배지 + CSV 재바인딩)
**앱 루트**: `ontology/ontology/ontology/` · 경로는 `src/` 기준

## Summary

모든 클래스에 대해 "실데이터가 뒷받침하는가"(바인딩률·채움률·신선도)를 결정론으로 측정·가시화하고, 미접지 개념의 데이터 연결을 유도한다. 실데이터 = 현 자산(`instances`/`instance_values` + CSV). 헬스 뱃지/대시보드에 바인딩률·신선도를 상시 노출(델타=라이브 재계산), 인스턴스 0개 클래스에 "미접지" 배지+진입점, CSV 재업로드는 안정식별자(UUIDv5)로 기존 인스턴스를 갱신(중복 방지)하고 diff를 보여준다.

## 핵심 설계 결정 (분석 근거)

1. **grounding.ts 별도 순수 모듈.** `computeHealth`(4축·점수)를 오염시키지 않고 `computeGrounding(model)`을 신설([health.ts](../../ontology/src/features/ontology/lib/metrics/health.ts) 패턴). 바인딩률은 점수 축이 아니라 **표시 축**(회귀 0). 인스턴스는 `classId`, 신선도는 `updatedAt`, 채움률은 `properties`+`instanceValues` 필요 → 전체 store 배열 입력.
2. **델타 = 라이브 재계산.** 명시적 전후 diff 컴포넌트는 없음([HealthScoreBadge.tsx:22-29](../../ontology/src/features/ontology/components/HealthScoreBadge.tsx#L22) `useMemo`가 store 변경마다 재계산). 바인딩률을 뱃지 툴팁+대시보드 MetricCard에 얹으면 입력 후 값이 즉시 변함 = "전후 델타".
3. **미접지 = raw count===0.** 기존 `isEmpty`(탐색기 L113·캔버스 L147)는 자식 클래스 없는 것만 → PRD "인스턴스 0개"보다 엄격. 배지는 raw `count===0`으로. 캔버스는 기존 `.empty` 점선 스타일이 이미 구분 → 신규 배지는 ExplorerPanel에 집중.
4. **CSV 재바인딩 = stableEntityId 매칭.** 현재 `mapParseResult`가 기존 이름 인스턴스를 **드롭**(갱신 안 함). CSV 모드에서 드롭 해제 → handleConfirm이 stable id 존재 시 `setInstanceValue`로 갱신(중복 방지), 부재 시 신규. 소실은 계량·표시만(HITL, 자동삭제 X).
5. **배지 규약**: h-6(24px)·text-xs·outline·상시 저채도([NodeKindToggle.tsx](../../ontology/src/features/ontology/components/NodeKindToggle.tsx) 패턴), `muted-foreground`/`warning-light` 토큰(PRD-K).

## Patterns to Mirror

| Category | Source | Pattern |
|---|---|---|
| 순수 메트릭 | `lib/metrics/health.ts:119` (`computeHealth`) | 프레임워크 무의존 순수 함수, 구조 부분집합 입력 |
| 안정식별자 | `lib/identity.ts:20` (`stableEntityId`) | UUIDv5(partition\|kind\|name) — 재바인딩 매칭 키 |
| 헬스 뱃지 | `components/HealthScoreBadge.tsx:22-43` | `useMemo`(store)+툴팁 축 표기 |
| MetricCard | `components/health/MetricCard.tsx` · `HealthDashboardSheet.tsx:155-204` | icon+label+value+tone+hint 그리드 |
| 배지 규약 | `components/NodeKindToggle.tsx:54-76` | h-6·text-xs·outline·상시 저채도 |
| 인스턴스 진입점 | `components/RightPanel.tsx:536-550` (`AddInstanceInline`) | selectNode→인스턴스 추가 |
| 테스트 | `lib/metrics/*.test.ts` (있으면), `confirm-triage.test.ts` | vitest·순수 단위 |

## Files to Change

| File | Action | Why |
|---|---|---|
| `src/features/ontology/lib/metrics/grounding.ts` | CREATE | 바인딩률·채움률·신선도·미접지 목록·재바인딩 diff(순수) |
| `src/features/ontology/lib/metrics/grounding.test.ts` | CREATE | 단위 테스트(TDD) |
| `src/features/ontology/components/HealthScoreBadge.tsx` | UPDATE | 툴팁에 바인딩률 축(라이브) |
| `src/features/ontology/components/HealthDashboardSheet.tsx` | UPDATE | 데이터 바인딩률·채움률·신선도 MetricCard(+경고) |
| `src/features/ontology/components/ExplorerPanel.tsx` | UPDATE | 인스턴스 0개 클래스에 "미접지" 배지→클릭 selectNode |
| `src/features/ontology/components/NewNodePopover.tsx` | UPDATE | CSV 모드 재바인딩(기존 갱신·diff 요약) |
| `src/features/ontology/lib/parse-mapping.ts` | UPDATE | CSV 재바인딩 시 기존 인스턴스 드롭 해제(옵션) |

## Tasks

### Task 1: grounding.ts 순수 메트릭 (TDD)
- **Action**: `computeGrounding(model)` → `{ bindingRate(=인스턴스≥1 클래스/전체), fillRate(=채운 값/가능 값), ungroundedClassIds, boundClasses, totalClasses, freshnessByPartition:[{partitionId,latestUpdatedAt,ageDays}], stalePartitionIds }`. `computeInstanceRebindDiff(existingInstances, existingValues, parsedInstances, classIdByName, propIdByClassName, partition, nowIso)` → `{ created, updated, missing }`(stable id 매칭). 신선도 임계 `STALE_DAYS=90`. `nowIso` 주입(순수·테스트 결정성).
- **Mirror**: `health.ts`·`identity.ts`
- **Validate**: `npm test -- grounding`

### Task 2: 헬스 뱃지 바인딩률
- **Action**: `HealthScoreBadge`가 `computeGrounding`도 `useMemo`로 계산, 툴팁에 `· 바인딩 {pct}%` 추가(store `properties`/`instanceValues` 구독 추가).
- **Mirror**: `HealthScoreBadge.tsx:22-43`
- **Validate**: `npm test`(뱃지 테스트 회귀 0), 타입

### Task 3: 대시보드 접지 축 + 신선도 경고
- **Action**: `HealthDashboardSheet`가 store 배열로 `computeGrounding` 계산(이미 store 구독), MetricCard "데이터 바인딩률"·"속성 채움률"·"데이터 신선도"(가장 오래된 구획 ageDays, stale면 warning tone) 추가.
- **Mirror**: `HealthDashboardSheet.tsx:155-204`, `MetricCard`
- **Validate**: 타입·수동

### Task 4: 미접지 배지 + 진입점
- **Action**: `ExplorerPanel` 클래스 행에서 `instanceCount===0`이면 "미접지" outline 배지(저채도). 클릭 시 `selectNode(classId,'class')`(RightPanel 인스턴스 추가 노출)+toast 안내. `stopPropagation`.
- **Mirror**: `ExplorerPanel.tsx:173-183`, `NodeKindToggle` 배지, `RightPanel` AddInstanceInline
- **Validate**: `npm test`(Explorer 테스트 회귀 0), 수동

### Task 5: CSV 재바인딩 diff (HITL)
- **Action**: CSV 모드에서 `mapParseResult`에 `existingInstanceNames` 대신 빈 셋 전달(드롭 해제). handleConfirm CSV 경로: 인스턴스별 stable id 존재 시 `setInstanceValue` 갱신(신규 addInstance 안 함), 부재 시 신규. CSV 프리뷰에 `computeInstanceRebindDiff` 요약(신규 N·갱신 M·소실 K) 표시. 소실은 표시만.
- **Mirror**: `NewNodePopover.tsx:1234-1261` 인스턴스 루프, `parse-mapping.ts:139`
- **Validate**: `npm test`, 수동: 같은 CSV 재업로드 → 중복 0·갱신 diff

### Task 6: 통합 검증
- **Action**: 빌드(불가 시 tsc)·lint·전체 테스트 그린 + MCP로 현 인스턴스/채움 상태 확인(바인딩률 계량 실측).
- **Validate**: 아래

## Validation
```bash
cd ontology/ontology/ontology
npm test && npm run lint && npx tsc --noEmit
```
수동/MCP: Supabase에서 클래스별 인스턴스·instance_values 집계 → 바인딩률·채움률 실측 대조.

## Risks
| Risk | Likelihood | Mitigation |
|---|---|---|
| computeHealth 점수 회귀 | Low | grounding 별도 모듈, 점수 미변경(표시 축만) |
| CSV 재바인딩이 텍스트 파스 회귀 유발 | Med | 재바인딩 분기를 CSV 모드로 한정, 기존 드롭 로직 텍스트 경로 보존 |
| 신선도가 값 갱신을 못 잡음(updatedAt 미스탬프) | Med | 신선도는 instances.updatedAt 기준으로 명시(값 편집은 별도 한계로 문서화) |
| NewNodePopover(대형) 재통합 회귀 | Med | diff/재바인딩 로직 순수 함수로 분리, 최소 diff |

## Acceptance (PRD-N §M3)
- [ ] 모델 헬스에 데이터 바인딩률 상시 표시 + 입력 전후 델타(라이브)
- [ ] 인스턴스 0개 클래스 시각 구분 + 데이터 연결 진입점
- [ ] CSV 재업로드가 중복 생성 없이 diff로 흡수(HITL)
- [ ] 신선도 임계 초과 구획 경고
- [ ] `npm test`·lint·타입 그린, 회귀 0
