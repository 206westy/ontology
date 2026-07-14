// PRD-PF-H M1: dirty 구획 선택(전량 재계산 금지). 요약 없음 또는 stale=true 만 재요약 대상.
export interface PartitionRef {
  id: string;
}
export interface SummaryRef {
  partitionId: string;
  stale: boolean;
}

export function selectPartitionsToRebuild(
  partitions: PartitionRef[],
  summaries: SummaryRef[],
  opts?: { force?: boolean },
): string[] {
  if (opts?.force) return partitions.map((p) => p.id);
  const byPart = new Map(summaries.map((s) => [s.partitionId, s]));
  return partitions
    .filter((p) => {
      const s = byPart.get(p.id);
      return !s || s.stale; // 요약 없음 or dirty
    })
    .map((p) => p.id);
}
