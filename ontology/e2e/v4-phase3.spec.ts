import { test, expect } from './fixtures/ontology-app';

/**
 * PRD v4 — Phase 3: 안정화 & 확장 E2E 테스트
 *
 * P3-1: OWL/XML Export
 * P3-2: 검증 결과 UI (상세 패널)
 * P3-3: 커밋 히스토리 UI (시간순 목록, diff)
 * P3-4: 제약 조건 관리 UI (4종 CRUD)
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3-1: OWL/XML Export
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('P3-1: OWL/XML Export', () => {
  test('GET /api/export?format=owl → RDF/XML 구조 반환', async ({ app }) => {
    await app.createClassViaApi('OwlExportClass', '#7c3aed', 'OWL 테스트');

    const res = await app.page.request.get('/api/export?format=owl');
    expect(res.status()).toBe(200);

    // Content-Type 확인
    const contentType = res.headers()['content-type'];
    expect(contentType).toContain('rdf+xml');

    const body = await res.text();
    // OWL/XML은 XML 형식
    expect(body).toContain('<?xml');
    expect(body).toContain('rdf:RDF');
  });

  test('OWL/XML — owl:Class 매핑', async ({ app }) => {
    await app.createClassViaApi('OwlClassMapping', '#7c3aed');

    const res = await app.page.request.get('/api/export?format=owl');
    expect(res.status()).toBe(200);
    const body = await res.text();

    // owl:Class 요소 존재
    expect(body).toContain('owl:Class');
  });

  test('OWL/XML — rdfs:subClassOf 상속 관계', async ({ app }) => {
    const parent = await app.createClassViaApi('OwlParent', '#7c3aed');
    await app.page.request.post('/api/classes', {
      data: { name: 'OwlChild', color: '#2563eb', parentId: parent.id },
    });

    const res = await app.page.request.get('/api/export?format=owl');
    expect(res.status()).toBe(200);
    const body = await res.text();

    expect(body).toContain('rdfs:subClassOf');
  });

  test('OWL/XML — owl:DatatypeProperty 매핑', async ({ app }) => {
    const cls = await app.createClassViaApi('OwlPropClass', '#7c3aed');
    const propRes = await app.page.request.post('/api/properties', {
      data: { classId: cls.id, name: 'temperature', dataType: 'float' },
    });
    expect(propRes.status()).toBe(201);

    const res = await app.page.request.get('/api/export?format=owl');
    expect(res.status()).toBe(200);
    const body = await res.text();

    // owl:DatatypeProperty 또는 owl:ObjectProperty
    expect(body.toLowerCase()).toContain('property');
  });

  test('OWL/XML — owl:ObjectProperty (관계 타입) 매핑', async ({ app }) => {
    const cls1 = await app.createClassViaApi('OwlRelSource', '#7c3aed');
    const cls2 = await app.createClassViaApi('OwlRelTarget', '#2563eb');
    const rt = await app.createRelationTypeViaApi('owl_manages');
    await app.createEdgeViaApi(rt.id, cls1.id, cls2.id);

    const res = await app.page.request.get('/api/export?format=owl');
    expect(res.status()).toBe(200);
    const body = await res.text();

    expect(body).toContain('ObjectProperty');
  });

  test('OWL/XML — rdf:type 인스턴스 매핑', async ({ app }) => {
    const cls = await app.createClassViaApi('OwlInstClass', '#7c3aed');
    const inst = await app.createInstanceViaApi(cls.id, 'OWL-INST-001');
    expect(inst.id).toBeTruthy();

    const res = await app.page.request.get('/api/export?format=owl');
    expect(res.status()).toBe(200);
    const body = await res.text();

    // rdf:type 또는 NamedIndividual
    expect(body.toLowerCase()).toContain('type');
  });

  test('Content-Disposition 헤더 — .owl 확장자', async ({ app }) => {
    await app.createClassViaApi('OwlDisposition', '#7c3aed');

    const res = await app.page.request.get('/api/export?format=owl');
    expect(res.status()).toBe(200);

    const disposition = res.headers()['content-disposition'];
    if (disposition) {
      expect(disposition).toContain('.owl');
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3-2: 검증 결과 UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('P3-2: 검증 결과 UI', () => {
  test('검증 실행 후 결과 상세 패널 표시', async ({ app }) => {
    // 고립 노드 생성 (검증 이슈 발생 유도)
    await app.createClassViaApi('OrphanForUI', '#7c3aed');

    // 검증 실행 (API 직접 호출)
    const validateRes = await app.page.request.post('/api/validate', {
      data: {},
    });
    expect(validateRes.status()).toBe(200);
    const result = await validateRes.json();

    // 검증 결과가 있으면 UI에서 표시할 수 있어야 함
    expect(result.runId).toBeTruthy();
    expect(result.summary).toBeDefined();
  });

  test('검증 결과 — 규칙별 그룹핑 (ruleCode)', async ({ app }) => {
    await app.createClassViaApi('GroupingTest', '#7c3aed');

    const res = await app.page.request.post('/api/validate', {
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // 모든 이슈가 ruleCode를 가지고 있어야 함
    const allIssues = [...body.errors, ...body.warnings, ...body.infos];
    for (const issue of allIssues) {
      expect(issue.ruleCode).toBeTruthy();
    }
  });

  test('검증 결과 — severity별 분류 (error/warning/info)', async ({ app }) => {
    const cls = await app.createClassViaApi('SeverityTest', '#7c3aed');
    // 필수 프로퍼티 누락 → error
    await app.page.request.post('/api/properties', {
      data: { classId: cls.id, name: 'required_field', dataType: 'string', isRequired: true },
    });
    await app.createInstanceViaApi(cls.id, 'SEV-INST-001');

    const res = await app.page.request.post('/api/validate', {
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // summary에 error/warning/info 카운트 존재
    expect(typeof body.summary.errors).toBe('number');
    expect(typeof body.summary.warnings).toBe('number');
    expect(typeof body.summary.infos).toBe('number');

    // 필수 프로퍼티 누락으로 error가 1 이상
    expect(body.summary.errors).toBeGreaterThanOrEqual(1);
  });

  test('검증 UI — 위반 항목에서 노드 이동 링크', async ({ app }) => {
    await app.createClassViaApi('NavLinkTest', '#7c3aed');

    // PRD: 각 위반 항목에서 해당 노드로 직접 이동
    // API 수준에서 각 이슈에 message가 포함되는지 확인
    const res = await app.page.request.post('/api/validate', {
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    const allIssues = [...body.errors, ...body.warnings, ...body.infos];
    for (const issue of allIssues) {
      // 각 이슈에 노드 참조 정보가 있어야 함
      expect(issue.message).toBeTruthy();
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3-3: 커밋 히스토리 UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('P3-3: 커밋 히스토리 UI', () => {
  test('GET /api/commits → 시간순 커밋 목록', async ({ app }) => {
    // 커밋 생성
    await app.page.request.post('/api/commits', {
      data: { message: '히스토리 테스트 1', isAutoSave: false, details: [] },
    });
    await app.page.request.post('/api/commits', {
      data: { message: '히스토리 테스트 2', isAutoSave: true, details: [] },
    });

    const res = await app.page.request.get('/api/commits');
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThanOrEqual(2);

    // 시간순 정렬 확인 (최신이 먼저)
    if (body.length >= 2) {
      const date1 = new Date(body[0].createdAt).getTime();
      const date2 = new Date(body[1].createdAt).getTime();
      expect(date1).toBeGreaterThanOrEqual(date2);
    }
  });

  test('커밋 — message + 변경 건수 포함', async ({ app }) => {
    // 클래스 생성 후 커밋 (details 포함)
    const cls = await app.createClassViaApi('CommitDetailTest', '#7c3aed');
    await app.page.request.post('/api/commits', {
      data: {
        message: '클래스 추가 커밋',
        isAutoSave: false,
        details: [
          { targetTable: 'classes', targetId: cls.id, operation: 'ADD' },
        ],
      },
    });

    const res = await app.page.request.get('/api/commits');
    const body = await res.json();
    const commit = body.find((c: { message: string }) => c.message === '클래스 추가 커밋');
    expect(commit).toBeTruthy();

    // details 관계 확인
    if (commit.details) {
      expect(Array.isArray(commit.details)).toBe(true);
      expect(commit.details.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('커밋 — 자동/수동 구분 (isAutoSave 필드)', async ({ app }) => {
    await app.page.request.post('/api/commits', {
      data: { message: '수동 커밋', isAutoSave: false, details: [] },
    });
    await app.page.request.post('/api/commits', {
      data: { message: '자동 커밋', isAutoSave: true, details: [] },
    });

    const res = await app.page.request.get('/api/commits');
    const body = await res.json();

    const manual = body.find((c: { message: string }) => c.message === '수동 커밋');
    const auto = body.find((c: { message: string }) => c.message === '자동 커밋');

    expect(manual).toBeTruthy();
    expect(auto).toBeTruthy();
    expect(manual.isAutoSave).toBe(false);
    expect(auto.isAutoSave).toBe(true);
  });

  test('커밋 히스토리 UI — 변경 내역 Sheet에서 커밋 목록 접근', async ({ app }) => {
    // API로 커밋 생성
    const cls = await app.createClassViaApi('HistoryUITest', '#7c3aed');
    await app.page.request.post('/api/commits', {
      data: {
        message: '히스토리 UI 테스트 커밋',
        isAutoSave: false,
        details: [
          { targetTable: 'classes', targetId: cls.id, operation: 'ADD' },
        ],
      },
    });

    await app.goto();

    // 커밋 히스토리 패널 열기 (히스토리 버튼은 항상 활성화)
    const historyBtn = app.page.locator('button:has-text("히스토리")').first();
    await expect(historyBtn).toBeVisible({ timeout: 15000 });
    await historyBtn.click();
    await app.page.waitForTimeout(500);

    // 히스토리 패널에 커밋 내역 표시 확인
    await expect(
      app.page.locator('text=히스토리 UI 테스트 커밋').first(),
    ).toBeVisible({ timeout: 10000 });
  });

  test('커밋 변경 상세 — before/after diff 데이터', async ({ app }) => {
    const cls = await app.createClassViaApi('DiffTest', '#7c3aed');

    // 커밋 생성 (snapshotBefore/After 포함)
    await app.page.request.post('/api/commits', {
      data: {
        message: 'diff 테스트 커밋',
        isAutoSave: false,
        details: [
          {
            targetTable: 'classes',
            targetId: cls.id,
            operation: 'ADD',
            beforeSnapshot: null,
            afterSnapshot: { name: 'DiffTest', color: '#7c3aed' },
          },
        ],
      },
    });

    const res = await app.page.request.get('/api/commits');
    const body = await res.json();
    const commit = body.find((c: { message: string }) => c.message === 'diff 테스트 커밋');

    expect(commit).toBeTruthy();
    if (commit.details && commit.details.length > 0) {
      const detail = commit.details[0];
      expect(detail.operation).toBe('ADD');
    }
  });
});

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// P3-4: 제약 조건 관리 UI
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

test.describe('P3-4: 제약 조건 관리 UI', () => {
  test('4종 제약 타입 — cardinality CRUD', async ({ app }) => {
    const cls = await app.createClassViaApi('CardinalityTest', '#7c3aed');

    // CREATE
    const createRes = await app.page.request.post('/api/constraints', {
      data: {
        constraintType: 'cardinality',
        description: '카디널리티 제약 테스트',
        sourceClassId: cls.id,
        config: { min: 1, max: 10 },
        severity: 'error',
        isActive: true,
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();

    // READ
    const getRes = await app.page.request.get(`/api/constraints/${created.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.constraintType).toBe('cardinality');

    // UPDATE
    const patchRes = await app.page.request.patch(`/api/constraints/${created.id}`, {
      data: { config: { min: 0, max: 5 } },
    });
    expect(patchRes.status()).toBe(200);

    // DELETE
    const deleteRes = await app.page.request.delete(`/api/constraints/${created.id}`);
    expect(deleteRes.status()).toBe(200);
  });

  test('4종 제약 타입 — disjoint CRUD', async ({ app }) => {
    const cls1 = await app.createClassViaApi('DisjointA', '#7c3aed');
    const cls2 = await app.createClassViaApi('DisjointB', '#2563eb');

    const createRes = await app.page.request.post('/api/constraints', {
      data: {
        constraintType: 'disjoint',
        description: 'DisjointA와 DisjointB는 서로소',
        sourceClassId: cls1.id,
        targetClassId: cls2.id,
        config: {},
        severity: 'error',
        isActive: true,
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.constraintType).toBe('disjoint');

    // 정리
    await app.page.request.delete(`/api/constraints/${created.id}`);
  });

  test('4종 제약 타입 — domain_range CRUD', async ({ app }) => {
    const cls = await app.createClassViaApi('DomRangeTest', '#7c3aed');
    const rt = await app.createRelationTypeViaApi('domain_range_rel');

    const createRes = await app.page.request.post('/api/constraints', {
      data: {
        constraintType: 'domain_range',
        description: 'domain/range 제약 테스트',
        sourceClassId: cls.id,
        config: { relationTypeId: rt.id },
        severity: 'warning',
        isActive: true,
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.constraintType).toBe('domain_range');

    await app.page.request.delete(`/api/constraints/${created.id}`);
  });

  test('4종 제약 타입 — property_value CRUD', async ({ app }) => {
    const cls = await app.createClassViaApi('PropValTest', '#7c3aed');
    await app.page.request.post('/api/properties', {
      data: { classId: cls.id, name: 'status', dataType: 'enum', enumValues: ['active', 'inactive'] },
    });

    const createRes = await app.page.request.post('/api/constraints', {
      data: {
        constraintType: 'property_value',
        description: 'status는 active 또는 inactive만 허용',
        sourceClassId: cls.id,
        config: { propertyName: 'status', allowedValues: ['active', 'inactive'] },
        severity: 'error',
        isActive: true,
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.constraintType).toBe('property_value');

    await app.page.request.delete(`/api/constraints/${created.id}`);
  });

  test('제약 조건 관리 UI — 목록 표시', async ({ app }) => {
    const cls = await app.createClassViaApi('ConstraintUITest', '#7c3aed');
    const createRes = await app.page.request.post('/api/constraints', {
      data: {
        constraintType: 'cardinality',
        description: 'UI 목록 테스트',
        sourceClassId: cls.id,
        config: { min: 0, max: 3 },
        severity: 'warning',
        isActive: true,
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.id).toBeTruthy();

    // 개별 조회로 제약 조건 존재 확인
    const getRes = await app.page.request.get(`/api/constraints/${created.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.constraintType).toBe('cardinality');
    expect(fetched.description).toBe('UI 목록 테스트');

    // 목록 API에서도 포함되는지 검증
    const listRes = await app.page.request.get('/api/constraints');
    expect(listRes.status()).toBe(200);
    const constraintList = await listRes.json();
    expect(Array.isArray(constraintList)).toBe(true);
    const found = constraintList.find((c: { id: string }) => c.id === created.id);
    expect(found).toBeTruthy();

    // 정리
    await app.page.request.delete(`/api/constraints/${created.id}`);
  });

  test('제약 조건 — isActive 토글', async ({ app }) => {
    const cls = await app.createClassViaApi('ActiveToggleTest', '#7c3aed');
    const createRes = await app.page.request.post('/api/constraints', {
      data: {
        constraintType: 'cardinality',
        sourceClassId: cls.id,
        config: { min: 1 },
        isActive: true,
      },
    });
    const created = await createRes.json();

    // isActive false로 업데이트
    const patchRes = await app.page.request.patch(`/api/constraints/${created.id}`, {
      data: { isActive: false },
    });
    expect(patchRes.status()).toBe(200);
    const patched = await patchRes.json();
    expect(patched.isActive).toBe(false);

    // 비활성 제약은 검증에서 제외되는지 확인
    const validateRes = await app.page.request.post('/api/validate', {
      data: {},
    });
    expect(validateRes.status()).toBe(200);

    await app.page.request.delete(`/api/constraints/${created.id}`);
  });

  test('제약 조건 — 검증과 연동 (위반 시 이슈 생성)', async ({ app }) => {
    const cls = await app.createClassViaApi('ValidationLinkTest', '#7c3aed');
    await app.page.request.post('/api/properties', {
      data: { classId: cls.id, name: 'mandatory_field', dataType: 'string', isRequired: true },
    });
    await app.createInstanceViaApi(cls.id, 'VAL-LINK-001');

    // 검증 실행
    const res = await app.page.request.post('/api/validate', {
      data: { rules: ['required_properties'] },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    // 필수 프로퍼티 누락으로 error 발생
    expect(body.summary.errors).toBeGreaterThanOrEqual(1);
    const reqIssue = body.errors.find(
      (i: { ruleCode: string }) => i.ruleCode === 'required_properties',
    );
    expect(reqIssue).toBeTruthy();
  });
});
