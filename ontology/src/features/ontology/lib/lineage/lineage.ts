// PRD-N M5 (Steward 잔여): 계보·버전 정책 — 순수·결정론(LLM 불필요).
// 계보 = "이 노드가 어디서 왔나"(커밋 체인 요약). 버전 = 발행 스냅샷 구분 태그 + 구획별 변경 요약.

export type LineageOperation = 'ADD' | 'MOD' | 'DEL';

export interface LineageEvent {
  operation: LineageOperation;
  message: string;
  createdAt: string;
  authorEmail: string | null;
  pushedAt: string | null;
  versionTag: string | null;
}

export interface LineageSummary {
  createdAt: string | null;
  createdBy: string | null;
  lastChangedAt: string | null;
  // MOD(변경) 이벤트 수.
  changeCount: number;
  totalEvents: number;
  // 가장 최근 발행 시각·버전 태그(발행됐으면).
  publishedAt: string | null;
  versionTag: string | null;
}

// 노드의 커밋 이벤트들을 "생성·변경·발행" 한 줄 계보로 요약. 입력 순서 무관(내부 정렬).
export function summarizeLineage(events: LineageEvent[]): LineageSummary {
  if (events.length === 0) {
    return {
      createdAt: null,
      createdBy: null,
      lastChangedAt: null,
      changeCount: 0,
      totalEvents: 0,
      publishedAt: null,
      versionTag: null,
    };
  }

  const sorted = [...events].sort(
    (a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );

  const firstAdd = sorted.find((e) => e.operation === 'ADD') ?? sorted[0];
  const changeCount = sorted.filter((e) => e.operation === 'MOD').length;

  // 가장 최근 발행 이벤트(pushedAt 기준).
  let published: LineageEvent | null = null;
  for (const e of sorted) {
    if (!e.pushedAt) continue;
    if (!published || Date.parse(e.pushedAt) >= Date.parse(published.pushedAt!)) {
      published = e;
    }
  }

  return {
    createdAt: firstAdd.createdAt,
    createdBy: firstAdd.authorEmail,
    lastChangedAt: sorted[sorted.length - 1].createdAt,
    changeCount,
    totalEvents: sorted.length,
    publishedAt: published?.pushedAt ?? null,
    versionTag: published?.versionTag ?? null,
  };
}

// 발행 버전 태그 — 이전 발행(release) 수 기반 단조. 같은 발행 배치는 동일 태그.
export function computePublishVersion(priorReleaseCount: number): string {
  const n = Math.max(0, Math.floor(priorReleaseCount));
  return `v1.${n + 1}`;
}

// ─── 구획별 변경 요약 ─────────────────────────────────────────
export interface PartitionChange {
  partitionId: string;
  added: number;
  modified: number;
  deleted: number;
}
export interface ChangeSummary {
  byPartition: PartitionChange[];
  totals: { added: number; modified: number; deleted: number };
}

interface ChangeDetail {
  operation: string;
  targetTable: string;
  afterSnapshot?: Record<string, unknown> | null;
  beforeSnapshot?: Record<string, unknown> | null;
}

const NON_PARTITION_BUCKET = '기타';

// 발행 detail 을 구획별 ADD/MOD/DEL 로 집계. 클래스는 스냅샷의 partitionId 로,
// 그 외(인스턴스/엣지/관계유형 등)는 '기타' 버킷으로 묶는다(직접 partition 없음).
export function summarizeChangesByPartition(details: ChangeDetail[]): ChangeSummary {
  const map = new Map<string, PartitionChange>();
  const totals = { added: 0, modified: 0, deleted: 0 };

  const bump = (partitionId: string, op: string) => {
    if (!map.has(partitionId)) {
      map.set(partitionId, { partitionId, added: 0, modified: 0, deleted: 0 });
    }
    const rec = map.get(partitionId)!;
    if (op === 'ADD') {
      rec.added++;
      totals.added++;
    } else if (op === 'MOD') {
      rec.modified++;
      totals.modified++;
    } else if (op === 'DEL') {
      rec.deleted++;
      totals.deleted++;
    }
  };

  for (const d of details) {
    let partitionId = NON_PARTITION_BUCKET;
    if (d.targetTable === 'classes') {
      const snap = d.afterSnapshot ?? d.beforeSnapshot ?? {};
      const pid = snap.partitionId;
      partitionId = typeof pid === 'string' && pid.length > 0 ? pid : '(미지정)';
    }
    bump(partitionId, d.operation);
  }

  return { byPartition: [...map.values()], totals };
}
