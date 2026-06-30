# 온톨로지 전문가 제안서 — v4 기능별 구현 방안

> **작성일**: 2026-03-27
> **작성자**: 온톨로지/지식그래프 전문 기획자 (v4 기획단)
> **관점**: Palantir Foundry/Gotham 대규모 온톨로지 구축 경험 기반

---

## 0. 현재 데이터 모델 진단 요약

### 현재 아키텍처의 강점

| 요소 | 현황 | 평가 |
|------|------|------|
| 클래스 계층 | `classes.parentId` self-reference + `uq_class_name_per_parent` | 단일 상속 DAG, 올바른 설계 |
| 프로퍼티 | `properties` EAV 패턴, `classId` 기준 바인딩 | 유연하나 상속 미지원 |
| 인스턴스 | `instances` + `instance_values` EAV | 표준적 접근 |
| 관계 | `relation_types` (스키마) + `edges` (인스턴스) 분리 | 올바른 TBox/ABox 분리 |
| 제약 | `constraints` 테이블 (v3에서 추가) | 4종 제약 타입 지원, config JSON 유연 |
| 검증 | `validation_results` + 5개 규칙 | 기반 존재, 확장 가능 |
| 커밋 | `commits` + `commit_details` (before/after snapshot) | 변경 이력 추적 가능 |
| Cypher 빌더 | `cypher-builder.ts` — ADD/MOD/DEL별 Cypher 생성 | IS_A, INSTANCE_OF 관계 자동 생성 |

### 현재 아키텍처의 한계 (v4에서 해결해야 할 것)

1. **프로퍼티 상속 부재**: `properties.classId`가 직접 바인딩만 지원. `rdfs:subClassOf`에 의한 프로퍼티 전파(propagation)가 없다. 하위 클래스가 상위 클래스의 프로퍼티를 자동으로 물려받지 못한다.

2. **네임스페이스/IRI 부재**: 모든 엔티티가 UUID로만 식별된다. 외부 온톨로지와 상호운용하려면 IRI(Internationalized Resource Identifier) 또는 최소 `prefix:localName` 형태의 식별 체계가 필요하다.

3. **Export 포맷 제한**: 현재 자체 JSON 포맷만 지원. JSON-LD, OWL/XML, RDF/Turtle 등 표준 포맷 미지원. `@context` 없이 export하므로 시맨틱 웹 도구에서 해석 불가.

4. **LLM 컨텍스트 부족**: `llm/parse`에서 기존 클래스 이름 목록만 전달. 프로퍼티, 관계 타입, 제약조건 등 전체 스키마 컨텍스트가 없어 추천 품질이 제한적.

5. **Text2Cypher의 Supabase 단절**: Text2Cypher가 Neo4j 스키마만 읽어서 Cypher를 생성. Supabase(스테이징) 데이터는 탐색 불가. Neo4j에 푸시하지 않은 스테이징 상태의 온톨로지를 쿼리할 수 없다.

---

## 1. 온톨로지 모델링 원칙

### 1.1 Ontology Studio에 적용할 핵심 원칙

이 프로젝트는 OWL Full이나 Description Logic 추론기를 내장하는 것이 목표가 아니다. **도메인 전문가가 코드 없이 온톨로지를 구축**하는 도구이므로, 아래 원칙을 따른다:

| 원칙 | 설명 | 적용 방법 |
|------|------|-----------|
| **TBox/ABox 분리** | 스키마(클래스/관계타입/프로퍼티)와 데이터(인스턴스/엣지/값) 구분 | 이미 적용됨. 유지 |
| **Open World Assumption 회피** | 사용자가 명시한 것만 참. 추론기 없이 closed-world 검증 | 검증 규칙이 명시적 위반만 탐지 |
| **단일 상속** | 다중 상속은 UI 복잡도를 급격히 올림 | `parentId` 단일 참조 유지. Mixin은 향후 별도 메커니즘 |
| **프로퍼티 상속은 읽기 전용** | 하위 클래스가 상위 프로퍼티를 "볼 수" 있으나, 오버라이드 시 자기 것으로 복사 | Copy-on-Write 패턴 |
| **네임스페이스는 선택적** | 내부적으로 UUID, Export 시에만 IRI 생성 | Export 변환 레이어에서 처리 |
| **점진적 형식화** | 처음엔 자유롭게, 점점 제약을 강화 | Severity 단계별 (info → warning → error) |

### 1.2 OWL Lite 수준의 표현력 목표

Ontology Studio v4는 **OWL Lite 수준의 표현력**을 목표로 한다. 이는 대부분의 실무 온톨로지가 요구하는 수준이며, 도메인 전문가가 직관적으로 이해할 수 있는 범위다.

```
OWL Full ⊃ OWL DL ⊃ OWL Lite ← 여기까지
                              ↑ 현재 위치 (v3: RDFS++ 수준)
```

**v4에서 추가할 OWL Lite 요소**:
- `rdfs:subClassOf` 프로퍼티 전파 (현재: 클래스 계층만 존재)
- `owl:inverseOf` (관계 역방향 자동 추론)
- `owl:FunctionalProperty` (프로퍼티 유일성 제약)
- `owl:allValuesFrom` / `owl:someValuesFrom` (제한된 형태)

---

## 2. 기능별 구현 방안

### 2.1 B4. 프로퍼티 상속 시각화

#### 문제 정의

현재 `properties` 테이블은 `classId` 직접 참조만 가진다. `Equipment` 클래스에 `serialNumber` 프로퍼티가 있을 때, 하위 클래스 `DryAsher`의 RightPanel에서 이 프로퍼티가 보이지 않는다.

#### OWL 관점에서의 프로퍼티 전파 메커니즘

OWL/RDFS에서 `rdfs:subClassOf`는 프로퍼티를 자동으로 전파한다:
- `Equipment rdfs:subClassOf owl:Restriction(onProperty: serialNumber)` 이면
- `DryAsher rdfs:subClassOf Equipment` 일 때
- DryAsher의 인스턴스도 serialNumber를 가진다

#### 구현 방안: Computed Inheritance (DB 변경 없음)

**핵심 설계**: DB 스키마를 변경하지 않고, 런타임에 상속 프로퍼티를 계산한다.

