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

추가 (이번 세션, 별도 메모리): 노드 기준 AI 확장 진입점, RLS 보안 락다운(14테이블 deny-all).

## 🟡 진행중 (`진행중/`)

| 문서 | 상태 | 남은 일 |
|------|------|---------|
| v5-prd-B.md | 구획(Named Graph) | 테이블·FK·Neo4j 브리지·PartitionSwitcher 구현됨. 랜딩/라우팅 일부 미확정, AI 자동 구획 제안(B-5) 미구현 |
| v6-roadmap.md | AI 역할 전환(Critic 척추) | Phase1 Critic 일부 시작(`/api/critic/review`+`lib/critic/*`). Phase2~4 미착수 → 아래 |
| perf-roundtrip-notes.md | DB 왕복 성능 최적화 | 측정·분석 완료, 최적화 구현은 재개 대기(handoff 노트) — PRD-perf-remediation 이 상위 통합 |
| PRD-perf-remediation.md | 클라이언트 성능 종합 개선 | **M0~M3 구현 완료(2026-07-07), 라이브 체감 검증 대기.** 3관점 감사(perf/react/db) 종합, 비즈니스 로직 불변. M0=embedding 응답 100% 제외·refetchOnWindowFocus off·커밋 최근50+스냅샷 name-only. M1=TreeItem 행별 구독+memo·드래그 위치 zundo 제외+재빌드 스킵·배지 useDeferredValue·검색 150ms 디바운스·syncCytoscape keep-diff·height 애니메이션 제거. M2=GraphCanvas dynamic(cytoscape+레이아웃 체인 분리)·SplashScreen motion→CSS·optimizePackageImports·@tiptap 제거 — **/ First Load JS 670→451kB(-33%)**. M3=재임베딩 IS DISTINCT FROM 가드(동일 텍스트 재저장 시 OpenAI 호출 0회). **추가 완료(사용자 컨펌, 2026-07-07)**: LazyMotion 전환(m.* + domAnimation 지연 로드, 451→429kB) + M3-3 인스턴스 지연 로드(스키마 우선 2단계, mergeInstancesData 리셋 없는 병합·로컬 보존·undo 스냅샷 미기록, 계약 테스트 3건). **잔여**: M4 RSC 부분 도입(사용자 결정으로 보류 유지)·라이브 체감 검증. 658테스트·lint·빌드 그린 |
| PRD-J.md | 온톨로지 GitFlow(브랜치 협업) | **M1~M3 + M4 핵심 구현 완료(2026-07-06), 라이브 2-브라우저 검증 대기.** M1=branches/commits(author·branch·parent·seq) 마이그레이션 3종 라이브+author 주입+히스토리 표시. M2=브랜치 생성(베이스 스냅샷)/체크아웃(재생 엔진 `branch-replay.ts`)/격리(useApiSync·useLoadOntology·useAutoSave 게이팅, EmptyState 템플릿 가드)/BranchSwitcher. M3=3-way diff(`merge-diff.ts` 순변화 접기+충돌 판정)+MR API 3종+MergeRequestSheet(mine/theirs 해소)+병합 트랜잭션(main 적용+병합 커밋). M4 핵심=push 라우트 main 전용 가드+unpushed 필터. 655테스트+빌드+lint 그린. **잔여**: main 직접편집 보호 옵션(기본 off 예정)·병합 후 자동 push 옵션·2-브라우저 라이브 검증 |
| PRD-K.md | 핵심 여정 UI 친화화 (2026-07-06) | **M1~M5 전량 구현 완료(2026-07-07), 라이브 UX 검증 대기.** M1=스케일 업(대상 5표면 9/10px 폐지·캡션 11px↑ 본문 12px↑·타깃 24px·폼 32px·hover 전용→상시 저채도, 수용 grep 0건). M2=더블클릭 기본 탭 text·탭 순서 텍스트 우선·짧은 입력 Quick 힌트·파일/붙여넣기 구현·가짜 진행률 제거(실단계 안내+경과초, 길이 무관). M3=항목별 체크박스 부분 반영+sticky 요약 헤더+검토 표면 자동 승격(클래스>3·관계>5 시 중앙 1040px)+이탈 가드+확정 피드백 3종(토스트 일괄 되돌리기 zundo·highlightNodes 펄스·CommitBar 카운트 애니)+부가 검수 4스텝화+미니 스테퍼(입력→분석→검토→확정). M4=탭 6개 고정(미선택 dim+빈상태·탭 상태 공유)·useSavedFlash 필드 체크 1.5초+헤더 '초안에 저장됨 ✓'·인스턴스 테이블 실값·관계 팝오버 트리거 앵커. M5=상태 평문 상시(status-sentence)·자동저장 On 저장 상태 버튼·반영→발행 통일+발행 사전 요약·툴바 4그룹+품질 드롭다운·전체 취소(확인) 역할 분리. 커밋 1c927ce/f3e706c/389031b/b097c64/4847f0b, 각 마일스톤 86파일 655테스트·lint·빌드 그린 |
| PRD-L.md | 팔란티어 3레이어 정리 & 확신-초안 확정 (L-1.2) | **2026-07-07 개발 착수.** 팔란티어 3레이어(Semantic 지식·Kinetic 행동·Dynamic 자동화) 도입 + 관계 우선 원칙(관계 다양성이 클래스/인스턴스 판돈을 낮춤). 그린필드(테스트 데이터 폐기→drop&recreate). M1=L1 공리+제약→Dynamic 단일 "규칙"(자유서술=설명 메모 흡수, 강제/메모 평문 표기) / M2=L2 관계 5분류→Semantic·Kinetic 2레이어(`category`→`layer` 정본, 정체성 제외, diagnostic·procedural 구분 프롬프트 삭제, 관계어휘 입력주입 grep 0건 게이트) / M3=L3 관계유형+관계 단일 액션(TBox/ABox 보존) / M4=L4 클래스·인스턴스 확신-초안+원탭(창발 모델 검토·폐기 기록) / M5=L6 신뢰도 트리아지+L5 속성 / M6=L7 관계 어휘집 사후 정합·성장 루프(재주입 금지). 확정 8건 로그. term_glossary 검증=안전(도메인-스코프·약어 뜻풀이·패턴 여정 한정) |
| PRD-I.md | 코드베이스 통합 & 디자인 통일(UX) | **M1~M5 구현 완료·단위/빌드 검증(2026-07-02), 라이브 UX 검증 대기.** 플랜 `.claude/plans/prd-i.plan.md`. M1=§3 공통 `<ConfirmCard>`+배지 taxonomy+역할토큰(`--role-*`), 카드 10종 리스킨. M2=Guided 여정 상시화(EmptyState→`GuidedJourney` 추출, page.tsx 상시 마운트, Toolbar "가이드", JourneyStepper). M3=팝오버 결정(dedup/거버넌스/보강/critic) 여정 스텝 이관(`buildHitlPlan` 확장·`PatternReviewSequence` 스텝화) + Quick 회귀0 + 대량입력 "가이드로 전환". M4=CommitBar 초안→확정→발행 지표+CQ/연결 칩(위치·액션 유지). M5=RightPanel 근거(Evidence) 탭 additive. 622테스트+프로덕션 빌드 그린. **유보**: dedup reuse/중복가능은 여정에서 확인만(생성후 병합 안전액션 부재)·relate만 적용. **보류(플랜대로)**: F8 캔버스 구획레인·스트리밍LLM·RightPanel 강제4탭·confidence 원시값 |

## 🔴 진행전 (`진행전/`)

| 문서 | 범위 | 비고 |
|------|------|------|
| (없음) | — | — |

아래 항목은 전용 문서 없이 v6 로드맵 내부에 기술. 자세한 건 `진행전/README.md` 참고.

- v6 Phase2 Grounder — 데이터 그라운딩
- v6 Phase3 Operator — 운영 추론(RAG entrypoint만 스캐폴드)
- v6 Phase4 Steward — 지속 거버넌스
- PRD-B B-5 — AI 자동 구획 제안

## ⚠️ 테스트 부채 (기능 결함 아님)

e2e 픽스처(`ontology/e2e/fixtures/ontology-app.ts`)가 옛 React Flow 셀렉터(`.react-flow`, `aside`) 기준이라 현 Cytoscape UI와 불일치 → 다수 실패. ExplorerPanel 루트는 `<div>`, RightPanel만 `<aside>`. 픽스처를 Cytoscape에 맞게 갱신 필요.
