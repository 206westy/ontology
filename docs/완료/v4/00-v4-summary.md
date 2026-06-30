# Ontology Studio v4 — 검토용 요약

> 작성일: 2026-03-27 | 메인리더 종합 | 검토자: 프로젝트 오너

---

## 한눈에 보기

| 구분 | v3 (현재) | v4 (목표) |
|------|----------|----------|
| 온톨로지 탐색 | 수동 그래프 탐색만 | **Text2Cypher 자연어 패널** + 고급 필터 + 포커스 모드 |
| 프로퍼티 | 클래스 직접 프로퍼티만 | **상속 프로퍼티 시각화** + Copy-on-Write 오버라이드 |
| AI 보조 | 텍스트 파싱 + 채팅 | **인라인 자동완성** (클래스/프로퍼티/관계 추천) |
| 상호운용성 | JSON만 | **JSON-LD + Turtle** Export/Import |
| 저장 | 수동 커밋만 | **자동 저장 옵션** (30초 디바운스) |
| 인터랙션 | 클릭/더블클릭만 | **우클릭 컨텍스트 메뉴** + 패널 리사이저 |
| 시작 경험 | 반도체 FAB 1종 | **도메인 템플릿 5종** |
| 성능 | ELK 메인스레드 | **ELK Web Worker 분리** |
| 브랜딩 | Box 아이콘 | **3노드 삼각형 로고 + Violet→Blue 그라데이션** |
| 기술 부채 | openai 이중 사용 | **AI SDK 통합 + Tailwind v4** |

---

## 기능별 업데이트 항목

### Phase 0 — 기반 정비 (기술 부채 해소)

| ID | 항목 | 내용 | 난이도 |
|----|------|------|--------|
| P0-1 | openai 패키지 제거 | `parse/route.ts`의 openai 직접 사용 → AI SDK `generateObject`로 통합 | Low |
| P0-2 | AIAssistantTab 리팩토링 | 수동 fetch+stream → AI SDK 6.x `useChat` 훅 전환 (200줄→~40줄) | Medium |
| P0-3 | ELK Web Worker 분리 | `elkjs/lib/elk.bundled.js` → `workerUrl` 옵션으로 Worker 분리 | Low |
| P0-4 | Tailwind v4 마이그레이션 | v3→v4 Oxide 엔진 전환 (빌드 성능 2~5x 개선) | Medium |

### Phase 1 — 핵심 기능 (병렬 개발 가능)

| ID | 항목 | 내용 | 난이도 |
|----|------|------|--------|
| P1-1 | 패널 리사이저 (E9) | `react-resizable-panels` 도입, Explorer/RightPanel 드래그 리사이즈 + 더블클릭 접기 | Low |
| P1-2 | 자동 저장 (D6) | 30초 디바운스 자동 커밋 + CommitBar 상태 머신 5종 + Auto 토글 | Low |
| P1-3 | 우클릭 컨텍스트 메뉴 (D8) | `@radix-ui/react-context-menu`, 캔버스/클래스/인스턴스/엣지/트리 5개 컨텍스트 | Low |
| P1-4 | 고급 필터 + 포커스 모드 (D7) | 타입/색상/관계 필터 칩 + N-hop 포커스 모드 + dim/highlight 전환 | Medium |
| P1-5 | 프로퍼티 상속 시각화 (B4) | 런타임 ancestor chain 계산, RightPanel 상속 프로퍼티 읽기전용 표시, Copy-on-Write 오버라이드 | Low |
| P1-6 | 도메인 템플릿 5종 (C5) | 반도체FAB/IT인프라/조직인사/의료/공급망 — 정적 JSON, Import API 재사용 | Low |
| P1-7 | 브랜딩 (E11) | SVG 3노드 삼각형 로고, Violet→Blue gradient, Favicon, 스플래시 화면 | Low |

### Phase 2 — 고급 기능

| ID | 항목 | 내용 | 난이도 |
|----|------|------|--------|
| P2-1 | 온톨로지 자동 완성 (C4) | SchemaContext 빌더 + LLM 기반 클래스/프로퍼티/관계 추천 + Ctrl+Space 트리거 | Medium |
| P2-2 | JSON-LD Export/Import (F3) | `jsonld.js` 사용, @context 설계 + compact/expand API | Medium |
| P2-3 | Turtle Export/Import | `N3.js` 사용, N3.Writer/Parser로 직렬화/파싱 | Medium |
| P2-4 | Text2Cypher UI 패널 | RightPanel 3번째 탭, CodeMirror 6 + `@neo4j-cypher/codemirror`, 자연어/직접입력 듀얼 모드 | Medium |
| P2-5 | 디자인 시스템 적용 | 새 토큰(gradient-brand, surface-raised, display, focus-dim 등), 엣지 유형 분화, 노드 호버/선택 리파인 | Medium |

### Phase 3 — 안정화 & 확장