```typescript
// 새 유틸리티: ontology/src/features/ontology/lib/property-inheritance.ts

interface InheritedProperty extends OntologyProperty {
  inheritedFrom: string | null;    // 원본 classId (null이면 자기 것)
  isOverridden: boolean;           // 하위에서 같은 이름으로 재정의했는지
  depth: number;                   // 상속 깊이 (0 = 자기 것, 1 = 부모, 2 = 조부모...)
}

function getInheritedProperties(
  classId: string,
  allClasses: OntologyClass[],
  allProperties: OntologyProperty[],
): InheritedProperty[] {
  // 1. classId → root까지 ancestor chain 구축
  // 2. 각 ancestor의 properties를 depth 역순으로 수집
  // 3. 같은 name의 property가 하위에 있으면 isOverridden = true
  // 4. 자기 것(depth=0) + 상속된 것(depth>0) 합쳐서 반환
}
```

**RightPanel 연동**:
- 상속 프로퍼티: 회색 배경 + 아이콘(화살표 + 부모 클래스명) + 읽기 전용
- "오버라이드" 버튼: 클릭 시 해당 프로퍼티를 현재 클래스에 복사 (Copy-on-Write)
- 오버라이드된 프로퍼티: 일반 프로퍼티와 동일하게 편집 가능 + "상속 복원" 버튼

**인스턴스 값 입력 시**:
- 인스턴스 생성/편집 시, 상속 프로퍼티도 `instance_values`에 값을 저장 가능
- `instance_values.propertyId`는 원본 프로퍼티 ID를 참조 (상속 체인 따라감)
- 필수(isRequired) 프로퍼티의 상속: 상위에서 required면 하위에서도 required

**Neo4j Cypher 빌더 변경사항**:
- 인스턴스 ADD 시 상속 프로퍼티도 Neo4j 노드에 속성으로 포함
- 현재 `propertyAdd`가 Class 노드에 프로퍼티를 SET하는데, 이를 하위 Class에도 전파

**성능 고려사항**:
- 클래스 계층 깊이가 보통 3-5단계이므로, 매번 계산해도 성능 문제 없음
- 계층이 깊어질 경우를 대비해 `useOntologyStore`에 캐시 맵 유지

#### 시각화 설계

```
RightPanel > Properties Section
┌──────────────────────────────────┐
│ PROPERTIES (3+2 inherited)       │
├──────────────────────────────────┤
│ ● serialNumber [string] *        │ ← 자기 것
│ ● processTemp  [float]           │ ← 자기 것
│ ● status       [enum] *          │ ← 자기 것
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ ↗ name         [string] *        │ ← Equipment에서 상속 (읽기전용)
│   └ from: Equipment              │
│ ↗ manufacturer [string]          │ ← Equipment에서 상속 (읽기전용)
│   └ from: Equipment  [오버라이드] │
└──────────────────────────────────┘
```

---

### 2.2 C4. 온톨로지 자동 완성

#### 현재 LLM 활용의 한계

현재 `llm/parse` 라우트:
- 입력: 자유 텍스트 + `existingClasses: string[]` + `existingRelationTypes: string[]`
- 이름 목록만 전달하므로, LLM이 기존 프로퍼티/제약/관계 구조를 모름
- 사용 모델: `gpt-5.4-mini` (JSON mode)

#### LLM에 제공해야 할 컨텍스트 설계

**풍부한 스키마 컨텍스트 구축**:

```typescript
// ontology/src/features/ontology/lib/schema-context-builder.ts

interface SchemaContext {
  classHierarchy: string;      // 들여쓰기 트리 형태
  propertyMap: string;         // 클래스별 프로퍼티 목록
  relationTypes: string;       // 관계 타입 + domain/range
  constraints: string;         // 주요 제약 조건
  statistics: string;          // 클래스당 인스턴스 수 등
}

function buildSchemaContext(
  classes: OntologyClass[],
  properties: OntologyProperty[],
  relationTypes: RelationType[],
  edges: OntologyEdge[],
  constraints: OntologyConstraint[],
  instances: OntologyInstance[],
): SchemaContext {
  // 1. classHierarchy: 트리 구조로 표현
  //    Equipment
  //    ├── DryAsher (instances: 5)
  //    └── WetStation (instances: 3)

  // 2. propertyMap:
  //    Equipment: serialNumber(string, required), manufacturer(string)
  //    DryAsher: processTemp(float), status(enum: active|inactive|maintenance)

  // 3. relationTypes:
  //    LOCATED_AT: Equipment → Site (min:1, max:1)
  //    MAINTAINED_BY: Equipment → Technician

  // 4. constraints: 주요 카디널리티/disjoint 조건

  // 5. statistics: 규모 감각 제공
}
```

**자동 완성 시나리오 3가지**:

**A. 새 클래스 추천** (사용자가 캔버스에서 새 노드 추가 시):
- 트리거: NewNodePopover 열릴 때
- 컨텍스트: 현재 클래스 계층 + 부모 클래스의 형제 패턴
- LLM 요청: "이 온톨로지에서 {parentClass}의 하위 클래스로 적합한 것을 3개 추천해주세요"
- 결과: 이름 + 설명 + 추천 프로퍼티 목록

**B. 프로퍼티 추천** (사용자가 클래스 선택 후 프로퍼티 추가 시):
- 트리거: RightPanel에서 "프로퍼티 추가" 클릭 시
- 컨텍스트: 해당 클래스의 이름/설명 + 기존 프로퍼티 + 부모 클래스 프로퍼티
- LLM 요청: "이 클래스에 빠진 프로퍼티를 추천"
- 결과: 이름 + dataType + isRequired 추천

**C. 관계 추천** (두 클래스 선택 시):
- 트리거: 두 노드를 선택하거나, RelationPopover 열릴 때
- 컨텍스트: 두 클래스의 전체 정보 + 기존 관계
- LLM 요청: "이 두 클래스 사이에 적합한 관계를 추천"
- 결과: 관계명 + 방향 + 카디널리티 추천

#### Schema.org / Dublin Core 매핑 추천

**표준 온톨로지 매핑 전략**:

미리 정의된 매핑 테이블을 LLM 컨텍스트에 포함:

