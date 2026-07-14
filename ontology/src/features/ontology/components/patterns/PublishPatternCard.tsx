'use client';

import { useState } from 'react';
import { Share2, Check, ShieldCheck } from 'lucide-react';
import { ConfirmCard } from '@/components/ui/confirm-card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { buildPublishPreview } from '../../lib/patterns/publish';
import type { Pattern } from '../../lib/patterns/types';

// PRD-BM-D01 (M2-3): 공유 패턴 발행 카드(ConfirmCard 문법).
// 민감 식별자 마스킹 프리뷰 + 헬스 + 라이선스 경고(미확인 시 동의 게이트) + 스코프 선택.
// 자동 발행 없음 — 항상 HITL. 첫 공유 단위 기본값 org(조직 공유).

type PublishVisibility = 'org' | 'public';

const VISIBILITY_OPTIONS: { value: PublishVisibility; label: string; hint: string }[] = [
  { value: 'org', label: '조직 공유', hint: '조직 내에서만' },
  { value: 'public', label: '공개', hint: '공개 카탈로그' },
];

interface PublishPatternCardProps {
  pattern: Pattern;
  onPublish: (args: { visibility: PublishVisibility; acknowledgeLicense: boolean }) => void;
  onCancel?: () => void;
  isPublishing?: boolean;
  applied?: boolean;
}

export function PublishPatternCard({
  pattern,
  onPublish,
  onCancel,
  isPublishing,
  applied,
}: PublishPatternCardProps) {
  const [visibility, setVisibility] = useState<PublishVisibility>('org');
  const [acknowledged, setAcknowledged] = useState(false);

  const preview = buildPublishPreview(pattern);
  const displayName = pattern.nameKo?.trim() ? pattern.nameKo : pattern.name;
  const needsAck = preview.licenseWarning != null;
  const blocked = needsAck && !acknowledged;

  const maskCount =
    preview.maskedRoles.filter((r, i) => r.name !== pattern.roles[i]?.name).length;

  const evidence = (
    <>
      헬스 {preview.health}
      {preview.hasMaskedIdentifiers
        ? ` · 민감 식별자 마스킹됨${maskCount > 0 ? ` (${maskCount})` : ''}`
        : ' · 마스킹할 식별자 없음'}
    </>
  );

  const publishPreview = (
    <div className="space-y-2">
      {/* 스코프 선택 */}
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-muted-foreground">공유 범위</span>
        <div className="inline-flex rounded-md border border-border p-0.5">
          {VISIBILITY_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setVisibility(opt.value)}
              className={cn(
                'rounded px-2 py-0.5 text-xs transition-colors',
                visibility === opt.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
              aria-pressed={visibility === opt.value}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* 라이선스 동의 게이트 */}
      {needsAck && (
        <label className="flex cursor-pointer items-start gap-1.5 rounded-md bg-warning/5 px-2 py-1.5 text-xs">
          <Checkbox
            checked={acknowledged}
            onCheckedChange={(v) => setAcknowledged(v === true)}
            className="mt-0.5"
            aria-label="라이선스 검토 동의"
          />
          <span className="text-muted-foreground">
            {preview.licenseWarning} 검토했으며 발행에 동의합니다.
          </span>
        </label>
      )}
    </div>
  );

  return (
    <ConfirmCard
      eyebrow={
        <span className="flex items-center gap-0.5">
          <Share2 className="h-2.5 w-2.5" />
          발행
        </span>
      }
      attention={needsAck}
      title={<>{displayName}을(를) 공유 패턴으로 발행</>}
      evidence={evidence}
      preview={publishPreview}
      applied={applied}
      actions={
        <>
          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={onCancel}
              disabled={isPublishing}
            >
              취소
            </Button>
          )}
          <Button
            variant="default"
            size="sm"
            className="h-6 gap-0.5 px-2 text-xs"
            disabled={isPublishing || applied || blocked}
            onClick={() => onPublish({ visibility, acknowledgeLicense: acknowledged })}
          >
            {applied ? <Check className="h-3 w-3" /> : <ShieldCheck className="h-3 w-3" />}
            {applied ? '발행됨' : isPublishing ? '발행 중…' : '발행'}
          </Button>
        </>
      }
    />
  );
}
