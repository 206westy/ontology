'use client';

import { Save, Clock, Database } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ConfirmCard } from '@/components/ui/confirm-card';

interface CachePromotionCardProps {
  patternName: string;
  saving?: boolean;
  onSave: () => void;
  onOnce: () => void;
}

// PRD-H H1/M1: 캐시 승격 카드. 발견/조정한 패턴을 캐시에 저장할지("저장") 이번만 쓸지("이번만").
// 저장하면 같은 도메인 재입력 시 재사용(수렴)된다.
// PRD-I §3: 공통 ConfirmCard 껍데기로 정규화.
export default function CachePromotionCard({
  patternName,
  saving = false,
  onSave,
  onOnce,
}: CachePromotionCardProps) {
  return (
    <ConfirmCard
      eyebrow={
        <span className="flex items-center gap-0.5">
          <Database className="h-2.5 w-2.5" />
          캐시 승격
        </span>
      }
      title={patternName}
      preview={
        <p className="text-xs text-muted-foreground">
          이 패턴을 캐시에 저장하면 같은 도메인에서 다시 재사용됩니다.
        </p>
      }
      actions={
        <>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 gap-0.5 px-2 text-xs"
            onClick={onOnce}
            disabled={saving}
          >
            <Clock className="h-3 w-3" />
            이번만
          </Button>
          <Button
            variant="default"
            size="sm"
            className="h-6 gap-0.5 px-2 text-xs"
            onClick={onSave}
            disabled={saving}
          >
            <Save className="h-3 w-3" />
            저장
          </Button>
        </>
      }
    />
  );
}
