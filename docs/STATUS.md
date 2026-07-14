# 구현 현황 (Implementation Status)

> 2026-06-26 PRD(MVP~v6) 전수 대조 결과. 문서는 상태별 폴더로 정리됨.
> 대조 방법: 코드(`ontology/src`)·마이그레이션(`supabase/migrations`)·테스트 직접 확인 + Supabase MCP 검증.

## 폴더 구조

```
docs/
├── 완료/        # 구현·검증 완료된 기획
├── 진행중/      # 일부 구현됐고 남은 작업이 있는 기획
├── 진행전/      # 아직 착수 안 한 기획
└── *.md         # 상태 무관 참고 문서(아이디어, 스키마, 벤치마크 등)
```

## ✅ 완료 (`완료/`)

| 문서 | 범위 | 비고 |
|------|------|------|
| PRD-MVP.md | MVP 전체 | 19/19 — 캔버스·탐색기·패널·LLM 구조화·프리뷰·드래그·커밋·Undo |
| PRD-v2.md | Neo4j 푸시/롤백·UX | ~95% (MiniMap만 미확인) |
| v3/ | 제약·검증·AI탭·대량파싱·RDF 임포트/익스포트 | 핵심 완료. 디자인토큰/의존성버전 폴리시 일부 미확인 |
| v4/ | 자동저장·리사이저·컨텍스트메뉴·필터·상속·템플릿·브랜딩 | 코드 23/23. partial은 대부분 테스트 픽스처 이슈 |
| v5-prd-A.md | parse 재설계 + 보강 | 2단계 추출·갭탐지·enrich·provenance |
| v5-prd-D.md | relation_types.category | 원격 Supabase 적용 확인(NOT NULL DEFAULT 'descriptive') |
| v5-prd-E.md | 자연어 추가 + 중복대조 | P1 9/9, P2 10/11 (임베딩·dedup·resolve·거버넌스) |
| v5-prd-design.md | v5 디자인 | — |
| IDEA.md | 초기 기획/기능 분석 | 제품으로 실현됨 |
| embedding-policy.md | 임베딩 정책(PRD-E P2) | 구현됨 — 코드가 따르는 살아있는 스펙 |
| neo4j-schema.md | Neo4j 스키마 계약(PRD-E P1) | 구현됨 — 코드가 따르는 살아있는 스펙 |
| v2-implementation-plan.md | v2 구현 계획 | v2 출시 완료 |
| v2-vision-proposals.md | v2 비전 제안 | v2에 반영됨 |
| graph-ux-rebrand.md | 그래프 UX 리브랜딩 + CSV 분석 격상 | M1~M5 완료·라이브 검증 (시각 언어/인스턴스 점·접힘/친절 패널/AI 계층 정렬/CSV LLM 분석) |
| PRD-F.md | 재현 가능 생성·입력 완전성·Critic 적중률 | P1~P4 전부 구현·검증(436테스트·빌드 통과). P1 안정식별자(UUIDv5 노드+엣지)·AI SDK 캐싱, P2 청킹+전역 병합(8000자 상한 제거), P3 category 채점·혼동행렬·calibration·nightly eval 게이트, P4 categoryConfidence(`_catconf`+`edges.category_confidence` 라이브 적용)·web 주장 검증. 후속(운영): 골든 실라벨링(owner)·nightly OPENAI_API_KEY 시크릿 |
| system-audit-remediation.md | 전수 감사 결함 수정 | 2026-07-01 C1~3·H1~6·M1·2·4·5·6·7·8 처리·테스트·프로덕션 빌드 통과. M6=신뢰(confidence) 표시 삭제. M3(청킹)=PRD-F Phase2 이관, M9(Redis)=불필요 → 사용자 결정으로 제외. 감사 항목 전부 클로즈 |
| PRD-H.md | 패턴-시드 스키마-적응형 온톨로지(H1~H9) | **M1~M5 전량 구현·검증(2026-07-02)**. 학습형 패턴 캐시(비어서 시작·수렴)+발견 파이프라인 retrieve(LOV)›adapt›synthesize·출처/라이선스·패턴-시드 생성(역할 타이핑·인과 계층·진행형 애니메이션 삽입)·게이트 마운트(EmptyState "패턴으로 시작")·맥락 주입 용어 해소(`term_glossary`)·드리프트 3분기·크로스-구획 브릿지·연결성/CQ 검증·발행 라이선스 경고·HITL 리뷰 시퀀스. 마이그레이션 2종(`patterns`·`term_glossary`) 라이브. PRD-H 143테스트+전체 빌드 그린. 진행추적 `완료/PRD-H-progress.md`, 플랜 `.claude/plans/prd-h.plan.md`. **런타임 종단 완결(2026-07-02)**: 용어 재주입(`buildGlossaryInjectionBlock`→`existingSchema`)·드리프트 라이브 피드(`collectDriftElements`→`driftApi.judge`→DriftDecisionCard, 확장=승격/분기=발견 재호출) 배선 완료. 빌드 그린 |
| PRD-L.md | 팔란티어 3레이어 정리 & 확신-초안 확정 (L-1.2) | **M1~M6 전량 구현 + 핵심 여정 라이브 검증 완료(2026-07-08 → 완료 이동).** 라이브 검증: 텍스트→파싱→미리보기에서 트리아지 밴드(자동 반영 7·검토 필요 4+사유 배지)·지식/행동 레이어 배지·NodeKindToggle 원탭 전환·자동 반영 접힘 그룹·확정 문구 전부 실화면 확인, 확정→배치 저장→**어휘집 성장 실증**. 검증 중 커버리지 갭 발견·수정(9749fb0): 유형 재사용 시 어휘집 미성장 → recordRelationUsage(엣지 생성=재등장) 5초크포인트(edges/bridges/batch/import/merge) 배선, 라이브 재실증(점검함 재사용 2건→occurrence 2·임베딩 생성). 709테스트. 미결(백로그): Dynamic 레이어 UI 노출 여부. 커밋 b8e42b1/c8afba1/a93c6c2/d4669d3/9131f3e/ac035cd, 마이그레이션 4종 라이브. M1=공리+제약→constraints.kind(enforced/memo) 단일 규칙(axioms DROP, useRules, 강제됨/설명 메모 배지). M2=category(5)→layer(semantic지식/kinetic행동), categoryConfidence 완전 삭제, Stage2 프롬프트 ~1450자→330자(-77%), 정체성(stableEdgeId·dedup키)에서 분류 제외. M3=add_relation 단일 액션(유형 자동생성+엣지, TBox/ABox 보존), ConstraintsPanel '관계' 라벨. M4=NodeKindToggle 공통 어포던스(평문 질문+원탭 전환, 3곳 문구 수렴 소스 테스트 고정), Stage1 확신 커밋 1줄. M5=confirm-triage(<0.7/Critic/미해소→review), 자동반영 접힘+검토필요 사유배지 표면화, 반영 모델 불변, L5 속성규칙 2블록→1(-190자). M6=relation_glossary(사후 정합 전용·재주입 금지 소스 게이트, 초크포인트 4곳: api/batch/import/merge, 재등장=occurrence_count+1·원본 보존, similar_to 후보 링크만)+GET API. **라이브 누적 실증 완료**(3라운드: 새이름→행증가, 재등장→1행 카운트2, layer 보존). 테스트 657→706(+49), 각 마일스톤 lint·빌드 그린. |

