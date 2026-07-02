// 출처 유형(sourceType) → 비전문가용 한국어 라벨.
// provenance 표시(RightPanel 상세 인라인 + 근거 탭)에서 공유한다. 신규 라벨 창작 금지 — 단일 진실원.
export const SOURCE_TYPE_LABEL: Record<string, string> = {
  session_doc: '세션 문서',
  existing_graph: '기존 그래프',
  web: '웹',
  inferred: '추론',
  document: '문서',
  sap: 'SAP',
  user: '직접 입력',
};

export function sourceTypeLabel(sourceType?: string | null): string {
  if (!sourceType) return '';
  return SOURCE_TYPE_LABEL[sourceType] ?? sourceType;
}
