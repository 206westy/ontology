'use client';

import { Loader2 } from 'lucide-react';

export default function CanvasSkeleton() {
  return (
    <div className="flex-1 relative bg-background animate-in fade-in duration-150">
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: 'radial-gradient(circle, currentColor 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
        <p className="text-xs text-muted-foreground">그래프를 불러오고 있습니다</p>
      </div>
    </div>
  );
}