| ID | 항목 | 내용 | 난이도 |
|----|------|------|--------|
| P3-1 | OWL/XML 기본 Export | 직접 구현 (라이브러리 없이 XML 문자열 생성), 부분 지원만 | High |
| P3-2 | 검증 결과 UI | validation_results 상세 패널, 자동 수정 제안 | Medium |
| P3-3 | 커밋 히스토리 UI | 커밋 목록 조회 + diff 뷰어 | Medium |
| P3-4 | 제약 조건 관리 UI | constraints CRUD 프론트엔드, 시각적 제약 표시 | Medium |

---

## 신규 의존성 요약

| 패키지 | 용도 | 크기 | 필수/선택 |
|--------|------|------|----------|
| `react-resizable-panels` | 패널 리사이즈 | ~8KB | 필수 |
| `@radix-ui/react-context-menu` | 우클릭 메뉴 | ~5KB | 필수 |
| `jsonld` | JSON-LD Export/Import | ~45KB | Phase 2 |
| `n3` | Turtle Export/Import | ~35KB | Phase 2 |
| `@uiwjs/react-codemirror` | Cypher 에디터 | ~100KB | Phase 2 |
| `@neo4j-cypher/codemirror` | Cypher syntax highlighting | 포함 | Phase 2 |

| 제거 | 사유 |
|------|------|
| `openai` | AI SDK로 통합, 이중 의존 제거 |

| 업그레이드 | 내용 |
|-----------|------|
| `tailwindcss` 3.4 → 4.x | Oxide 엔진, 빌드 성능 개선 |

---

## DB 변경사항

**최소 변경 원칙** — 대부분의 v4 기능은 DB 변경 없이 프론트엔드/런타임 로직으로 구현.

| 변경 | 테이블 | 내용 | 필수 |
|------|--------|------|------|
| 컬럼 추가 | `commits` | `is_auto_save: boolean default false` | Phase 1 (D6) |
| 컬럼 추가 (선택) | `classes` | `namespace: text` — Export 시 IRI 생성용 | Phase 2 (F3) |

---

## 리스크 & 주의사항

| 리스크 | 심각도 | 대응 |
|--------|--------|------|
| OWL/XML 전체 매핑은 현실적으로 불가 | High | 부분 지원만 (기본 클래스/프로퍼티/관계), 매핑 범위 명시 |
| `rdflib.js` 사용 금지 | High | 150KB + 유지보수 불안정 → jsonld.js + N3.js로 대체 |
| C4 자동완성 API 비용 | Medium | 분당 3회 LLM rate limit + 로컬 fuzzy match 우선 |
| AI SDK 6.x 마이그레이션 범위 | Medium | AIAssistantTab 리팩토링 필요, 서버는 이미 호환 |
| Tailwind v4 마이그레이션 | Medium | CSS 변수 마이그레이션 필요, 점진적 전환 권장 |
| Text2Cypher는 Neo4j 전용 | Low | Supabase 스테이징 데이터는 별도 쿼리 인터페이스 검토 |

---

## 팀 제안 하이라이트

### 온톨로지 전문가
- OWL Lite 수준의 표현력을 목표로 하되, 추론기는 내장하지 않음 (closed-world 검증)
- 프로퍼티 상속은 **Copy-on-Write 패턴**: 상속은 읽기전용, 오버라이드 시 자기 것으로 복사
- Text2Cypher는 **듀얼 모드**(Neo4j/Staging) 고려

### UX설계자
- 7건의 페인포인트 식별: 데이터 손실 위험, 탐색 제한, 컨텍스트 메뉴 부재 등
- 모든 기능에 Mermaid 순서도 + ASCII 와이어프레임 포함 (03-ux-design-proposal.md 참조)
- Text2Cypher는 **RightPanel 3번째 탭** 위치 제안

### UI/BX디자이너
- 현재 v3 디자인 토큰이 상당히 성숙 → v4는 **기존 체계 확장** 방향
- 디자인 시스템 문서 별도 작성 (04-design-system.md)
- 벤치마킹 5개 제품(Figma/Linear/Notion/Neo4j Bloom/Obsidian)에서 17개 패턴 분석

### 테크리더
- context7 MCP로 6개 라이브러리 최신 문서 검증 완료
- Critical 기술 부채 3건: openai 이중 사용, AI수동스트리밍, ELK 메인스레드
- Phase 0(기반)→Phase 1(핵심, 병렬 가능)→Phase 2(고급)→Phase 3(안정화) 순서 제안

---

## 참고 문서

| 문서 | 내용 |
|------|------|
| `01-current-state-analysis.md` | 코드베이스 & DB 분석 (코드분석자) |
| `02-ontology-expert-proposal.md` | 온톨로지 관점 구현 방안 (온톨로지 전문가) |
| `03-ux-design-proposal.md` | UX 설계안 + 와이어프레임 (UX설계자) |
| `04-design-system.md` | 디자인 시스템 문서 (UI/BX디자이너) |
| `04-ui-bx-proposal.md` | UI/BX 개선안 (UI/BX디자이너) |
| `05-tech-review.md` | 기술 검증 보고서 (테크리더) |
| `PRD-v4.md` | 정식 PRD v4 전문 |