| PRD-M.md | Docker Neo4j 복귀 + 발행 파이프라인 고속화 | **M0~M4 당일 구현·라이브 검증 완료(2026-07-08).** M0=Docker `neo4j-onto`(5.26) 재기동+unless-stopped+스키마 부트스트랩+MCP 무수정 재연결 검증, Desktop 폐기. M1=생애주기 압축(`compressDetails`: ADD…DEL 상쇄·MOD 병합), M2=UNWIND 배칭(`cypher-batch.ts`, 템플릿 우선순위·상한 1000행)+_SyncState 1문장, M3=임베딩 드리프트 보정(미보유 노드→Supabase 벡터 동기화), M4=배칭 프리뷰 요약. 압축 가드: 기발행 커밋 섞이면 압축 생략. **라이브 실증: detail 194건→UNWIND 5구문**, 발행 성공·상쇄 정확. 724테스트(+15)·lint·빌드 그린. 잔여 관찰: 발행 지연의 대부분은 Supabase 읽기 왕복(회사망) — 별도 주제 |
| PRD-PF-Modify/ (A~I) | 스튜디오→Foundry/AIP 문제해결 플랫폼 (A~I) | **A~I 전량 구현·라이브 E2E 검증 완료(2026-07-14 → 완료 이동).** 멀티온톨로지 테넌시(A)·결정함수 엔진(B)·문제 워크플로우 셸(C)·데이터셋 레지스트리(D)·전단계 AI 코파일럿(E)·SPC/FDC 통계엔진(F, JS 인프로세스·역할경계 가드레일)·액션보드/대시보드(G, ECharts·완전자동금지 CHECK·HITL)·AIP 답변엔진(H, 구획요약·전역 map-reduce·제안에이전트, M2 rag/answer 재사용)·자동화·상태 라이프사이클(I, 트리거·상태머신·자율확정금지). 마이그레이션 14종 라이브·**vitest 965pass/1skip/0fail(133파일)**·보안 신규13테이블 RLS완비. **라이브 검증(admin E2E)**: 25개 API 전부 200/201·5xx 0·콘솔에러 0·전 UI 표면 로드·인터랙션(F토글·G 대시보드/위젯 생성·렌더·액션보드) 정상. **성능**: 라우트당 Auth 원격왕복 제거(getSession 로컬화)+멤버십 30s 캐시로 API ~1050→~600ms. 플랜 `.claude/plans/{prd-pf-a-b,prd-pf-c-d-e,prd-pf-f-g-h-i}`, 메모리 `prdpf-{a-b,c-d-e,f-g-h-i}-implementation`. 잔여(비차단): 스케줄러/폴링 워커(pg_cron/외부)·커밋훅 dirty 자동마킹(mark-stale API)·2브라우저 UX. |
| PRD-N.md | 구획 지능 & 접지·운영추론 (M1~M5) | **M1~M5 전량 구현·검증 완료(2026-07-13).** 플랜 `.claude/plans/prd-n-m{1,2,3,4,5}.plan.md`. **M1** AI 자동 구획 제안(결정론 판정+LLM 명명 only·attach 무소음·bridge·지연 구획 생성·템플릿 시딩 귀속). **M2** 추론 격리(`lib/neo4j/scope.ts`·Text2Cypher `$partition` 서버 바인딩·교차 오염률·전체질의 opt-in·RAG over-fetch 필터·Text2CypherTab 배지/출처/전환 리셋). **M3** Grounder(`lib/metrics/grounding.ts` 바인딩률·채움률·신선도·CSV 재바인딩 diff + 헬스 뱃지/대시보드 접지 축 + ExplorerPanel 미접지 배지 + CSV stable-id 갱신). **M4** Operator(`lib/rag/traverse.ts` 스코프 탐색·가드레일 `ALL(n.partition=$p)` + `rag/answer` 진단형 RAG·근거경로·출처·근거없음 분리 + AIAssistantTab 근거 모드·경로 클릭 하이라이트). **M5** Steward 잔여(`lib/lineage/lineage.ts` 계보 요약·버전 태그·구획 변경요약 + Evidence 탭 계보 섹션 + `commits.version_tag/change_summary` 마이그레이션 + push 발행 버전 태그). **806테스트·타입·lint 그린, 회귀 0.** **MCP 라이브 실증**: M2 :Concept 스코프 격리·M3 바인딩률 0.333/채움률 0 메트릭 일치·M4 스코프 탐색 브릿지 이탈 차단·M5 마이그레이션 컬럼+계보 쿼리. **후속: `npm run build`(dev 서버 구동 중 미실행, tsc 대체)·앱 라이브 UX 검증**(Neo4j 반영본 데이터 필요) |
| PRD-BM-D01.md | 패턴 마켓플레이스 — 학습 캐시→성장 플라이휠 (매일 벤치마킹 Day 01) | **M0~M2 전량 구현·검증(2026-07-13, `PRD-BM-D01.plan.md`/`.completion.md` 동봉).** 기존 `patterns` 자산의 첫 소비자(그전엔 `usePatterns()` 미소비) — 신규 지능 없이 결정적 변환기+계측+카탈로그 UI+발행 게이트만 신설(§0 재배치+통합). **M0** `pattern_events` 계측+TTFG 코호트(라이브 실증 pattern 60s vs free 180s)·EmptyState 로컬 캐시 시드 선반·결정적 시딩(roles→classes, relationTypes→relation_types+edges, HITL 프리뷰)·occurrence_count. **M1** 전용 `/marketplace` 갤러리(에디토리얼 히어로·필터·신뢰신호 카드·상세 시트)·visibility(private/org/public)·health·카탈로그 필터/정렬 API(하위호환 `?domain=` 히트 유지)·"맞춤 생성"=기존 discover adapt 파이프라인 재사용. **M2** 발행 게이트(라이선스 동의·민감식별자 마스킹 재사용·health 산정)·PublishPatternCard·큐레이션 dim(순수 랭킹). **3리뷰(security/react/typescript) 병렬 실행·전량 반영**: traversalTemplates 마스킹 누락(CRIT)·카탈로그 private 기본 노출(CRIT)·동시 시딩 중복 구획(HIGH)·헤딩 스킵(HIGH)·이벤트 게이밍/DoS·`cache.test` 컴파일 오류(HIGH)·`/api/import` layer 소실 등 수정. **870테스트·타입·lint·`next build`(exit0, /marketplace 컴파일) 그린, 회귀 0**, 마이그레이션 2종 라이브. HTTP 스모크(/marketplace 307·catalog 401·/login 200). **후속: 시각 UX E2E는 로그인 인증벽+무자격증명으로 헤드리스 불가 → 자격증명 후 실행** |