```typescript
// ontology/src/features/ontology/constants/standard-ontology-hints.ts

const SCHEMA_ORG_COMMON = {
  Person: { properties: ['name', 'email', 'birthDate', 'jobTitle'], relations: ['worksFor', 'knows'] },
  Organization: { properties: ['name', 'url', 'foundingDate'], relations: ['member', 'department'] },
  Place: { properties: ['name', 'latitude', 'longitude', 'address'], relations: ['containedIn'] },
  Event: { properties: ['name', 'startDate', 'endDate', 'location'], relations: ['organizer', 'attendee'] },
  Product: { properties: ['name', 'sku', 'brand', 'price'], relations: ['manufacturer', 'category'] },
  CreativeWork: { properties: ['name', 'author', 'datePublished'], relations: ['about', 'creator'] },
};

const DUBLIN_CORE_PROPERTIES = [
  'title', 'creator', 'subject', 'description', 'publisher',
  'contributor', 'date', 'type', 'format', 'identifier',
  'source', 'language', 'relation', 'coverage', 'rights',
];
```

LLM 프롬프트에 해당 힌트를 포함하여, 사용자의 클래스가 표준 온톨로지의 어떤 개념에 매핑되는지 추천.

---

### 2.3 C5. 도메인 템플릿 5종

#### 설계 원칙

각 템플릿은 다음을 포함:
- **클래스 계층** (3-4 depth)
- **핵심 프로퍼티** (필수 + 권장)
- **관계 타입** (domain/range 포함)
- **카디널리티 제약** (핵심 관계만)
- **확장 포인트** (사용자가 추가할 영역 표시)

#### 템플릿 데이터 포맷

기존 Import API(`/api/import`)와 동일한 JSON 구조를 사용:

```typescript
// ontology/src/features/ontology/constants/templates/types.ts

interface DomainTemplate {
  id: string;
  name: string;
  nameKo: string;
  description: string;
  descriptionKo: string;
  icon: string;                    // lucide-react 아이콘명
  color: string;                   // 대표 색상
  estimatedSize: string;           // "12 classes, 45 properties, 8 relations"
  tags: string[];
  ontology: ImportRequestInput['ontology'];  // 기존 import 포맷 재사용
  extensionPoints: string[];       // 사용자 확장 가이드
}
```

#### 1. 반도체 FAB (Semiconductor Fabrication)

```
FAB 온톨로지
├── Equipment                      # 장비
│   ├── DryEtcher                  #   건식 식각기
│   ├── WetStation                 #   습식 처리장비
│   ├── CVD_Chamber                #   CVD 챔버
│   ├── Lithography_Scanner        #   노광기
│   └── Metrology_Tool             #   계측장비
├── Process                        # 공정
│   ├── EtchProcess                #   식각 공정
│   ├── Deposition                 #   증착 공정
│   ├── Lithography                #   노광 공정
│   └── CMP                        #   CMP 공정
├── Material                       # 소재
│   ├── Wafer                      #   웨이퍼
│   ├── Chemical                   #   화학물질
│   └── Gas                        #   가스
├── Site                           # 위치
│   ├── CleanRoom                  #   클린룸
│   └── Bay                        #   베이
├── Recipe                         # 레시피 (공정 파라미터)
├── Lot                            # 로트 (생산 단위)
└── Defect                         # 결함
    ├── ParticleDefect             #   파티클 결함
    └── PatternDefect              #   패턴 결함
```

**핵심 관계**:
- `LOCATED_AT`: Equipment → Site (1:1)
- `USES_EQUIPMENT`: Process → Equipment (M:N)
- `PRODUCES`: Process → Material (1:N)
- `FOLLOWS_RECIPE`: Process → Recipe (N:1)
- `PROCESSED_IN`: Lot → Process (ordered, M:N)
- `DETECTED_ON`: Defect → Lot (N:1)

**핵심 프로퍼티**:
- Equipment: serialNumber(string, required), status(enum: idle|running|maintenance|down), installDate(date)
- Process: stepNumber(integer, required), temperature(float), pressure(float), duration(float)
- Lot: lotId(string, required), quantity(integer), priority(enum: normal|hot|super-hot)

#### 2. IT 인프라 (IT Infrastructure / CMDB)

```
IT 인프라 온톨로지
├── Asset                          # 자산
│   ├── Server                     #   서버
│   │   ├── PhysicalServer         #     물리 서버
│   │   └── VirtualMachine         #     가상 머신
│   ├── NetworkDevice              #   네트워크 장비
│   │   ├── Router                 #     라우터
│   │   ├── Switch                 #     스위치
│   │   └── Firewall               #     방화벽
│   └── Storage                    #   스토리지
│       ├── SAN                    #     SAN
│       └── NAS                    #     NAS
├── Software                       # 소프트웨어
│   ├── OperatingSystem            #   운영체제
│   ├── Application                #   애플리케이션
│   ├── Database                   #   데이터베이스
│   └── Middleware                  #   미들웨어
├── Network                        # 네트워크
│   ├── VLAN                       #   VLAN
│   ├── Subnet                     #   서브넷
│   └── IPAddress                  #   IP 주소
├── Location                       # 위치
│   ├── DataCenter                 #   데이터센터
│   ├── Rack                       #   랙
│   └── Floor                      #   층
├── Service                        # 서비스 (비즈니스)
├── Incident                       # 인시던트
└── Person                         # 담당자
    ├── SystemAdmin                #   시스템 관리자
    └── NetworkAdmin               #   네트워크 관리자
```

**핵심 관계**:
- `RUNS_ON`: Software → Server (M:N)
- `CONNECTS_TO`: NetworkDevice → NetworkDevice (M:N)
- `BELONGS_TO`: IPAddress → Subnet (N:1)
- `HOSTED_IN`: Server → Rack (N:1)
- `DEPENDS_ON`: Service → Service (M:N, 순환 방지 필요)
- `MANAGED_BY`: Asset → Person (N:1)
- `AFFECTED_BY`: Service → Incident (M:N)

**카디널리티 제약**: Server는 반드시 1개의 OS를 가져야 함, 모든 Asset은 Location이 있어야 함

#### 3. 조직/인사 (Organization & HR)

