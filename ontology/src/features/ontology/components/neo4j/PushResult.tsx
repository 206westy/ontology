'use client';

import { Check, AlertTriangle, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';

export interface PushError {
  label: string;
  message: string;
}

interface PushResultProps {
  success: boolean;
  totalQueries: number;
  successCount: number;
  failedCount: number;
  errors: PushError[];
  durationMs: number;
  onClose: () => void;
  onRetryFailed?: () => void;
  onSkipFailed?: () => void;
}

export default function PushResult({
  success,
  totalQueries,
  successCount,
  failedCount,
  errors,
  durationMs,
  onClose,
  onRetryFailed,
  onSkipFailed,
}: PushResultProps) {
  const durationSec = (durationMs / 1000).toFixed(1);

  if (success) {
    return (
      <div className="flex flex-col items-center py-6 space-y-4">
        <div className="w-12 h-12 rounded-full bg-success/10 flex items-center justify-center">
          <Check className="w-6 h-6 text-success" />
        </div>
        <div className="text-center space-y-1">
          <p className="text-sm font-semibold text-foreground">
            Neo4j에 성공적으로 반영되었습니다
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {totalQueries}/{totalQueries} 쿼리 완료 · {durationSec}초
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1"
            onClick={() => window.open('http://localhost:7474', '_blank')}
          >
            <ExternalLink className="w-3 h-3" />
            Neo4j 브라우저에서 확인
          </Button>
          <Button size="sm" className="h-7 text-xs" onClick={onClose}>
            닫기
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-warning/10 flex items-center justify-center shrink-0">
          <AlertTriangle className="w-5 h-5 text-warning" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">푸시 부분 실패</p>
          <p className="text-xs text-muted-foreground font-mono">
            <span className="text-success">{successCount}/{totalQueries} 성공</span>
            {' · '}
            <span className="text-destructive">{failedCount}건 실패</span>
          </p>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="space-y-1.5">
          <h4 className="text-xs font-semibold text-muted-foreground">실패 항목:</h4>
          {errors.map((err, i) => (
            <div
              key={i}
              className="flex items-start gap-2 text-xs py-1 px-2 rounded bg-destructive/5 border border-destructive/10"
            >
              <span className="text-destructive shrink-0 mt-0.5 font-bold">✗</span>
              <div>
                <span className="text-foreground">{err.label}</span>
                <span className="text-muted-foreground ml-1">— {err.message}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="flex items-center justify-end gap-2">
        {onRetryFailed && (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onRetryFailed}>
            실패 건만 재시도
          </Button>
        )}
        {onSkipFailed && (
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onSkipFailed}>
            건너뛰기
          </Button>
        )}
        <Button size="sm" className="h-7 text-xs" onClick={onClose}>
          닫기
        </Button>
      </div>
    </div>
  );
}
