# 런북: 앱 ↔ Neo4j Desktop 연결 (Docker 대체)

앱의 "반영본" 그래프를 **Neo4j Desktop 2 인스턴스**에 연결하는 절차. 인터넷 되는 개발 PC에서 검증한 뒤, **폐쇄망 최종 서버에서 이 문서만 보고 동일하게 재현**하는 것이 목표다.

- **대상 아키텍처**: 앱(Next.js) → `bolt://localhost:7687` → Neo4j Desktop 인스턴스
- **연결 제어점**: `NEO4J_URI / NEO4J_USERNAME / NEO4J_PASSWORD` 3개 값만 (`src/lib/neo4j/client.ts`). 코드 변경 없음.
- **관련 엔드포인트**: 부트스트랩 `POST /api/neo4j/init`, 연결확인 `GET /api/neo4j/status`
- **검증 스크립트**: `node scripts/neo4j-verify.mjs`

---

## 0. 사전 조건
- Neo4j Desktop 2 설치됨. (폐쇄망: 엔진이 앱에 번들되어 **오프라인 설치·인스턴스 생성 가능** — 검증 완료)
- 앱의 OpenAI egress 허용됨(LLM/임베딩). Neo4j는 로컬이라 egress 무관.
- 데이터 이전 불필요(신규 인스턴스는 0노드에서 시작. 스키마는 3단계에서 부트스트랩).

## 1. Desktop 인스턴스 생성/확인
Neo4j Desktop → **Create Instance**
- **Instance name**: 임의 (예: `onto-local`)
- **Neo4j version**: 번들 버전 (예: `2026.05.x`)
- **Database user**: `neo4j`
- **Password**: 앱과 맞출 값 — 권장 `neo4jlocal123` (최소 8자). ⚠️ **이 값이 `.env.local`의 `NEO4J_PASSWORD`와 일치해야 함.**
- 생성 후 **Start** 로 인스턴스 기동.

> 기존 데이터를 옮길 때만: Create 시 **Load from .dump/.backup** 사용. (신규 배포는 불필요)

## 2. 포트 확보 (Docker 정지)
Docker 컨테이너와 Desktop 인스턴스는 **둘 다 7687/7474** 를 쓰므로 동시 사용 불가. Docker를 정지해 Desktop이 표준 포트를 소유하게 한다.

```bash
docker stop neo4j-onto          # 앱이 쓰던 컨테이너 정지
docker update --restart=no neo4j-onto   # 재부팅 시 자동기동 방지(선택)
```
- Desktop 인스턴스가 `7687`(bolt)/`7474`(http)에 바인딩됐는지 확인:
```powershell
Test-NetConnection localhost -Port 7687   # TcpTestSucceeded : True 여야 함
```
- Desktop이 다른 포트를 잡았다면(드묾), 인스턴스 상세의 Bolt 포트를 확인해 4단계 `NEO4J_URI`에 반영.

## 3. 앱 환경변수 설정
`.env.local` 의 Neo4j 블록을 Desktop 인스턴스에 맞춘다.
```env
NEO4J_URI=neo4j://127.0.0.1:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=<Desktop 인스턴스 비밀번호>
NEO4J_DATABASE=neo4j
```
> ⚠️ **URI는 `neo4j://127.0.0.1` (IPv4 명시) 권장.** Windows에서 `localhost`는 IPv6(`::1`)로
> 먼저 풀리는데 Desktop 인스턴스는 IPv4(127.0.0.1)로 리슨해 `bolt://localhost`가 연결 실패한다.
> Desktop 인스턴스 카드의 Connection URI(예: `neo4j://127.0.0.1:7687`)를 그대로 쓰면 된다.
> 세션은 기본 DB(`neo4j`)를 사용한다(`NEO4J_DATABASE`는 현재 참고용).

## 4. 스키마 부트스트랩 (신규 인스턴스 필수)
신규 인스턴스는 제약·인덱스·**벡터인덱스(1536, cosine)** 가 없다. 반드시 1회 실행:

```bash
npm run neo4j:bootstrap        # .env.local 사용 (다른 env: -- .env.prod)
# 기대: 11개 구문 "적용 11 / 건너뜀 0", 벡터인덱스 포함
```
- 이 스크립트는 앱의 스키마 정의(`src/lib/neo4j/schema.ts`)를 **그대로 import**해 실행하므로 앱 코드와 항상 일치한다. idempotent(재실행 안전).
- ⚠️ 앱의 `POST /api/neo4j/init`는 **로그인 인증이 필요**하다. 배포 초기(계정 없음)엔 위 CLI 스크립트를 쓴다. (로그인 세션이 있으면 엔드포인트도 사용 가능)

## 5. 연결 검증
```bash
npm run neo4j:verify           # 앱 없이 사전 점검
#    CONNECTED / nodes / vector 인덱스(ONLINE) / labels 출력, 종료코드 0
```
- 앱 경유 확인이 필요하고 **로그인 상태**라면: `GET /api/neo4j/status` → `{"connected":true,"serverInfo":{...2026...}}`
- 참고: 개발 서버는 3000 점유 시 자동으로 3001로 뜬다(`scripts/run-next.mjs`).

