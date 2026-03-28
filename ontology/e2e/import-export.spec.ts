import { test, expect } from '@playwright/test';

/**
 * Import / Export E2E Tests
 * - Export current ontology to JSON
 * - Import ontology JSON (replace strategy)
 * - Round-trip: export -> import -> verify
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
  const constraintsRes = await page.request.get('/api/constraints');
  const constraintsList = await constraintsRes.json();
  for (const c of constraintsList) {
    await page.request.delete(`/api/constraints/${c.id}`);
  }
}

test.describe('Export API', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupAll(page);
  });

  test('빈 온톨로지 내보내기 → 빈 배열 + 메타데이터', async ({ page }) => {
    const res = await page.request.get('/api/export');
    expect(res.status()).toBe(200);

    const body = await res.json();
    expect(body.version).toBe('1.0');
    expect(body.exportedAt).toBeTruthy();
    expect(body.ontology).toBeDefined();
    expect(body.ontology.classes).toEqual([]);
    expect(body.ontology.properties).toEqual([]);
    expect(body.ontology.instances).toEqual([]);
    expect(body.ontology.edges).toEqual([]);
    expect(body.stats.classes).toBe(0);
  });

  test('Content-Disposition 헤더 포함', async ({ page }) => {
    const res = await page.request.get('/api/export');
    const contentDisposition = res.headers()['content-disposition'];
    expect(contentDisposition).toContain('attachment');
    expect(contentDisposition).toContain('ontology-export-');
    expect(contentDisposition).toContain('.json');
  });

  test('데이터 있는 온톨로지 내보내기 → 카운트 일치', async ({ page }) => {
    // Seed data
    const cls1 = await (
      await page.request.post('/api/classes', {
        data: { name: 'ExportClass1', color: '#7c3aed' },
      })
    ).json();
    const cls2 = await (
      await page.request.post('/api/classes', {
        data: { name: 'ExportClass2', color: '#2563eb' },
      })
    ).json();
    await page.request.post('/api/properties', {
      data: { classId: cls1.id, name: 'prop1', dataType: 'string' },
    });
    await page.request.post('/api/instances', {
      data: { classId: cls1.id, name: 'INST-EXP-001' },
    });

    const res = await page.request.get('/api/export');
    const body = await res.json();

    expect(body.stats.classes).toBe(2);
    expect(body.stats.properties).toBe(1);
    expect(body.stats.instances).toBe(1);
    expect(body.ontology.classes.length).toBe(2);
  });
});

test.describe('Import API', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupAll(page);
  });

  test('replace 전략 — 기존 데이터 삭제 후 가져오기', async ({ page }) => {
    // Create initial data
    await page.request.post('/api/classes', {
      data: { name: 'OldClass', color: '#7c3aed' },
    });

    // Import with replace
    const importRes = await page.request.post('/api/import', {
      data: {
        version: '1.0',
        ontology: {
          classes: [
            {
              id: '11111111-1111-1111-1111-111111111111',
              name: 'ImportedClass',
              color: '#dc2626',
              positionX: 100,
              positionY: 200,
            },
          ],
          properties: [],
          instances: [],
          instanceValues: [],
          relationTypes: [],
          edges: [],
          axioms: [],
          axiomClasses: [],
          constraints: [],
        },
        strategy: 'replace',
      },
    });
    expect(importRes.status()).toBe(201);
    const importBody = await importRes.json();
    expect(importBody.success).toBe(true);
    expect(importBody.strategy).toBe('replace');
    expect(importBody.stats.classes).toBe(1);

    // Verify OldClass is gone, ImportedClass exists
    const classesRes = await page.request.get('/api/classes');
    const classes = await classesRes.json();
    expect(classes.length).toBe(1);
    expect(classes[0].name).toBe('ImportedClass');
  });

  test('merge 전략 — 기존 데이터 유지 + 추가', async ({ page }) => {
    await page.request.post('/api/classes', {
      data: { name: 'ExistingClass', color: '#7c3aed' },
    });

    const importRes = await page.request.post('/api/import', {
      data: {
        version: '1.0',
        ontology: {
          classes: [
            {
              id: '22222222-2222-2222-2222-222222222222',
              name: 'MergedClass',
              color: '#0891b2',
              positionX: 0,
              positionY: 0,
            },
          ],
          properties: [],
          instances: [],
          instanceValues: [],
          relationTypes: [],
          edges: [],
          axioms: [],
          axiomClasses: [],
          constraints: [],
        },
        strategy: 'merge',
      },
    });
    expect(importRes.status()).toBe(201);
    const importBody = await importRes.json();
    expect(importBody.stats.classes).toBe(1);

    // Both old and new should exist
    const classesRes = await page.request.get('/api/classes');
    const classes = await classesRes.json();
    expect(classes.length).toBe(2);
    const names = classes.map((c: { name: string }) => c.name).sort();
    expect(names).toEqual(['ExistingClass', 'MergedClass']);
  });

  test('잘못된 형식 → 400 에러', async ({ page }) => {
    const res = await page.request.post('/api/import', {
      data: { invalid: true },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe('Import-Export Round Trip', () => {
  test.beforeEach(async ({ page }) => {
    await cleanupAll(page);
  });

  test('내보내기 → 가져오기 라운드트립 — 데이터 무결성', async ({ page }) => {
    // Step 1: Seed ontology
    const cls1 = await (
      await page.request.post('/api/classes', {
        data: { name: 'RoundTripA', color: '#7c3aed', description: 'A class' },
      })
    ).json();
    const cls2 = await (
      await page.request.post('/api/classes', {
        data: { name: 'RoundTripB', color: '#2563eb', description: 'B class' },
      })
    ).json();
    await page.request.post('/api/properties', {
      data: { classId: cls1.id, name: 'weight', dataType: 'float' },
    });
    await page.request.post('/api/instances', {
      data: { classId: cls1.id, name: 'RT-INST-001' },
    });
    const rt = await (
      await page.request.post('/api/relation-types', {
        data: { name: 'roundtrip_rel_' + Date.now() },
      })
    ).json();
    await page.request.post('/api/edges', {
      data: {
        relationTypeId: rt.id,
        sourceId: cls1.id,
        targetId: cls2.id,
        sourceKind: 'class',
        targetKind: 'class',
      },
    });

    // Step 2: Export
    const exportRes = await page.request.get('/api/export');
    expect(exportRes.status()).toBe(200);
    const exported = await exportRes.json();

    expect(exported.stats.classes).toBe(2);
    expect(exported.stats.properties).toBe(1);
    expect(exported.stats.instances).toBe(1);
    expect(exported.stats.edges).toBe(1);
    expect(exported.stats.relationTypes).toBeGreaterThanOrEqual(1);

    // Step 3: Clean all data
    await cleanupAll(page);

    // Verify clean
    const emptyExport = await (await page.request.get('/api/export')).json();
    expect(emptyExport.stats.classes).toBe(0);

    // Step 4: Import the exported data
    const importRes = await page.request.post('/api/import', {
      data: {
        version: exported.version,
        ontology: exported.ontology,
        strategy: 'replace',
      },
    });
    expect(importRes.status()).toBe(201);
    const importBody = await importRes.json();
    expect(importBody.success).toBe(true);

    // Step 5: Re-export and compare
    const reExportRes = await page.request.get('/api/export');
    const reExported = await reExportRes.json();

    expect(reExported.stats.classes).toBe(exported.stats.classes);
    expect(reExported.stats.properties).toBe(exported.stats.properties);
    expect(reExported.stats.instances).toBe(exported.stats.instances);
    expect(reExported.stats.edges).toBe(exported.stats.edges);

    // Verify class names survived the round trip
    const reClassNames = reExported.ontology.classes
      .map((c: { name: string }) => c.name)
      .sort();
    const origClassNames = exported.ontology.classes
      .map((c: { name: string }) => c.name)
      .sort();
    expect(reClassNames).toEqual(origClassNames);
  });

  test('제약조건 포함 라운드트립', async ({ page }) => {
    // Create class + constraint
    const cls = await (
      await page.request.post('/api/classes', {
        data: { name: 'ConstraintRTClass', color: '#7c3aed' },
      })
    ).json();
    await page.request.post('/api/constraints', {
      data: {
        constraintType: 'cardinality',
        description: '라운드트립 제약',
        sourceClassId: cls.id,
        config: { min: 0, max: 10 },
        severity: 'warning',
        isActive: true,
      },
    });

    // Export
    const exported = await (await page.request.get('/api/export')).json();
    expect(exported.stats.constraints).toBe(1);

    // Clean + re-import
    await cleanupAll(page);
    const importRes = await page.request.post('/api/import', {
      data: {
        version: exported.version,
        ontology: exported.ontology,
        strategy: 'replace',
      },
    });
    expect(importRes.status()).toBe(201);

    // Verify constraint survived
    const constraintsRes = await page.request.get('/api/constraints');
    const constraints = await constraintsRes.json();
    expect(constraints.length).toBe(1);
    expect(constraints[0].constraintType).toBe('cardinality');
    expect(constraints[0].description).toBe('라운드트립 제약');
  });
});