추가 (이번 세션, 별도 메모리): 노드 기준 AI 확장 진입점, RLS 보안 락다운(14테이블 deny-all).

### 구현 완료 기준 이동 (2026-07-08)

> 아래 5건은 **구현·테스트·빌드 완료**를 기준으로 진행중→완료 이동(사용자 결정). 각 항목의 **라이브 검증**(UX 체감/2-브라우저 등)은 후속 확인 항목으로 남음.

| 문서 | 범위 | 비고 |
|------|------|------|
| PRD-I.md | 코드베이스 통합 & 디자인 통일(UX) | **M1~M5 구현 완료·단위/빌드 검증(2026-07-02).** 플랜 `.claude/plans/prd-i.plan.md`. M1=§3 공통 `<ConfirmCard>`+배지 taxonomy+역할토큰(`--role-*`), 카드 10종 리스킨. M2=Guided 여정 상시화(EmptyState→`GuidedJourney` 추출, page.tsx 상시 마운트, Toolbar "가이드", JourneyStepper). M3=팝오버 결정(dedup/거버넌스/보강/critic) 여정 스텝 이관(`buildHitlPlan` 확장·`PatternReviewSequence` 스텝화) + Quick 회귀0 + 대량입력 "가이드로 전환". M4=CommitBar 초안→확정→발행 지표+CQ/연결 칩(위치·액션 유지). M5=RightPanel 근거(Evidence) 탭 additive. 622테스트+프로덕션 빌드 그린. **유보**: dedup reuse/중복가능은 여정에서 확인만(생성후 병합 안전액션 부재)·relate만 적용. **보류(플랜대로)**: F8 캔버스 구획레인·스트리밍LLM·RightPanel 강제4탭·confidence 원시값. **후속**: 라이브 UX 검증 |
| PRD-J.md | 온톨로지 GitFlow(브랜치 협업) | **M1~M3 + M4 핵심 구현 완료(2026-07-06).** M1=branches/commits(author·branch·parent·seq) 마이그레이션 3종 라이브+author 주입+히스토리 표시. M2=브랜치 생성(베이스 스냅샷)/체크아웃(재생 엔진 `branch-replay.ts`)/격리(useApiSync·useLoadOntology·useAutoSave 게이팅, EmptyState 템플릿 가드)/BranchSwitcher. M3=3-way diff(`merge-diff.ts` 순변화 접기+충돌 판정)+MR API 3종+MergeRequestSheet(mine/theirs 해소)+병합 트랜잭션(main 적용+병합 커밋). M4 핵심=push 라우트 main 전용 가드+unpushed 필터. 655테스트+빌드+lint 그린. **잔여(옵션)**: main 직접편집 보호 옵션(기본 off 예정)·병합 후 자동 push 옵션. **후속**: 2-브라우저 라이브 검증 |
| PRD-K.md | 핵심 여정 UI 친화화 | **M1~M5 전량 구현 완료(2026-07-07).** M1=스케일 업(대상 5표면 9/10px 폐지·캡션 11px↑ 본문 12px↑·타깃 24px·폼 32px·hover 전용→상시 저채도, 수용 grep 0건). M2=더블클릭 기본 탭 text·탭 순서 텍스트 우선·짧은 입력 Quick 힌트·파일/붙여넣기 구현·가짜 진행률 제거(실단계 안내+경과초, 길이 무관). M3=항목별 체크박스 부분 반영+sticky 요약 헤더+검토 표면 자동 승격(클래스>3·관계>5 시 중앙 1040px)+이탈 가드+확정 피드백 3종(토스트 일괄 되돌리기 zundo·highlightNodes 펄스·CommitBar 카운트 애니)+부가 검수 4스텝화+미니 스테퍼(입력→분석→검토→확정). M4=탭 6개 고정(미선택 dim+빈상태·탭 상태 공유)·useSavedFlash 필드 체크 1.5초+헤더 '초안에 저장됨 ✓'·인스턴스 테이블 실값·관계 팝오버 트리거 앵커. M5=상태 평문 상시(status-sentence)·자동저장 On 저장 상태 버튼·반영→발행 통일+발행 사전 요약·툴바 4그룹+품질 드롭다운·전체 취소(확인) 역할 분리. 커밋 1c927ce/f3e706c/389031b/b097c64/4847f0b, 각 마일스톤 86파일 655테스트·lint·빌드 그린. **후속**: 라이브 UX 검증 |
| PRD-perf-remediation.md | 클라이언트 성능 종합 개선 | **M0~M3 구현 완료(2026-07-07).** 3관점 감사(perf/react/db) 종합, 비즈니스 로직 불변. M0=embedding 응답 100% 제외·refetchOnWindowFocus off·커밋 최근50+스냅샷 name-only. M1=TreeItem 행별 구독+memo·드래그 위치 zundo 제외+재빌드 스킵·배지 useDeferredValue·검색 150ms 디바운스·syncCytoscape keep-diff·height 애니메이션 제거. M2=GraphCanvas dynamic(cytoscape+레이아웃 체인 분리)·SplashScreen motion→CSS·optimizePackageImports·@tiptap 제거 — **/ First Load JS 670→451kB(-33%)**. M3=재임베딩 IS DISTINCT FROM 가드(동일 텍스트 재저장 시 OpenAI 호출 0회). **추가(사용자 컨펌, 2026-07-07)**: LazyMotion 전환(m.* + domAnimation 지연 로드, 451→429kB) + M3-3 인스턴스 지연 로드(스키마 우선 2단계, mergeInstancesData 리셋 없는 병합·로컬 보존·undo 스냅샷 미기록, 계약 테스트 3건). 658테스트·lint·빌드 그린. **보류(사용자 결정)**: M4 RSC 부분 도입. **후속**: 라이브 체감 검증 |
| perf-roundtrip-notes.md | DB 왕복 성능 최적화(핸드오프 노트) | 측정·분석 완료. 최적화 구현은 **PRD-perf-remediation로 상위 통합·완료** → 노트도 완료 이동 |