## 6. 스모크 테스트 (종단)
1. 앱에서 노드 몇 개 생성 → **"반영"(push)** 클릭 → 성공.
2. Neo4j Desktop **Query/Bloom** 또는 `http://localhost:7474` 에서:
   ```cypher
   MATCH (n) RETURN count(n);              // > 0
   MATCH (n)-[r]-(m) RETURN n,r,m LIMIT 100;  // 그래프 시각화
   ```
3. 앱 **NL→Cypher** 탭에서 자연어 질의 → 결과 표시.

---

## 트러블슈팅
| 증상 | 원인 | 조치 |
|---|---|---|
| `bolt://localhost:7687` 연결 실패("compatible encryption settings" 언급) | Windows `localhost`→IPv6(::1), 인스턴스는 IPv4 리슨 | `NEO4J_URI=neo4j://127.0.0.1:7687` 로 변경 |
| `status` connected:false / 스크립트 연결 실패 | 인스턴스 미기동 / 포트 불일치 | Desktop Start, `Test-NetConnection 127.0.0.1 7687`, `NEO4J_URI` 포트 확인 |
| `POST /api/neo4j/init` → `Unauthorized` | 엔드포인트가 로그인 필요 | `npm run neo4j:bootstrap` 사용(무인증 CLI) |
| `Neo.ClientError.Security.Unauthorized` | 비밀번호 불일치 | 인스턴스 비번 ↔ `NEO4J_PASSWORD` 일치화 |
| Desktop 인스턴스 Start 실패(포트 사용중) | Docker가 7687 점유 중 | `docker stop neo4j-onto` 후 재기동 |
| `init` 벡터인덱스 실패 | 버전이 벡터인덱스 미지원 | Neo4j 5.13+ 또는 2025.x 이상 사용 |
| NL→Cypher 결과 0건인데 그래프엔 있음 | **push 안 함**(반영본 비어있음) | 앱에서 "반영" 실행(자동 아님) — CommitBar "미반영 N건" 배지 확인 |

## 전체 재동기화 (resync) — 반영본을 현재 Supabase 상태로 1:1 재구성
`npm run neo4j:resync`

**언제**: Neo4j 인스턴스를 새로 갈았거나(도커→Desktop, 서버 이전), 커밋 재생만으로
반영본이 현재 상태와 어긋날 때. push 는 "커밋 재생"이라 커밋 detail 없는 엔티티(예: 특정
relation_type)는 누락되는데, resync 는 커밋을 무시하고 **현재 테이블을 그대로 투영**해 1:1 을 보장한다.

```bash
npm run neo4j:resync              # .env.local 사용 (다른 env: -- .env.prod)
```
- 동작: 각 현재 엔티티를 synthetic ADD 로 만들어 앱과 **동일한** `buildCypherStatements`
  를 태운다(로직 중복 0 → push 와 항상 일치). 도메인 노드(Class/Instance/RelationType)+
  그 관계를 삭제 후 재생성한다. `_SyncState`(동기화 기록)는 보존한다.
- 전제: **Supabase(DATABASE_URL) 와 Neo4j 양쪽에 접근 가능한 환경**에서 실행. 회사망 CA 는
  스크립트가 자동 주입(재실행)한다. Supabase 는 읽기 전용(무변경), Neo4j 만 재구성.
- 끝에 라벨별/관계타입별 카운트를 출력하니 Supabase 카운트와 대조해 검증한다.
- 한글 관계 타입도 보존된다(백틱 타입). ⚠️ 구버전 버그로 한글 관계가 `___` 로 뭉쳐 있었다면
  resync 후 정상 분리된다.

## 롤백 (다시 Docker로)
```bash
# Desktop 인스턴스 Stop 후
docker start neo4j-onto
# .env.local 을 Docker 값으로 되돌림(동일 포트/비번이면 변경 없음)
node scripts/neo4j-verify.mjs   # 재확인
```

## 폐쇄망(에어갭) 배포 노트
- Desktop 엔진은 앱에 **번들**되어 인터넷 없이 인스턴스 생성 가능(검증됨). 단 **버전 다운로드/플러그인 설치/Desktop 로그인 갱신**은 인터넷 필요 → 미리 완료해 둘 것.
- 최종 서버 egress는 **호스트 화이트리스트**(현재 `api.openai.com`만 열림). Neo4j는 로컬이라 무관.
- 시각화: **Query 탭/Browser는 라이선스 불필요**. **Bloom은 Desktop 로컬(Developer License)에서 동작**.

## ⚠️ 라이선스 주의
- Neo4j **Desktop 인스턴스 = Enterprise + Developer License = 개발 전용.**
- **최종 서버가 프로덕션 상시 운영**이면 라이선스 위반 소지 → **Community(무료)** 또는 정식 Enterprise 라이선스 검토 필요.
- 현재는 "Desktop으로 확정" 결정(개발/검증 단계). 프로덕션 전환 시 이 항목 재검토.
