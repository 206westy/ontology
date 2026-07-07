import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, it, expect, vi } from 'vitest';

// PRD-L M6 (L7): 어휘집 기록은 신규 항목에만 임베딩을 시도한다. 테스트에서는
// 실제 OpenAI 호출을 막기 위해 embedOne 을 항상 거부시켜 backfill 을 no-op 로 만든다.
vi.mock('@/features/ontology/lib/embedding', () => ({
  embedOne: vi.fn().mockRejectedValue(new Error('no api key')),
}));

import { recordRelationTerm, recordRelationUsage } from '@/lib/relation-glossary';

// unique(normalized_term) upsert 를 인메모리로 흉내내는 가짜 db.
// recordRelationTerm 이 실제로 쓰는 체인만 구현: insert().values().onConflictDoUpdate().returning().
function createFakeGlossaryDb() {
  const store = new Map<
    string,
    { id: string; term: string; layer: string; occurrenceCount: number }
  >();
  const capturedSets: Record<string, unknown>[] = [];
  let idSeq = 0;

  const db = {
    insert() {
      const state: { values?: Record<string, any>; set?: Record<string, unknown> } = {};
      const builder: Record<string, any> = {
        values(v: Record<string, any>) {
          state.values = v;
          return builder;
        },
        onConflictDoUpdate(cfg: { set: Record<string, unknown> }) {
          state.set = cfg.set;
          return builder;
        },
        returning() {
          const v = state.values!;
          const key = v.normalizedTerm as string;
          const existing = store.get(key);
          if (existing) {
            // 충돌 갱신 경로: occurrence_count 만 +1, 원본(term/layer) 보존.
            capturedSets.push(state.set!);
            existing.occurrenceCount += 1;
            return Promise.resolve([
              { id: existing.id, occurrenceCount: existing.occurrenceCount },
            ]);
          }
          const id = `id-${++idSeq}`;
          store.set(key, {
            id,
            term: v.term as string,
            layer: v.layer as string,
            occurrenceCount: 1,
          });
          return Promise.resolve([{ id, occurrenceCount: 1 }]);
        },
      };
      return builder;
    },
  };

  return { db: db as any, store, capturedSets };
}

describe('recordRelationTerm — 지속 누적(단조 성장)', () => {
  it('① 여러 라운드에 걸쳐 서로 다른 이름이 단조 누적된다', async () => {
    const { db, store } = createFakeGlossaryDb();

    await recordRelationTerm(db, { name: 'causes' });
    await recordRelationTerm(db, { name: 'part of' });
    await recordRelationTerm(db, { name: 'located in' });
    expect(store.size).toBe(3);

    // 다음 라운드: 새 이름 2개 → 5항목(감소 없음).
    await recordRelationTerm(db, { name: 'requires' });
    await recordRelationTerm(db, { name: 'produces' });
    expect(store.size).toBe(5);
  });

  it('② 같은 이름 재등장(공백·대소문자 변형)은 1행·occurrence 증가·원본 term 불변', async () => {
    const { db, store } = createFakeGlossaryDb();

    await recordRelationTerm(db, { name: 'Causes' });
    await recordRelationTerm(db, { name: '  causes ' });
    await recordRelationTerm(db, { name: 'CAUSES' });

    expect(store.size).toBe(1);
    const row = [...store.values()][0];
    expect(row.occurrenceCount).toBe(3);
    // 원본 첫 표현을 보존한다(재등장이 term 을 덮어쓰지 않음).
    expect(row.term).toBe('Causes');
  });

  it('③ 충돌 경로의 UPDATE SET 은 occurrence_count·updated_at 만 담고 term/layer/meaning 은 제외한다', async () => {
    const { db, capturedSets } = createFakeGlossaryDb();

    await recordRelationTerm(db, { name: 'causes', layer: 'kinetic' });
    // 같은 정규화 키·다른 layer 로 재등장 → 충돌 갱신 발생.
    await recordRelationTerm(db, { name: 'causes', layer: 'semantic' });

    expect(capturedSets).toHaveLength(1);
    const set = capturedSets[0];
    expect(Object.keys(set).sort()).toEqual(['occurrenceCount', 'updatedAt']);
    expect(set).not.toHaveProperty('term');
    expect(set).not.toHaveProperty('layer');
    expect(set).not.toHaveProperty('meaning');
  });

  it('④ 임베딩 실패는 비치명 — 신규 항목은 그대로 기록되고 throw 하지 않는다', async () => {
    const { db, store } = createFakeGlossaryDb();

    // embedOne 은 거부되지만(위 mock) 기록 자체는 성공해야 한다.
    await expect(recordRelationTerm(db, { name: 'causes' })).resolves.toBeUndefined();
    expect(store.size).toBe(1);
  });

  it('④ DB 오류도 비치명 — recordRelationTerm 은 throw 하지 않는다', async () => {
    const badDb = {
      insert() {
        throw new Error('db down');
      },
    } as any;

    await expect(recordRelationTerm(badDb, { name: 'causes' })).resolves.toBeUndefined();
  });

  it('빈 문자열(공백만)은 no-op 이다', async () => {
    const { db, store } = createFakeGlossaryDb();

    await recordRelationTerm(db, { name: '   ' });
    expect(store.size).toBe(0);
  });
});