```
조직/인사 온톨로지
├── Organization                   # 조직
│   ├── Company                    #   회사
│   ├── Department                 #   부서
│   ├── Team                       #   팀
│   └── Committee                  #   위원회
├── Person                         # 인물
│   ├── Employee                   #   직원
│   │   ├── FullTime               #     정규직
│   │   └── Contractor             #     계약직
│   └── Applicant                  #   지원자
├── Position                       # 직위/직책
│   ├── ManagementPosition         #   관리직
│   └── TechnicalPosition          #   기술직
├── Skill                          # 역량
│   ├── TechnicalSkill             #   기술 역량
│   └── SoftSkill                  #   소프트 스킬
├── Project                        # 프로젝트
├── Document                       # 문서
│   ├── Policy                     #   정책
│   ├── Contract                   #   계약서
│   └── Review                     #   평가서
└── Location                       # 위치
    ├── Office                     #   사무실
    └── Region                     #   지역
```

**핵심 관계**:
- `REPORTS_TO`: Employee → Employee (N:1, 계층)
- `BELONGS_TO`: Employee → Department (N:1)
- `HOLDS_POSITION`: Employee → Position (N:1)
- `HAS_SKILL`: Employee → Skill (M:N, proficiency level)
- `ASSIGNED_TO`: Employee → Project (M:N, role)
- `MANAGES`: Employee → Department (1:1)

#### 4. 의료 (Healthcare)

```
의료 온톨로지
├── Person                         # 인물
│   ├── Patient                    #   환자
│   └── Practitioner               #   의료인
│       ├── Physician              #     의사
│       ├── Nurse                  #     간호사
│       └── Specialist             #     전문의
├── ClinicalEntity                 # 임상 개체
│   ├── Condition                  #   질환/상태
│   │   ├── Disease                #     질병
│   │   └── Symptom                #     증상
│   ├── Procedure                  #   시술/처치
│   │   ├── Surgery                #     수술
│   │   └── Therapy                #     치료
│   └── Observation                #   관찰/검사
│       ├── LabTest                #     검사
│       └── Imaging                #     영상
├── Medication                     # 약물
│   ├── Prescription               #   처방약
│   └── OTC                        #   일반의약품
├── Encounter                      # 진료 (방문/입원)
├── Facility                       # 시설
│   ├── Hospital                   #   병원
│   ├── Clinic                     #   의원
│   └── Ward                       #   병동
└── Insurance                      # 보험
    ├── Plan                       #   보험 플랜
    └── Claim                      #   청구
```

**핵심 관계**:
- `HAS_CONDITION`: Patient → Condition (M:N, onset date)
- `TREATED_BY`: Patient → Practitioner (M:N)
- `PRESCRIBED`: Practitioner → Medication (for Patient, M:N)
- `PERFORMED_AT`: Procedure → Facility (N:1)
- `RESULTS_IN`: Observation → Condition (N:M, diagnostic)
- `CONTRAINDICATED_WITH`: Medication → Medication (M:N, 금기)
- `COVERED_BY`: Patient → Insurance.Plan (M:N)

**Disjoint 제약**: Disease와 Symptom은 배타적 (동일 개체가 두 타입 동시 불가)

#### 5. 공급망 (Supply Chain)

```
공급망 온톨로지
├── Organization                   # 조직
│   ├── Supplier                   #   공급업체
│   ├── Manufacturer               #   제조업체
│   ├── Distributor                #   유통업체
│   └── Customer                   #   고객
├── Product                        # 제품
│   ├── RawMaterial                #   원자재
│   ├── Component                  #   부품
│   └── FinishedGood               #   완제품
├── Order                          # 주문
│   ├── PurchaseOrder              #   발주
│   └── SalesOrder                 #   수주
├── Shipment                       # 배송
├── Warehouse                      # 창고
│   ├── StorageZone                #   보관 구역
│   └── Dock                       #   도크
├── Route                          # 운송 경로
├── Contract                       # 계약
└── QualityCheck                   # 품질 검사
    ├── IncomingInspection         #   입고 검사
    └── OutgoingInspection         #   출고 검사
```

**핵심 관계**:
- `SUPPLIES`: Supplier → Product (M:N, lead time, cost)
- `COMPOSED_OF`: Product → Component (M:N, BOM)
- `STORED_IN`: Product → Warehouse.StorageZone (M:N, quantity)
- `SHIPPED_VIA`: Shipment → Route (N:1)
- `ORDERED_BY`: Order → Organization (N:1)
- `INSPECTED_BY`: QualityCheck → Product (N:1)

#### 템플릿 확장성 설계

```typescript
// 각 템플릿은 extensionPoints 필드에 확장 가이드를 포함
{
  extensionPoints: [
    "Equipment 하위에 도메인 특화 장비 유형을 추가하세요",
    "Process의 프로퍼티에 도메인 특화 파라미터를 추가하세요",
    "Site 계층을 실제 공장 구조에 맞게 확장하세요",
    "Defect 분류 체계를 확장하세요",
  ]
}
```

**로딩 메커니즘**:
- 기존 `/api/import` 엔드포인트를 그대로 활용 (`strategy: 'replace'`)
- 프론트엔드에서 템플릿 선택 UI → JSON 로드 → Import API 호출
- 템플릿은 `ontology/src/features/ontology/constants/templates/` 디렉토리에 JSON 파일로 저장

---

### 2.4 F3-F4. JSON-LD / OWL 지원

#### 내부 모델 → JSON-LD 변환 매핑

**@context 설계**:

```json
{
  "@context": {
    "@vocab": "http://ontology-studio.local/ontology/",
    "owl": "http://www.w3.org/2002/07/owl#",
    "rdfs": "http://www.w3.org/2000/01/rdf-schema#",
    "rdf": "http://www.w3.org/1999/02/22-rdf-syntax-ns#",
    "xsd": "http://www.w3.org/2001/XMLSchema#",
    "skos": "http://www.w3.org/2004/02/skos/core#",
    "schema": "http://schema.org/",
    "dc": "http://purl.org/dc/elements/1.1/"
  }
}
```

**매핑 테이블**:

