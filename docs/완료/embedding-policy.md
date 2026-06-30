# 임베딩 정책 (PRD-E Phase 2)

> dedup·RAG를 위한 단일 임베딩 정책. Supabase에서 1회 계산 → dedup(pgvector) + push 시 Neo4j(`:Concept`)로 운반(재계산 금지).

## 모델 · 차원

| 항목 | 값 |
|---|---|
| 모델 | OpenAI `text-embedding-3-small` |
| 차원 | **1536** (`vector(1536)`, halfvec 불필요 — 1536 < pgvector HNSW 상한 2000) |
| 거리 | cosine (`vector_cosine_ops` / Neo4j `cosine`) |
| 호출 | `@ai-sdk/openai` `embedMany`, `OPENAI_API_KEY` |

업그레이드 여지: `text-embedding-3-large`를 MRL로 1536 출력 시 차원 호환(스키마 변경 불필요, 전수 재임베딩 필요).

## 대상 텍스트

```
embeddingText = name + " — " + description        // 클래스
embeddingText = name + " — " + description (+ 핵심 instance_values 일부)  // 인스턴스
```

- 타입·구획(partition)은 임베딩에 **미포함** — 필터 컬럼으로 분리 검색.
- 빈 description은 name만 사용.

## 생성 트리거 (워커 방식)

- **워커 엔드포인트** `POST /api/embeddings/process`: `embedding IS NULL`인 classes/instances를 배치(limit)로 조회 → `embedMany` → `UPDATE … SET embedding`. 부분 실패 격리, `{updated, remaining}` 반환.
- **커밋 후 트리거**: 커밋 성공 직후 `embeddingsApi.process()`를 fire-and-forget 호출(store write 논블로킹).
- **백필**: 최초 1회 `remaining=0`까지 반복 호출.
- **무효화(재임베딩)**: 노드의 `name`/`description` 변경(MOD) 시 `embedding=NULL`로 리셋 → 워커가 재생성. 그 외 변경은 재임베딩 안 함.

## 인덱스

- Supabase: `classes.embedding`·`instances.embedding` HNSW(`vector_cosine_ops`, m=16, ef_construction=64). 필터 컬럼 `partition_id`/`class_id`. 오타 매칭용 `pg_trgm` + name GIN trigram.
- Neo4j: `:Concept(embedding)` vector index(1536, cosine) — P1-2에서 생성.
- recall 보완: pgvector 0.8+ `hnsw.iterative_scan`(필터 동반 검색 시).

## 성장 경로

현 규모(수천 노드)는 **pgvector로 충분**. 병목 시:
1. pgvector HNSW → 2. pgvectorscale DiskANN(메모리 버퍼 초과 시) → 3. Qdrant(고 QPS 병목 시).

## 측정치 (P3-2)

로컬 Neo4j 5.26 + Supabase pgvector 기준(2026-06-23):
- **임베딩 백필**: 307 클래스 전수 생성 완료(`/api/embeddings/process` 반복), 차원 1536 확인.
- **pgvector 벡터검색**: cosine 최근접 정상(예: "0.33 MATCHER"→"MATCHER" dist 0.52). 현 규모(수백~수천)에서 HNSW 즉시 응답.
- **대규모 푸시(무손실)**: 1000 노드 단일 트랜잭션 push → Neo4j count=1000 무손실. 단 push 가 statement 순차 실행이라 대량 발행 시 round-trip 누적(노드당 수십 ms). **대량 시나리오는 `UNWIND` 배치로 최적화 여지**(현 규모는 불필요).
- 임베딩 생성은 OpenAI `embedMany` 배치 호출(노드당 1회), 커밋 후 비동기 → 사용자 체감 지연 없음.
