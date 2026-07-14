'use client';

import { useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { Boxes, Waypoints, HelpCircle, Sprout, Wand2, ShieldAlert, Share2 } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { hasUnverifiedLicense } from '../../ontology/lib/patterns/license';
import { buildSeedPreview } from '../../ontology/lib/patterns/seed';
import { PublishPatternCard } from '../../ontology/components/patterns/PublishPatternCard';
import type { Pattern } from '../../ontology/lib/patterns/types';
import { usePublishPattern } from '../hooks/usePublishPattern';
import { domainColorVar, methodLabel, VISIBILITY_LABEL } from '../lib/visuals';

// PRD-BM-D01 (M1-4): 패턴 상세 시트 — 역할·관계·CQ 전량 프리뷰(HITL) + 시딩.
// 결정적 시딩(프리뷰=HITL) 외에, 내 지식으로 맞춤 생성(기존 adapt 파이프라인)으로도 이어질 수 있다.

interface PatternDetailSheetProps {
  pattern: Pattern | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSeed: (pattern: Pattern) => void;
  isSeeding?: boolean;
  /** 전역 시딩 진행 중(중복 시딩 방지). */
  busy?: boolean;
}

function SectionTitle({ icon: Icon, children }: { icon: typeof Boxes; children: React.ReactNode }) {
  return (
    <h4 className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
      <Icon className="h-3.5 w-3.5" />
      {children}
    </h4>
  );
}

export function PatternDetailSheet({
  pattern,
  open,
  onOpenChange,
  onSeed,
  isSeeding,
  busy,
}: PatternDetailSheetProps) {
  const [mode, setMode] = useState<'view' | 'publish'>('view');
  const [prevPatternId, setPrevPatternId] = useState(pattern?.id);
  const publish = usePublishPattern();

  // 패턴이 바뀌면 발행 모드를 초기화. 이펙트 대신 렌더 단계 리셋(깜빡임 없음, React 권장 패턴).
  if (pattern?.id !== prevPatternId) {
    setPrevPatternId(pattern?.id);
    setMode('view');
  }

  if (!pattern) return null;

  const handlePublish = (args: { visibility: 'org' | 'public'; acknowledgeLicense: boolean }) => {
    publish.mutate(
      { id: pattern.id, ...args },
      {
        onSuccess: () => {
          toast.success('공유 패턴으로 발행했습니다.');
          setMode('view');
          onOpenChange(false);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : '발행에 실패했습니다.'),
      },
    );
  };

  const displayName = pattern.nameKo?.trim() ? pattern.nameKo : pattern.name;
  const preview = buildSeedPreview(pattern);
  const unverified = hasUnverifiedLicense(pattern);
  const visibility = pattern.visibility ?? 'private';
  const accent = domainColorVar(pattern.domain);
  const seedable = pattern.roles.length > 0;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-[440px] flex-col sm:max-w-[440px]">
        <SheetHeader className="space-y-1">
          <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <span aria-hidden className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} />
            {pattern.domain}
            <Badge variant="outline" className="ml-1 h-5 px-1.5 text-xs">
              {VISIBILITY_LABEL[visibility]}
            </Badge>
          </span>
          <SheetTitle className="text-lg">{displayName}</SheetTitle>
          <SheetDescription className="text-xs">
            출처 {pattern.sourceLabel ?? pattern.sourceRepo ?? '내부 캐시'} · 사용{' '}
            {pattern.occurrenceCount}회 · {methodLabel(pattern.method)}
            {unverified && (
              <span className="ml-1 inline-flex items-center gap-0.5 text-warning">
                <ShieldAlert className="h-3 w-3" />
                라이선스 미확인
              </span>
            )}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="-mx-2 flex-1 px-2">
          <div className="space-y-4 py-2">
            {/* 역할 */}
            <section>
              <SectionTitle icon={Boxes}>역할 {pattern.roles.length}</SectionTitle>
              <ul className="space-y-1">
                {pattern.roles.map((role) => (
                  <li key={role.name} className="rounded-md bg-muted/40 px-2 py-1.5 text-xs">
                    <span className="font-medium text-foreground">{role.name}</span>
                    {role.description && (
                      <span className="ml-1 text-muted-foreground">— {role.description}</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>

            {/* 관계 */}
            {pattern.relationTypes.length > 0 && (
              <section>
                <SectionTitle icon={Waypoints}>관계 {pattern.relationTypes.length}</SectionTitle>
                <ul className="space-y-1">
                  {pattern.relationTypes.map((rel, i) => (
                    <li
                      key={`${rel.sourceRole}-${rel.name}-${rel.targetRole}-${i}`}
                      className="flex items-center gap-1.5 rounded-md bg-muted/40 px-2 py-1.5 text-xs"
                    >
                      <span className="text-muted-foreground">{rel.sourceRole}</span>
                      <span className="font-mono font-medium text-primary">{rel.name}</span>
                      <span className="text-muted-foreground">{rel.targetRole}</span>
                      <Badge variant="outline" className="ml-auto h-4 px-1 text-[10px]">
                        {rel.layer}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* 역량 질문 */}
            {pattern.competencyQuestions.length > 0 && (
              <section>
                <SectionTitle icon={HelpCircle}>역량 질문 {pattern.competencyQuestions.length}</SectionTitle>
                <ul className="list-disc space-y-1 pl-4 text-xs text-muted-foreground">
                  {pattern.competencyQuestions.map((cq, i) => (
                    <li key={i}>{cq}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* 시딩 프리뷰(HITL) */}
            <div className="rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-xs">
              <span className="text-muted-foreground">이 패턴으로 시작하면 새 구획에 </span>
              <span className="font-medium text-foreground">
                클래스 {preview.classCount}개 · 관계 {preview.relationCount}개
              </span>
              <span className="text-muted-foreground">가 생성되며, 반영 전 캔버스에서 검토할 수 있습니다.</span>
              {preview.skippedRelations.length > 0 && (
                <span className="mt-1 block text-muted-foreground/70">
                  관계 {preview.skippedRelations.length}개는 역할 누락으로 제외됩니다.
                </span>
              )}
            </div>
          </div>
        </ScrollArea>

        {/* 액션 */}
        <div className="space-y-2 border-t border-border pt-3">
          {mode === 'publish' ? (
            <PublishPatternCard
              pattern={pattern}
              onPublish={handlePublish}
              onCancel={() => setMode('view')}
              isPublishing={publish.isPending}
            />
          ) : (
            <>
              <Button
                className="h-9 w-full gap-1.5"
                disabled={busy || !seedable}
                onClick={() => onSeed(pattern)}
              >
                <Sprout className="h-4 w-4" />
                {isSeeding ? '시딩 중…' : '이 패턴으로 시작'}
              </Button>
              <div className="flex gap-2">
                <Button
                  asChild
                  variant="ghost"
                  className="h-8 flex-1 gap-1.5 text-xs text-muted-foreground"
                >
                  <Link href="/?start=guided">
                    <Wand2 className="h-3.5 w-3.5" />
                    맞춤 생성
                  </Link>
                </Button>
                {visibility === 'private' && (
                  <Button
                    variant="ghost"
                    className="h-8 flex-1 gap-1.5 text-xs text-muted-foreground"
                    onClick={() => setMode('publish')}
                  >
                    <Share2 className="h-3.5 w-3.5" />
                    공유로 발행
                  </Button>
                )}
              </div>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