| 내부 모델 | JSON-LD / OWL 표현 |
|-----------|-------------------|
| `OntologyClass` | `owl:Class` |
| `classes.parentId` → parent | `rdfs:subClassOf` |
| `classes.name` | `rdfs:label` |
| `classes.description` | `rdfs:comment` 또는 `skos:definition` |
| `OntologyProperty` | `owl:DatatypeProperty` 또는 `owl:ObjectProperty` |
| `properties.classId` | `rdfs:domain` |
| `properties.dataType` | `rdfs:range` (XSD 매핑) |
| `properties.isRequired` | `owl:minCardinality 1` restriction |
| `RelationType` | `owl:ObjectProperty` |
| `relationTypes.sourceClassId` | `rdfs:domain` |
| `relationTypes.targetClassId` | `rdfs:range` |
| `OntologyInstance` | `owl:NamedIndividual` |
| `instances.classId` | `rdf:type` |
| `OntologyEdge` | ObjectProperty assertion |
| `OntologyConstraint (cardinality)` | `owl:Restriction` + `owl:minCardinality` / `owl:maxCardinality` |
| `OntologyConstraint (disjoint)` | `owl:disjointWith` |

**DataType 매핑**:

| 내부 dataType | XSD 매핑 |
|--------------|----------|
| `string` | `xsd:string` |
| `integer` | `xsd:integer` |
| `float` | `xsd:float` |
| `boolean` | `xsd:boolean` |
| `date` | `xsd:date` |
| `enum` | `owl:oneOf` (enumValues 리스트) |

**구현: Export API 확장**

```typescript
// ontology/src/app/api/export/route.ts 에 format 쿼리 파라미터 추가

// GET /api/export?format=json           ← 기존 동작
// GET /api/export?format=jsonld         ← JSON-LD
// GET /api/export?format=owl            ← OWL/XML
// GET /api/export?format=turtle         ← RDF/Turtle (향후)

// 변환 로직은 별도 모듈:
// ontology/src/lib/export/jsonld-converter.ts
// ontology/src/lib/export/owl-converter.ts
```

#### JSON-LD 변환기 핵심 로직

```typescript
// ontology/src/lib/export/jsonld-converter.ts

function toJsonLd(exportData: ExportResult): object {
  const baseUri = 'http://ontology-studio.local/ontology/';

  const context = {
    '@vocab': baseUri,
    'owl': 'http://www.w3.org/2002/07/owl#',
    'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
    'xsd': 'http://www.w3.org/2001/XMLSchema#',
  };

  const graph: object[] = [];

  // 온톨로지 헤더
  graph.push({
    '@id': baseUri,
    '@type': 'owl:Ontology',
    'rdfs:label': 'Ontology Studio Export',
    'owl:versionInfo': exportData.version,
  });

  // 클래스 변환
  for (const cls of exportData.ontology.classes) {
    const classNode: Record<string, unknown> = {
      '@id': `${baseUri}class/${cls.id}`,
      '@type': 'owl:Class',
      'rdfs:label': cls.name,
      'rdfs:comment': cls.description,
    };
    if (cls.parentId) {
      classNode['rdfs:subClassOf'] = { '@id': `${baseUri}class/${cls.parentId}` };
    }
    graph.push(classNode);
  }

  // 프로퍼티 변환
  for (const prop of exportData.ontology.properties) {
    graph.push({
      '@id': `${baseUri}property/${prop.id}`,
      '@type': 'owl:DatatypeProperty',
      'rdfs:label': prop.name,
      'rdfs:domain': { '@id': `${baseUri}class/${prop.classId}` },
      'rdfs:range': { '@id': xsdMapping[prop.dataType] },
    });
  }

  // 인스턴스 변환
  for (const inst of exportData.ontology.instances) {
    graph.push({
      '@id': `${baseUri}instance/${inst.id}`,
      '@type': [{ '@id': `${baseUri}class/${inst.classId}` }],
      'rdfs:label': inst.name,
    });
  }

  // 관계 타입 → ObjectProperty
  for (const rt of exportData.ontology.relationTypes) {
    const prop: Record<string, unknown> = {
      '@id': `${baseUri}relation/${rt.id}`,
      '@type': 'owl:ObjectProperty',
      'rdfs:label': rt.name,
    };
    if (rt.sourceClassId) prop['rdfs:domain'] = { '@id': `${baseUri}class/${rt.sourceClassId}` };
    if (rt.targetClassId) prop['rdfs:range'] = { '@id': `${baseUri}class/${rt.targetClassId}` };
    graph.push(prop);
  }

  return { '@context': context, '@graph': graph };
}
```

#### OWL/XML 변환기 핵심 로직

```typescript
// ontology/src/lib/export/owl-converter.ts

function toOwlXml(exportData: ExportResult): string {
  const baseUri = 'http://ontology-studio.local/ontology/';

  let xml = `<?xml version="1.0"?>
<rdf:RDF xmlns="http://ontology-studio.local/ontology/"
  xmlns:owl="http://www.w3.org/2002/07/owl#"
  xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
  xmlns:rdfs="http://www.w3.org/2000/01/rdf-schema#"
  xmlns:xsd="http://www.w3.org/2001/XMLSchema#"
  xml:base="${baseUri}">

  <owl:Ontology rdf:about="${baseUri}">
    <rdfs:label>Ontology Studio Export</rdfs:label>
  </owl:Ontology>
`;

  // 클래스 출력
  for (const cls of exportData.ontology.classes) {
    xml += `\n  <owl:Class rdf:about="${baseUri}class/${cls.id}">`;
    xml += `\n    <rdfs:label>${escapeXml(cls.name)}</rdfs:label>`;
    if (cls.description) {
      xml += `\n    <rdfs:comment>${escapeXml(cls.description)}</rdfs:comment>`;
    }
    if (cls.parentId) {
      xml += `\n    <rdfs:subClassOf rdf:resource="${baseUri}class/${cls.parentId}"/>`;
    }
    xml += `\n  </owl:Class>`;
  }

  // ... (프로퍼티, 인스턴스, 관계 등 유사 패턴)

  xml += `\n</rdf:RDF>`;
  return xml;
}
```

#### Protege 호환성 확보

