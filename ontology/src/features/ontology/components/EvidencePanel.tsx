'use client';

import { FileSearch, ArrowRight, ArrowLeft } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { confidenceBand, CONFIDENCE_BAND_LABEL } from '@/components/ui/confirm-card';
import { sourceTypeLabel } from '../lib/source-type-labels';
import type { LineageSummary } from '../lib/lineage/lineage';

// PRD-N M5: 계보 요약(생성·변경·발행)을 한 줄로. 날짜는 YYYY-MM-DD 로 간결히.
function fmtDay(iso: string | null): string {
  return iso ? iso.slice(0, 10) : '—';
}

// PRD-I M5: 근거(투명성) 탭. 데이터 모델에 이미 영속화된 provenance(sourceType/evidence/confidence)를
// 노드/관계 단위로 드러낸다. M6 결정: AI confidence 원시값(%)은 재현 불가능 신호라 노출하지 않고,
// 정성 밴드(높음/보통/낮음)로만 병기한다.

export interface EvidenceProvenance {
  sourceType?: string | null;
  evidence?: string | null;
  confidence?: number | null;
}

export interface EdgeEvidence extends EvidenceProvenance {
  id: string;
  relationName: string;
  direction: 'out' | 'in';
  otherName: string;
}

interface EvidencePanelProps {
  nodeName: string;
  nodeProvenance?: EvidenceProvenance | null;
  edgeEvidence: EdgeEvidence[];
  // PRD-N M5: 노드 계보(커밋 체인 요약). 없으면 계보 섹션 생략.
  lineage?: LineageSummary | null;
}

// evidence 텍스트가 실제 근거인지(‘existing’ 같은 placeholder 제외) 판별.
function hasEvidenceText(evidence?: string | null): boolean {
  return !!evidence && evidence !== 'existing';
}

function hasProvenance(p?: EvidenceProvenance | null): boolean {
  return !!p && (!!p.sourceType || hasEvidenceText(p.evidence));
}

// 신뢰도를 정성 밴드로만 표기(원시 % 금지).
function ConfidenceBandChip({ confidence }: { confidence?: number | null }) {
  if (confidence == null) return null;
  return (
    <Badge variant="outline" className="h-5 px-1 text-xs text-muted-foreground shrink-0">
      신뢰도 {CONFIDENCE_BAND_LABEL[confidenceBand(confidence)]}
    </Badge>
  );
}

function SourceTypeBadge({ sourceType }: { sourceType?: string | null }) {
  if (!sourceType) return null;
  return (
    <Badge variant="outline" className="h-5 px-1 text-xs text-muted-foreground shrink-0">
      {sourceTypeLabel(sourceType)}
    </Badge>
  );
}

function EvidenceQuote({ evidence }: { evidence?: string | null }) {
  if (!hasEvidenceText(evidence)) return null;
  return (
    <p
      className="text-xs leading-snug text-muted-foreground/70 italic line-clamp-3"
      title={evidence ?? undefined}
    >
      &ldquo;{evidence}&rdquo;
    </p>
  );
}

export default function EvidencePanel({ nodeName, nodeProvenance, edgeEvidence, lineage }: EvidencePanelProps) {
  const nodeHasProvenance = hasProvenance(nodeProvenance);
  const edgesWithProvenance = edgeEvidence.filter((e) => hasProvenance(e));
  const hasLineage = !!lineage && lineage.totalEvents > 0;
  const isEmpty = !nodeHasProvenance && edgesWithProvenance.length === 0 && !hasLineage;

  if (isEmpty) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 h-full">
        <div className="text-center">
          <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
            <FileSearch className="w-5 h-5 text-muted-foreground" />
          </div>
          <p className="text-xs text-muted-foreground">근거 정보 없음</p>
          <p className="mt-1 text-xs text-muted-foreground/70 leading-snug">
            이 노드는 출처·근거가 기록되지 않았습니다
          </p>
        </div>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full">
      <div className="px-4 py-3">
        <p className="text-xs leading-snug text-muted-foreground/70">
          이 정보가 어디서 왔는지 보여줍니다. AI 확신도는 재현이 어려운 신호라 정성 등급(높음·보통·낮음)으로만 표기합니다.
        </p>
      </div>

      <Separator />

      {/* PRD-N M5: 계보(어디서 왔나) — 생성·변경·발행을 한 화면에서 추적 */}
      {hasLineage && lineage && (
        <>
          <div className="px-4 py-2 space-y-1" data-testid="evidence-lineage">
            <span className="text-xs font-semibold tracking-tight text-foreground/80">
              계보 (어디서 왔나)
            </span>
            <div className="space-y-0.5 text-xs text-muted-foreground">
              <p>
                생성: {fmtDay(lineage.createdAt)}
                {lineage.createdBy ? ` · ${lineage.createdBy}` : ''}
              </p>
              <p>
                변경: {lineage.changeCount}회 · 최근 {fmtDay(lineage.lastChangedAt)}
              </p>
              <p className="flex items-center gap-1">
                발행:{' '}
                {lineage.publishedAt ? (
                  <>
                    {fmtDay(lineage.publishedAt)}
                    {lineage.versionTag && (
                      <Badge variant="outline" className="h-4 px-1 text-xs">
                        {lineage.versionTag}
                      </Badge>
                    )}
                  </>
                ) : (
                  '미발행'
                )}
              </p>
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* 노드 출처 */}
      {nodeHasProvenance && (
        <>
          <div className="px-4 py-2 space-y-1.5">
            <div className="flex items-center gap-1.5 mb-1">
              <span className="text-xs font-semibold tracking-tight text-foreground/80">노드 출처</span>
            </div>
            <div className="flex items-center flex-wrap gap-1">
              <span className="text-xs text-foreground truncate">{nodeName}</span>
              <SourceTypeBadge sourceType={nodeProvenance?.sourceType} />
              <ConfidenceBandChip confidence={nodeProvenance?.confidence} />
            </div>
            <EvidenceQuote evidence={nodeProvenance?.evidence} />
          </div>
          <Separator />
        </>
      )}

      {/* 관계 출처 */}
      {edgesWithProvenance.length > 0 && (
        <div className="px-4 py-2">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="text-xs font-semibold tracking-tight text-foreground/80">관계 출처</span>
            <span className="text-xs font-mono text-muted-foreground ml-auto">
              ({edgesWithProvenance.length})
            </span>
          </div>
          <div className="space-y-2">
            {edgesWithProvenance.map((edge) => (
              <div key={edge.id} className="space-y-1 rounded border border-border/60 px-2 py-1.5">
                <div className="flex items-center flex-wrap gap-1">
                  {edge.direction === 'out' ? (
                    <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  ) : (
                    <ArrowLeft className="w-3 h-3 text-muted-foreground shrink-0" />
                  )}
                  <Badge
                    variant="secondary"
                    className="h-5 text-xs px-1.5 font-normal bg-info-light text-info border-info/30 shrink-0"
                  >
                    {edge.relationName}
                  </Badge>
                  <span className="text-xs text-foreground truncate">{edge.otherName}</span>
                  <SourceTypeBadge sourceType={edge.sourceType} />
                  <ConfidenceBandChip confidence={edge.confidence} />
                </div>
                <EvidenceQuote evidence={edge.evidence} />
              </div>
            ))}
          </div>
        </div>
      )}
    </ScrollArea>
  );
}