describe('recordRelationUsage — 엣지 생성(재사용 포함)도 재등장으로 축적', () => {
  // 가짜 db 에 relationTypes 조회를 얹는다(usage 는 id→이름/레이어 해소 후 기록).
  function withRelationTypes(
    base: ReturnType<typeof createFakeGlossaryDb>,
    types: Record<string, { name: string; layer: string }>,
  ) {
    base.db.query = {
      relationTypes: {
        findFirst: async ({ where }: { where: unknown }) => {
          // eq(relationTypes.id, X) 의 X 를 흉내 — 테스트에서는 id 를 직접 못 꺼내므로
          // 마지막 호출 id 를 클로저로 전달하는 대신, 단일 타입 시나리오로 검증한다.
          void where;
          const first = Object.values(types)[0];
          return first ?? null;
        },
      },
    };
    return base;
  }

  it('기존 유형 재사용 엣지가 반복되면 어휘집 1행의 occurrence 가 계속 자란다', async () => {
    const base = createFakeGlossaryDb();
    const { db, store } = withRelationTypes(base, {
      rt1: { name: '점검함', layer: 'kinetic' },
    });

    // 새 relation_type INSERT 없이 엣지만 3번 생성되는 시나리오.
    await recordRelationUsage(db, { relationTypeId: 'rt1', sourceRef: 'edge' });
    await recordRelationUsage(db, { relationTypeId: 'rt1', sourceRef: 'edge' });
    await recordRelationUsage(db, { relationTypeId: 'rt1', sourceRef: 'edge' });

    expect(store.size).toBe(1);
    const row = [...store.values()][0];
    expect(row.term).toBe('점검함');
    expect(row.layer).toBe('kinetic');
    expect(row.occurrenceCount).toBe(3);
  });

  it('유형 미존재(id 해소 실패)·db 오류는 비치명', async () => {
    const base = createFakeGlossaryDb();
    base.db.query = {
      relationTypes: { findFirst: async () => null },
    };
    await expect(
      recordRelationUsage(base.db, { relationTypeId: 'nope' }),
    ).resolves.toBeUndefined();
    expect(base.store.size).toBe(0);

    const badDb = {
      query: {
        relationTypes: {
          findFirst: async () => {
            throw new Error('db down');
          },
        },
      },
    } as any;
    await expect(
      recordRelationUsage(badDb, { relationTypeId: 'rt1' }),
    ).resolves.toBeUndefined();
  });
});

// 소스 레벨 검증: vitest 는 앱 루트(cwd)에서 실행되므로 src 기준 상대경로로 읽는다.
const readSrc = (relFromSrc: string): string =>
  readFileSync(resolve(process.cwd(), 'src', relFromSrc), 'utf8');

describe('⑤ 재주입 금지 게이트 + 초크포인트 배선', () => {
  it('추출/어시스트 프롬프트는 관계 어휘집을 참조하지 않는다(추출 프롬프트 재주입 0건)', () => {
    const parsePrompts = readSrc('features/ontology/lib/parse-prompts.ts');
    const assist = readSrc('app/api/llm/assist/route.ts');

    for (const src of [parsePrompts, assist]) {
      expect(src).not.toContain('relation_glossary');
      expect(src).not.toContain('relationGlossary');
      expect(src).not.toContain('recordRelationTerm');
    }
  });

  it('관계유형 생성 초크포인트는 모두 recordRelationTerm 을 호출한다', () => {
    const files: Record<string, string> = {
      relationTypes: readSrc('app/api/relation-types/route.ts'),
      batch: readSrc('app/api/batch/route.ts'),
      import: readSrc('app/api/import/route.ts'),
      merge: readSrc('app/api/merge-requests/[id]/merge/route.ts'),
    };

    for (const src of Object.values(files)) {
      expect(src).toContain("from '@/lib/relation-glossary'");
      expect(src).toContain('recordRelationTerm(');
    }

    expect(files.relationTypes).toContain("sourceRef: 'api'");
    expect(files.batch).toContain("sourceRef: 'batch'");
    expect(files.import).toContain("sourceRef: 'import'");
    expect(files.merge).toContain("sourceRef: 'merge'");
  });

  it('엣지 생성 초크포인트는 모두 recordRelationUsage(사용 기록)를 호출한다', () => {
    const files: Record<string, string> = {
      edges: readSrc('app/api/edges/route.ts'),
      bridges: readSrc('app/api/bridges/route.ts'),
      batch: readSrc('app/api/batch/route.ts'),
      import: readSrc('app/api/import/route.ts'),
      merge: readSrc('app/api/merge-requests/[id]/merge/route.ts'),
    };

    for (const src of Object.values(files)) {
      expect(src).toContain('recordRelationUsage(');
    }

    expect(files.edges).toContain("sourceRef: 'edge'");
    expect(files.bridges).toContain("sourceRef: 'bridge'");
    expect(files.batch).toContain("sourceRef: 'edge'");
    expect(files.import).toContain("sourceRef: 'import-edge'");
    expect(files.merge).toContain("sourceRef: 'merge-edge'");
  });
});