1. **네임스페이스**: `xml:base`를 설정하여 Protege가 상대 IRI를 해석 가능하게 함
2. **OWL 프로파일**: OWL DL 준수 (Protege는 OWL DL이 기본)
3. **엔티티 IRI**: `baseUri + type + "/" + id` 형식 (UUID는 유효한 IRI fragment)
4. **어노테이션**: `rdfs:label`과 `rdfs:comment`은 Protege가 기본 표시하는 어노테이션
5. **Import 지원**: OWL/XML 포맷의 파일을 Import할 수 있도록 파서 구현 (우선순위는 Export보다 낮음)

**Import 시 주의사항**:
- Protege OWL 파일은 blank node, complex restrictions 등을 포함할 수 있음
- v4에서는 "지원 가능한 요소만 Import, 나머지는 경고 후 스킵" 전략 권장
- 지원 요소: Class, ObjectProperty, DatatypeProperty, NamedIndividual, subClassOf, domain, range
- 비지원 요소: UnionOf, IntersectionOf, ComplexRestriction → 경고 메시지 표시

---

### 2.5 Text2Cypher UI 온톨로지 활용 방안

#### 현재 구현 분석

현재 `text2cypher/route.ts`:
- Neo4j에서 실시간으로 `labels(n)`, `keys(n)`, `type(r)`을 쿼리하여 스키마 추출
- `gpt-4o`에게 스키마 + 질문을 보내 Cypher 생성
- `executeCypher` / `correctCypher` 도구로 실행/수정 루프

**한계**:
1. Neo4j에 푸시하지 않은 Supabase 스테이징 데이터는 탐색 불가
2. 스키마 정보가 노드 레이블과 프로퍼티 키만 포함 — 관계의 의미, 제약조건 등 풍부한 컨텍스트 없음
3. 결과가 텍스트로만 반환 — 그래프 시각화 없음

#### 개선 방안

**A. 듀얼 모드 스키마 소스**:

```typescript
// text2cypher 라우트에 mode 파라미터 추가
// mode: 'neo4j' (기존) | 'staging' (Supabase 기반)

// Supabase 모드 시:
async function getStagingSchema(): Promise<string> {
  const db = await getDb();
  const allClasses = await db.query.classes.findMany();
  const allProperties = await db.query.properties.findMany();
  const allRelationTypes = await db.query.relationTypes.findMany();
  const allConstraints = await db.query.constraints.findMany();

  // buildSchemaContext() 재사용 (2.2에서 정의한 것)
  return formatSchemaForCypher(allClasses, allProperties, allRelationTypes, allConstraints);
}
```

**B. 풍부한 스키마 컨텍스트 제공**:

현재 LLM에 전달되는 스키마:
```
Node properties:
Class {id, name, description, color}
Instance {id, name, classId}

Relationships:
(:Class)-[:IS_A]->(:Class)
(:Instance)-[:INSTANCE_OF]->(:Class)
```

개선된 스키마:
```
Node labels and meanings:
- Class: 온톨로지 클래스 (카테고리). Properties: id(UUID), name(string), description(string)
  - Equipment: 장비 (parent: none). Has properties: serialNumber(string, required), status(enum: idle|running)
  - DryAsher: 건식 식각기 (parent: Equipment). Inherits Equipment properties
  - Site: 위치

Relationship types:
- IS_A: 클래스 상속 관계 (Class → Class)
- INSTANCE_OF: 인스턴스 → 클래스 타입 관계
- LOCATED_AT: 장비의 위치 (Equipment → Site, cardinality: 1:1)
- MAINTAINED_BY: 장비 유지보수 담당 (Equipment → Technician)

Constraints:
- Equipment은 반드시 1개의 Site에 LOCATED_AT 관계를 가져야 함
- DryAsher와 WetStation은 disjoint (하나의 인스턴스가 동시에 두 타입 불가)
```

**C. 쿼리 결과 그래프 시각화**:

Text2Cypher 결과가 노드/엣지를 반환할 때, React Flow 캔버스에 하이라이트 표시:

```typescript
// 응답에 visualizable 필드 추가
interface Text2CypherResult {
  // ... 기존 필드
  visualization?: {
    highlightNodeIds: string[];    // 결과에 포함된 노드 ID
    highlightEdgeIds: string[];    // 결과에 포함된 엣지 ID
    newNodes?: Array<{             // RETURN으로 반환된 path의 노드들
      id: string;
      label: string;
      properties: Record<string, unknown>;
    }>;
  };
}
```

프론트엔드에서:
1. 결과의 `visualization.highlightNodeIds`에 해당하는 노드에 glow 효과 적용
2. 테이블 뷰 + 그래프 뷰 토글 지원
3. "캔버스에서 보기" 버튼: fitView로 해당 노드들 중심으로 줌

**D. 자연어 인터페이스 설계**:

Text2Cypher를 CommandPalette와 통합:
- `Cmd+K`로 CommandPalette 열기
- "FAB에서 가동 중인 장비 목록" 같은 자연어 입력
- LLM이 Cypher 생성 → 프리뷰 표시 → 사용자 승인 시 실행
- 결과를 캔버스 하이라이트 또는 사이드패널 테이블로 표시

---

### 2.6 D6. 자동 저장 전략

#### 온톨로지 버전 관리 관점

현재 모델:
- 변경사항은 `changes` (프론트엔드 zustand 상태)에 누적
- 사용자가 수동으로 CommitBar에서 "커밋" → `commits` + `commit_details` 생성
- 커밋 후 선택적으로 Neo4j 푸시

**자동 저장의 딜레마**:
- **너무 잦은 저장** (keystroke 단위): 의미 없는 커밋이 쌓여 이력의 가치가 떨어짐
- **너무 드문 저장**: 브라우저 크래시 시 작업 유실

#### 제안: 2계층 자동 저장

**Layer 1: Draft 자동 저장 (마이크로 저장)**
- Supabase에 직접 API 호출로 변경사항 즉시 반영 (현재도 이미 하고 있음)
- `changes` 상태는 "아직 커밋하지 않은 변경" 추적용
- 브라우저 종료 시 데이터 유실 없음 (이미 Supabase에 저장됨)
- **추가할 것**: `localStorage`에 `lastSavedAt` 타임스탬프 + 미저장 변경 목록을 backup

