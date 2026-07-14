'use client';

import { X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface Props {
  title: string;
  source?: string; // 근거경로(필수 표기): 어느 함수/데이터/시각
  onRemove?: () => void;
  children: React.ReactNode;
}

// PRD-PF-G: 위젯 프레임. 모든 위젯 하단에 근거경로 1줄(함수·데이터·시각) 필수 노출.
export default function WidgetFrame({ title, source, onRemove, children }: Props) {
  return (
    <Card className="flex flex-col p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="truncate text-sm font-medium">{title}</span>
        {onRemove && (
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onRemove} aria-label="위젯 제거">
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <div className="min-h-0 flex-1">{children}</div>
      {source && (
        <div className="mt-2 truncate text-[11px] text-muted-foreground" title={source}>
          근거: {source}
        </div>
      )}
    </Card>
  );
}