### 승계 종료 이동 (2026-07-08)

> 아래 2건은 2026-07-08 코드베이스 전수 대조로 **구현된 부분은 확인, 미개발 잔여는 `진행전/PRD-N.md`로 선별 승계**하고 원 문서는 완료(역사 문서) 처리. 승계·폐기 판정 근거는 PRD-N §0 대장 참고.

| 문서 | 범위 | 비고 |
|------|------|------|
| v5-prd-B.md | 구획(Named Graph) | B-1(데이터모델)·B-3(전환 UI) 구현 확인. B-2(랜딩+라우팅)·B-4(EmptyState 정리)는 PRD-H/I/K가 전제를 대체해 **폐기**(템플릿→새 구획 시딩만 PRD-N M1에 흡수). B-5(AI 자동 구획)→PRD-N M1, B-6(추론 격리)→PRD-N M2 승계 |
| v6-roadmap.md | AI 역할 사다리(Critic 척추) | P1 Critic **사실상 완료** — critic 엔진 8종 룰+confirm 트리아지(PRD-L)+HealthScoreBadge 상시(Toolbar)+재사용 강제(용어해소·relation_glossary·dedup)+calibration/골든셋(PRD-F)이 Phase 1 완료 정의 4항목 전부 흡수. P2 Grounder→PRD-N M3, P3 Operator→PRD-N M4, P4 Steward 잔여(계보·버전 정책)→PRD-N M5 승계 |

## 🟡 진행중 (`진행중/`)

| 문서 | 상태 | 남은 일 |
|------|------|---------|
| _(없음)_ | 진행중 항목 없음 | PRD-PF-Modify (A~I) 는 라이브 E2E 검증 완료로 `완료/` 이동(2026-07-14) — 위 ✅ 완료 섹션 참조 |

## 🔴 진행전 (`진행전/`)

| 문서 | 범위 | 비고 |
|------|------|------|
| (없음 — PRD-N 진행중 이동) | — | — |

## ⚠️ 테스트 부채 (기능 결함 아님)

e2e 픽스처(`ontology/e2e/fixtures/ontology-app.ts`)가 옛 React Flow 셀렉터(`.react-flow`, `aside`) 기준이라 현 Cytoscape UI와 불일치 → 다수 실패. ExplorerPanel 루트는 `<div>`, RightPanel만 `<aside>`. 픽스처를 Cytoscape에 맞게 갱신 필요.