**Layer 2: Auto-commit (의미 있는 단위 저장)**
- 트리거 조건 (OR):
  - 마지막 사용자 액션으로부터 30초 idle
  - 미커밋 변경사항이 10개 이상 누적
  - 탭 visibility 변경 (사용자가 다른 탭으로 이동)
  - 브라우저 `beforeunload` 이벤트
- 자동 커밋 메시지 형식: `Auto-save: {변경 요약}` (예: "Auto-save: 3 classes added, 2 properties modified")
- 수동 커밋과 구분: `commits` 테이블에 `isAutoSave: boolean` 컬럼 추가 (또는 message prefix로 구분)

**Layer 2의 구현 위치**:

```typescript
// ontology/src/features/ontology/hooks/useAutoSave.ts

function useAutoSave() {
  const changes = useOntologyStore((s) => s.changes);
  const commitChanges = useOntologyStore((s) => s.commitChanges);

  // Debounced auto-commit
  useEffect(() => {
    if (changes.length === 0) return;

    const timer = setTimeout(() => {
      const summary = summarizeChanges(changes);
      commitChanges(`Auto-save: ${summary}`);
    }, 30_000); // 30초 idle

    return () => clearTimeout(timer);
  }, [changes, commitChanges]);

  // Threshold-based auto-commit
  useEffect(() => {
    if (changes.length >= 10) {
      const summary = summarizeChanges(changes);
      commitChanges(`Auto-save: ${summary}`);
    }
  }, [changes.length]);

  // Visibility change
  useEffect(() => {
    const handler = () => {
      if (document.hidden && changes.length > 0) {
        commitChanges(`Auto-save: tab hidden`);
      }
    };
    document.addEventListener('visibilitychange', handler);
    return () => document.removeEventListener('visibilitychange', handler);
  }, [changes, commitChanges]);
}
```

**Neo4j 푸시와의 관계**: 자동 저장 커밋은 Neo4j에 자동 푸시하지 않음. Neo4j 푸시는 항상 사용자의 명시적 액션 필요.

---

## 3. 상호운용성 전략

### 3.1 네임스페이스 관리 (Export 시)

내부적으로는 UUID를 계속 사용하되, Export 시 IRI를 생성하는 전략:

```typescript
// ontology/src/lib/export/namespace.ts

interface NamespaceConfig {
  baseUri: string;           // 기본: 'http://ontology-studio.local/ontology/'
  prefixes: Record<string, string>;  // 사용자 정의 prefix
}

// 기본 prefix 매핑
const DEFAULT_PREFIXES = {
  'owl': 'http://www.w3.org/2002/07/owl#',
  'rdfs': 'http://www.w3.org/2000/01/rdf-schema#',
  'rdf': 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
  'xsd': 'http://www.w3.org/2001/XMLSchema#',
  'skos': 'http://www.w3.org/2004/02/skos/core#',
  'dc': 'http://purl.org/dc/elements/1.1/',
  'schema': 'http://schema.org/',
};

// 엔티티 IRI 생성 규칙:
// Class: {baseUri}class/{sanitized_name}  (UUID fallback)
// Property: {baseUri}property/{className}/{propertyName}
// Instance: {baseUri}instance/{className}/{sanitized_name}
// Relation: {baseUri}relation/{sanitized_name}
```

**사용자 설정**: 향후 Settings 패널에서 `baseUri`를 커스텀 도메인으로 변경 가능하게 (예: `http://example.com/ontology/semiconductor/`)

### 3.2 Import 지원 우선순위

| 포맷 | 우선순위 | 난이도 | 라이브러리 |
|------|---------|-------|-----------|
| 자체 JSON (현재) | v3 ✅ 완료 | - | - |
| JSON-LD | v4 P0 | 중 | 없음 (자체 파서) |
| OWL/XML | v4 P0 | 중-상 | `fast-xml-parser` |
| RDF/Turtle | v4 P2 | 상 | `n3.js` |
| CSV (클래스/인스턴스 일괄) | v4 P1 | 하 | `papaparse` |
| Protege .owl 파일 | v4 P1 | 중 (OWL/XML의 subset) | 위와 동일 |

### 3.3 라운드트립 보장

Export → Import → Export 시 데이터 손실이 없어야 한다:

1. **자체 JSON**: 완벽한 라운드트립 (UUID 보존)
2. **JSON-LD**: UUID를 `@id`의 fragment로 보존. Import 시 fragment에서 UUID 추출
3. **OWL/XML**: `rdf:about` 속성에 UUID 포함. Import 시 파싱하여 복원
4. **외부 OWL 파일 Import**: 새 UUID 생성, 원본 IRI를 `description` 또는 별도 `externalIri` 필드에 보존

---

## 4. 데이터 모델 변경 제안

### 4.1 필수 변경 (v4 Core)

**A. `classes` 테이블: `namespace` 컬럼 추가 (선택적)**

```sql
ALTER TABLE classes ADD COLUMN namespace text DEFAULT NULL;
-- NULL이면 기본 네임스페이스 사용
-- Export 시에만 활용, 내부 로직에는 영향 없음
```

**B. `commits` 테이블: `is_auto_save` 컬럼 추가**

```sql
ALTER TABLE commits ADD COLUMN is_auto_save boolean NOT NULL DEFAULT false;
```

**C. `properties` 테이블: `inherited_from_class_id` 컬럼 추가 (선택적)**

오버라이드된 프로퍼티를 추적하기 위한 선택적 컬럼:

```sql
ALTER TABLE properties ADD COLUMN inherited_from_class_id uuid
  REFERENCES classes(id) ON DELETE SET NULL;
-- NULL이면 자기 클래스 고유 프로퍼티
-- 값이 있으면 해당 상위 클래스에서 오버라이드한 것
```

> **대안**: DB 컬럼 없이 런타임 계산으로도 충분 (2.1에서 설명). DB 컬럼은 성능 최적화 또는 사용자가 명시적으로 "오버라이드" 한 프로퍼티를 구별할 때 유용.

### 4.2 스키마 변경 없이 해결 가능한 것

