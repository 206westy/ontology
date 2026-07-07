import type { ChangeOperation } from './types';

// PRD-J M3: 3-way 병합 diff 엔진 (순수 함수 — 클라이언트/서버 공용).
//
// base  = 브랜치 분기 시점(branches.base_commit_id)
// mine  = 브랜치 커밋들의 순변화(net delta)
// theirs= 분기 이후 main 커밋들의 순변화
//
// 같은 대상(targetTable:targetId)을 양쪽이 건드렸을 때만 충돌 후보이며,
// 판정 규칙은 PRD-J §3 표를 따른다. 해소는 항목 단위 mine/theirs (MVP).

export interface DiffDetail {
  operation: ChangeOperation;
  targetTable: string;
  targetId: string;
  beforeSnapshot?: Record<string, unknown> | null;
  afterSnapshot?: Record<string, unknown> | null;
}

export interface NetChange {
  key: string; // `${targetTable}:${targetId}`
  operation: ChangeOperation;
  targetTable: string;
  targetId: string;
  // 체인 최초의 before(=base 시점 상태)와 최종 after.
  beforeSnapshot: Record<string, unknown> | null;
  afterSnapshot: Record<string, unknown> | null;
}

export interface MergeConflict {
  key: string;
  targetTable: string;
  targetId: string;
  targetName: string;
  reason: 'mod-mod' | 'mod-del' | 'del-mod' | 'add-add';
  mine: NetChange;
  theirs: NetChange;
}

export interface MergePlan {
  // 충돌 없이 main 에 적용 가능한 브랜치 순변화.
  autoApply: NetChange[];
  conflicts: MergeConflict[];
  // 양쪽이 동일한 결과에 도달해 적용이 불필요한 항목(정보용).
  identical: NetChange[];
}

export type ConflictChoice = 'mine' | 'theirs';

export interface ConflictResolution {
  key: string;
  choice: ConflictChoice;
}

const keyOf = (d: { targetTable: string; targetId: string }) =>
  `${d.targetTable}:${d.targetId}`;

// 같은 대상의 변경 체인을 하나의 순변화로 접는다.
// ADD→MOD…→MOD = ADD(최종), ADD→…→DEL = 무변화(제거), MOD→…→DEL = DEL,
// DEL→ADD = MOD(교체). before 는 최초 것, after 는 최종 것을 유지한다.
export function computeNetDelta(details: DiffDetail[]): Map<string, NetChange> {
  const net = new Map<string, NetChange>();

  for (const d of details) {
    const key = keyOf(d);
    const prev = net.get(key);

    if (!prev) {
      net.set(key, {
        key,
        operation: d.operation,
        targetTable: d.targetTable,
        targetId: d.targetId,
        beforeSnapshot: d.beforeSnapshot ?? null,
        afterSnapshot: d.afterSnapshot ?? null,
      });
      continue;
    }

    if (d.operation === 'DEL') {
      if (prev.operation === 'ADD') {
        // 이 체인 안에서 생겼다 사라짐 — base 관점에선 무변화.
        net.delete(key);
      } else {
        net.set(key, { ...prev, operation: 'DEL', afterSnapshot: null });
      }
      continue;
    }

    // ADD/MOD 후속: 연산 종류는 체인 시작이 결정(ADD 유지 / MOD 유지 / DEL→ADD=MOD).
    const nextOp: ChangeOperation =
      prev.operation === 'DEL' ? 'MOD' : prev.operation;
    net.set(key, {
      ...prev,
      operation: nextOp,
      afterSnapshot: d.afterSnapshot ?? null,
    });
  }

  return net;
}

function snapshotsEqual(
  a: Record<string, unknown> | null,
  b: Record<string, unknown> | null,
): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  // 위치·타임스탬프처럼 의미 없는 필드는 동일성 비교에서 제외한다.
  const IGNORE = new Set(['createdAt', 'updatedAt', 'positionX', 'positionY']);
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) {
    if (IGNORE.has(k)) continue;
    if (JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)) {
      return false;
    }
  }
  return true;
}

