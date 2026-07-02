'use client';

import { Save, Clock, Database } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface CachePromotionCardProps {
  patternName: string;
  saving?: boolean;
  onSave: () => void;
  onOnce: () => void;
}

// PRD-H H1/M1: 캐시 승격 카드. 발견/조정한 패턴을 캐시에 저장할지("저장") 이번만 쓸지("이번만").
// 저장하면 같은 도메인 재입력 시 재사용(수렴)된다.
export default function CachePromotionCard({
  patternName,
  saving = false,
  onSave,
  onOnce,
}: CachePromotionCardProps) {
  return (
    <div className="rounded-lg border border-border p-2">
      <div className="mb-1 flex flex-wrap items-center gap-1.5">
        <Badge variant="secondary" className="h-4 gap-0.5 px-1 text-[9px]">
          <Database className="h-2.5 w-2.5" />
          캐시 승격
        </Badge>
      </div>

      <p className="text-[11px] font-medium">{patternName}</p>
      <p className="mt-0.5 text-[10px] text-muted-foreground">
        이 패턴을 캐시에 저장하면 같은 도메인에서 다시 재사용됩니다.
      </p>

      <div className="mt-1.5 flex flex-wrap justify-end gap-1.5">
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-0.5 px-2 text-[10px]"
          onClick={onOnce}
          disabled={saving}
        >
          <Clock className="h-3 w-3" />
          이번만
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-6 gap-0.5 px-2 text-[10px]"
          onClick={onSave}
          disabled={saving}
        >
          <Save className="h-3 w-3" />
          저장
        </Button>
      </div>
    </div>
  );
}