| 기능 | 접근 방법 |
|------|----------|
| 프로퍼티 상속 계산 | 런타임 ancestor chain 탐색 (DB 변경 불필요) |
| JSON-LD / OWL Export | Export 변환 레이어에서 처리 (DB 변경 불필요) |
| 도메인 템플릿 | 기존 Import API 활용 (DB 변경 불필요) |
| 온톨로지 자동 완성 | LLM 프롬프트 개선 (DB 변경 불필요) |
| Text2Cypher 개선 | 스키마 컨텍스트 확장 (DB 변경 불필요) |

---

## 5. 리스크 및 주의사항

### 5.1 프로퍼티 상속의 복잡성

| 리스크 | 영향 | 완화 방안 |
|--------|------|----------|
| 순환 상속 | 무한 루프 | 이미 `cyclic_isa` 검증 규칙 존재. 상속 계산 시 visited set 사용 |
| 깊은 계층 (10+ depth) | 성능 저하 | UI에서 경고 (5 depth 이상 시). 캐시 활용 |
| 프로퍼티 이름 충돌 | 같은 이름의 프로퍼티가 다른 depth에서 정의 | "가장 가까운 것 우선" 원칙 + UI에서 충돌 표시 |
| 오버라이드 후 상위 변경 | 상위 프로퍼티가 변경되면 오버라이드와 불일치 | 변경 시 하위 알림/동기화 옵션 제공 |

### 5.2 OWL 변환의 정보 손실

| 내부 모델 요소 | OWL 변환 시 손실 가능 | 대응 |
|--------------|---------------------|------|
| `positionX`, `positionY` | OWL에 시각적 위치 개념 없음 | annotation으로 보존 (`os:positionX`) |
| `color` | 표준 어노테이션 아님 | annotation으로 보존 (`os:displayColor`) |
| `sortOrder` | OWL에 없음 | annotation으로 보존 |
| `commitHistory` | OWL과 무관 | Export에서 제외 |
| `constraintRule` JSON | OWL Restriction으로 변환 가능한 것만 | 변환 가능한 것만 포함, 나머지 annotation |

### 5.3 LLM 자동 완성의 품질 관리

| 리스크 | 완화 방안 |
|--------|----------|
| Hallucination (존재하지 않는 관계 추천) | 기존 스키마 컨텍스트를 명시적으로 포함. "기존에 없는 것은 추천하지 말라" 지시 |
| 과도한 추천 (너무 많은 프로퍼티) | 최대 5개로 제한. confidence score 포함 |
| 문화적 맥락 오류 (한국어 도메인) | system prompt에 한국어 도메인 지식 예시 포함 |
| API 비용 | 자동 완성은 사용자 트리거 시에만 호출. debounce 적용 |

### 5.4 도메인 템플릿 유지보수

| 리스크 | 완화 방안 |
|--------|----------|
| 템플릿이 현실과 괴리 | 각 도메인 전문가 리뷰 필요 |
| 스키마 변경 시 템플릿 호환성 깨짐 | Import API에 버전 체크 유지. 마이그레이션 스크립트 |
| 사용자가 템플릿에 과도하게 의존 | "이 템플릿은 출발점입니다" 안내 + extensionPoints 표시 |

### 5.5 자동 저장과 커밋 이력

| 리스크 | 완화 방안 |
|--------|----------|
| 자동 커밋이 이력을 오염 | `isAutoSave` 플래그로 필터링 가능. 커밋 목록에서 그룹화/숨김 |
| 자동 커밋 메시지가 의미 없음 | 변경 요약 자동 생성 + 사용자가 나중에 메시지 수정(squash) 가능 |
| 자동 저장과 수동 커밋 충돌 | 자동 저장은 Supabase 직접 저장 + 변경 추적. 수동 커밋 시 자동 저장 분 포함 |

---

## 6. 구현 우선순위 제안

| 순서 | 기능 | 의존성 | 예상 복잡도 |
|------|------|--------|------------|
| 1 | 프로퍼티 상속 계산 로직 | 없음 | 중 |
| 2 | 프로퍼티 상속 RightPanel 시각화 | #1 | 중 |
| 3 | 도메인 템플릿 5종 데이터 작성 | 없음 | 중 (데이터 작업) |
| 4 | 템플릿 선택 UI + Import 연동 | #3 | 하 |
| 5 | JSON-LD Export 변환기 | 없음 | 중 |
| 6 | OWL/XML Export 변환기 | 없음 | 중-상 |
| 7 | LLM 스키마 컨텍스트 빌더 | 없음 | 중 |
| 8 | 온톨로지 자동 완성 UI | #7 | 중 |
| 9 | Text2Cypher 듀얼 모드 | #7 | 중 |
| 10 | Text2Cypher 결과 시각화 | #9 | 중-상 |
| 11 | 자동 저장 (useAutoSave 훅) | 없음 | 하-중 |
| 12 | JSON-LD / OWL Import 파서 | #5, #6 | 상 |

---

## 부록: 표준 온톨로지 참조

### A. 이 프로젝트에서 채택한 표준 매핑

| 표준 | 활용 영역 |
|------|----------|
| OWL 2 (W3C) | 클래스, 프로퍼티, 제약조건의 공식 의미론 |
| RDFS | 기본 어휘 (subClassOf, domain, range, label, comment) |
| SKOS | description의 대안 어노테이션 (skos:definition, skos:prefLabel) |
| Schema.org | 도메인 템플릿의 표준 매핑 힌트 |
| Dublin Core | 메타데이터 프로퍼티 (creator, date, title) |
| XSD | 데이터 타입 매핑 (string, integer, float, boolean, date) |

### B. 경쟁 도구 대비 포지셔닝

| 도구 | 표현력 | 대상 사용자 | Ontology Studio 차별점 |
|------|--------|-----------|----------------------|
| Protege | OWL Full | 온톨로지 전문가 | 더 친숙한 UI, LLM 지원 |
| TopBraid | OWL DL + SHACL | 엔터프라이즈 | 무료, 경량, 빠른 시작 |
| Palantir Ontology | 커스텀 | 데이터 엔지니어 | 독립 실행, 벤더 락인 없음 |
| Neo4j Browser | Cypher | 개발자 | 비주얼 편집, 코드 불필요 |
| **Ontology Studio** | **OWL Lite** | **도메인 전문가** | **LLM 구조화 + Git 패턴 + 시각적 편집** |