function nameOf(change: NetChange): string {
  const snap = change.afterSnapshot ?? change.beforeSnapshot;
  const name = snap && (snap as { name?: unknown }).name;
  return typeof name === 'string' && name ? name : change.targetId.slice(0, 8);
}

// mine(브랜치) 순변화 vs theirs(main since base) 순변화 → 병합 계획.
export function buildMergePlan(
  mine: Map<string, NetChange>,
  theirs: Map<string, NetChange>,
): MergePlan {
  const autoApply: NetChange[] = [];
  const conflicts: MergeConflict[] = [];
  const identical: NetChange[] = [];

  for (const [key, m] of mine) {
    const t = theirs.get(key);

    // main 이 그 대상을 건드리지 않음 → 자동 적용.
    if (!t) {
      autoApply.push(m);
      continue;
    }

    // 양쪽이 같은 결과 → 적용 불필요(멱등).
    if (
      m.operation === t.operation &&
      (m.operation === 'DEL' || snapshotsEqual(m.afterSnapshot, t.afterSnapshot))
    ) {
      identical.push(m);
      continue;
    }

    const conflict = (reason: MergeConflict['reason']) =>
      conflicts.push({
        key,
        targetTable: m.targetTable,
        targetId: m.targetId,
        targetName: nameOf(m),
        reason,
        mine: m,
        theirs: t,
      });

    if (m.operation === 'DEL' && t.operation === 'DEL') {
      identical.push(m); // 결과 동일(삭제) — 위 분기에서 걸리지만 방어적으로.
    } else if (m.operation === 'DEL') {
      conflict('del-mod');
    } else if (t.operation === 'DEL') {
      conflict('mod-del');
    } else if (m.operation === 'ADD' && t.operation === 'ADD') {
      conflict('add-add');
    } else {
      conflict('mod-mod');
    }
  }

  return { autoApply, conflicts, identical };
}

// 해소 선택을 반영한 최종 적용 목록. 미해소 충돌이 남으면 null 대신 목록으로 반환하고
// 호출부가 차단한다(부분 병합 금지).
export function applyResolutions(
  plan: MergePlan,
  resolutions: ConflictResolution[],
): { effective: NetChange[]; unresolved: MergeConflict[] } {
  const byKey = new Map(resolutions.map((r) => [r.key, r.choice]));
  const effective: NetChange[] = [...plan.autoApply];
  const unresolved: MergeConflict[] = [];

  for (const c of plan.conflicts) {
    const choice = byKey.get(c.key);
    if (!choice) {
      unresolved.push(c);
      continue;
    }
    if (choice === 'mine') {
      // 브랜치 쪽 선택: mod-del(=main 이 지운 대상 수정)은 재생성이 필요하므로
      // main 에 없는 대상의 MOD 를 ADD 로 승격한다.
      const op =
        c.mine.operation === 'MOD' && c.theirs.operation === 'DEL'
          ? ('ADD' as const)
          : c.mine.operation;
      effective.push({ ...c.mine, operation: op });
    }
    // 'theirs' = main 유지 → 아무것도 적용하지 않음.
  }

  return { effective, unresolved };
}

// 적용 순서: 생성은 의존 대상 먼저, 삭제는 자식 먼저 (batch 라우트와 동일 규약).
const CREATE_ORDER: Record<string, number> = {
  classes: 0,
  relation_types: 1,
  properties: 2,
  instances: 3,
  instance_values: 4,
  edges: 5,
};
const DELETE_ORDER: Record<string, number> = {
  edges: 1,
  instance_values: 2,
  instances: 3,
  properties: 4,
  relation_types: 5,
  classes: 6,
};

export function sortForApplication(changes: NetChange[]): NetChange[] {
  const rank = (c: NetChange) => {
    if (c.operation === 'DEL') {
      return 1000 + (DELETE_ORDER[c.targetTable] ?? 99);
    }
    return CREATE_ORDER[c.targetTable] ?? 99;
  };
  return [...changes].sort((a, b) => rank(a) - rank(b));
}
