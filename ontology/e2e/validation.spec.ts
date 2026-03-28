import { test, expect } from '@playwright/test';

/**
 * Validation API E2E Tests
 * - POST /api/validate with various rule sets
 * - Constraints CRUD
 * - Edge cases (cyclic is-a, orphan nodes, similar names)
 */

async function cleanupAll(page: import('@playwright/test').Page) {
  const classesRes = await page.request.get('/api/classes');
  const classes = await classesRes.json();
  for (const cls of classes) {
    await page.request.delete(`/api/classes/${cls.id}`);
  }
  const rtRes = await page.request.get('/api/relation-types');
  const rts = await rtRes.json();
  for (const rt of rts) {
    await page.request.delete(`/api/relation-types/${rt.id}`);
  }
  // Clean constraints
  const constraintsRes = await page.request.get('/api/constraints');
  const constraintsList = await constraintsRes.json();
  for (const c of constraintsList) {
    await page.request.delete(`/api/constraints/${c.id}`);
  }
}

test.describe('Validation API', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupAll(page);
  });

  // ─── Basic Validation ─────────────────────────────────────

  test('빈 온톨로지 검증 → 이슈 0건', async ({ page }) => {
    const res = await page.request.post('/api/validate', {
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.runId).toBeTruthy();
    expect(body.summary.total).toBe(0);
    expect(body.summary.errors).toBe(0);
    expect(body.summary.warnings).toBe(0);
    expect(body.summary.infos).toBe(0);
  });

  test('특정 규칙만 실행 → rules 배열 필터링', async ({ page }) => {
    const res = await page.request.post('/api/validate', {
      data: { rules: ['orphan_nodes'] },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.runId).toBeTruthy();
    // Only orphan_nodes rule should have been run
    for (const issue of [...body.errors, ...body.warnings, ...body.infos]) {
      expect(issue.ruleCode).toBe('orphan_nodes');
    }
  });

  test('잘못된 규칙 이름 → 400 에러', async ({ page }) => {
    const res = await page.request.post('/api/validate', {
      data: { rules: ['nonexistent_rule'] },
    });
    expect(res.status()).toBe(400);
  });

  // ─── Orphan Node Detection ────────────────────────────────

  test('orphan_nodes — 고립 클래스 감지', async ({ page }) => {
    // Create a class with no edges, no children, no instances
    await page.request.post('/api/classes', {
      data: { name: 'OrphanClass', color: '#7c3aed' },
    });

    const res = await page.request.post('/api/validate', {
      data: { rules: ['orphan_nodes'] },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.summary.infos).toBeGreaterThanOrEqual(1);
    const orphanIssue = body.infos.find(
      (i: { ruleCode: string }) => i.ruleCode === 'orphan_nodes',
    );
    expect(orphanIssue).toBeTruthy();
    expect(orphanIssue.message).toContain('OrphanClass');
  });

  test('orphan_nodes — 인스턴스가 있는 클래스는 고아가 아님', async ({ page }) => {
    const cls = await (
      await page.request.post('/api/classes', {
        data: { name: 'NonOrphan', color: '#2563eb' },
      })
    ).json();
    await page.request.post('/api/instances', {
      data: { classId: cls.id, name: 'INST-001' },
    });

    const res = await page.request.post('/api/validate', {
      data: { rules: ['orphan_nodes'] },
    });
    const body = await res.json();

    const orphanIssues = body.infos.filter(
      (i: { ruleCode: string; message: string }) =>
        i.ruleCode === 'orphan_nodes' && i.message.includes('NonOrphan'),
    );
    expect(orphanIssues.length).toBe(0);
  });

  // ─── Similar Names Detection ──────────────────────────────

  test('similar_names — 동일 이름 감지', async ({ page }) => {
    // Create two classes with same name but different parents
    const parent = await (
      await page.request.post('/api/classes', {
        data: { name: 'Parent', color: '#7c3aed' },
      })
    ).json();
    await page.request.post('/api/classes', {
      data: { name: 'Equipment', color: '#2563eb' },
    });
    await page.request.post('/api/classes', {
      data: { name: 'Equipment', color: '#dc2626', parentId: parent.id },
    });

    const res = await page.request.post('/api/validate', {
      data: { rules: ['similar_names'] },
    });
    const body = await res.json();

    expect(body.summary.warnings).toBeGreaterThanOrEqual(1);
    const dupIssue = body.warnings.find(
      (i: { ruleCode: string }) => i.ruleCode === 'similar_names',
    );
    expect(dupIssue).toBeTruthy();
    expect(dupIssue.message).toContain('동일');
  });

  // ─── Required Properties ──────────────────────────────────

  test('required_properties — 필수 프로퍼티 누락 감지', async ({ page }) => {
    const cls = await (
      await page.request.post('/api/classes', {
        data: { name: 'ReqPropClass', color: '#7c3aed' },
      })
    ).json();

    // Create required property
    await page.request.post('/api/properties', {
      data: {
        classId: cls.id,
        name: 'serial_number',
        dataType: 'string',
        isRequired: true,
      },
    });

    // Create instance WITHOUT filling the required property
    await page.request.post('/api/instances', {
      data: { classId: cls.id, name: 'MissingReqPropInst' },
    });

    const res = await page.request.post('/api/validate', {
      data: { rules: ['required_properties'] },
    });
    const body = await res.json();

    expect(body.summary.errors).toBeGreaterThanOrEqual(1);
    const reqIssue = body.errors.find(
      (i: { ruleCode: string }) => i.ruleCode === 'required_properties',
    );
    expect(reqIssue).toBeTruthy();
    expect(reqIssue.message).toContain('serial_number');
  });

  // ─── All Rules Combined ───────────────────────────────────

  test('전체 규칙 실행 → runId + summary 구조 확인', async ({ page }) => {
    await page.request.post('/api/classes', {
      data: { name: 'AllRulesClass', color: '#7c3aed' },
    });

    const res = await page.request.post('/api/validate', {
      data: {},
    });
    expect(res.status()).toBe(200);
    const body = await res.json();

    expect(body.runId).toBeTruthy();
    expect(typeof body.summary.total).toBe('number');
    expect(typeof body.summary.errors).toBe('number');
    expect(typeof body.summary.warnings).toBe('number');
    expect(typeof body.summary.infos).toBe('number');
    expect(Array.isArray(body.errors)).toBe(true);
    expect(Array.isArray(body.warnings)).toBe(true);
    expect(Array.isArray(body.infos)).toBe(true);
  });
});

test.describe('Constraints CRUD', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupAll(page);
  });

  test('제약조건 생성 → 조회 → 수정 → 삭제', async ({ page }) => {
    const cls = await (
      await page.request.post('/api/classes', {
        data: { name: 'ConstraintTestClass', color: '#7c3aed' },
      })
    ).json();

    // CREATE
    const createRes = await page.request.post('/api/constraints', {
      data: {
        constraintType: 'cardinality',
        description: '테스트 카디널리티 제약',
        sourceClassId: cls.id,
        config: { min: 1, max: 5 },
        severity: 'error',
        isActive: true,
      },
    });
    expect(createRes.status()).toBe(201);
    const created = await createRes.json();
    expect(created.id).toBeTruthy();
    expect(created.constraintType).toBe('cardinality');

    // READ
    const getRes = await page.request.get(`/api/constraints/${created.id}`);
    expect(getRes.status()).toBe(200);
    const fetched = await getRes.json();
    expect(fetched.description).toBe('테스트 카디널리티 제약');

    // UPDATE
    const patchRes = await page.request.patch(`/api/constraints/${created.id}`, {
      data: { description: '수정된 제약', severity: 'warning' },
    });
    expect(patchRes.status()).toBe(200);
    const patched = await patchRes.json();
    expect(patched.description).toBe('수정된 제약');
    expect(patched.severity).toBe('warning');

    // DELETE
    const deleteRes = await page.request.delete(`/api/constraints/${created.id}`);
    expect(deleteRes.status()).toBe(200);

    // VERIFY DELETED
    const verifyRes = await page.request.get(`/api/constraints/${created.id}`);
    expect(verifyRes.status()).toBe(404);
  });

  test('필터링 조회 — constraintType 파라미터', async ({ page }) => {
    const cls = await (
      await page.request.post('/api/classes', {
        data: { name: 'FilterTest', color: '#7c3aed' },
      })
    ).json();

    await page.request.post('/api/constraints', {
      data: {
        constraintType: 'cardinality',
        sourceClassId: cls.id,
        config: { min: 1 },
      },
    });
    await page.request.post('/api/constraints', {
      data: {
        constraintType: 'disjoint',
        sourceClassId: cls.id,
        config: {},
      },
    });

    const res = await page.request.get('/api/constraints?constraintType=cardinality');
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.length).toBe(1);
    expect(body[0].constraintType).toBe('cardinality');
  });

  test('잘못된 constraintType → 400', async ({ page }) => {
    const res = await page.request.post('/api/constraints', {
      data: {
        constraintType: 'invalid_type',
        config: {},
      },
    });
    expect(res.status()).toBe(400);
  });

  test('존재하지 않는 제약조건 조회 → 404', async ({ page }) => {
    const fakeId = '00000000-0000-0000-0000-000000000000';
    const res = await page.request.get(`/api/constraints/${fakeId}`);
    expect(res.status()).toBe(404);
  });
});
