'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';

export default function RightPanelSkeleton() {
  return (
    <aside className="w-[320px] min-w-[320px] h-full flex flex-col border-l border-border bg-card animate-in fade-in duration-150">
      {/* Header */}
      <div className="px-4 py-4 shrink-0">
        <div className="flex items-center gap-2 mb-2">
          <Skeleton className="w-3 h-3 rounded-full" />
          <Skeleton className="h-5 w-28" />
          <Skeleton className="h-4 w-12 ml-auto rounded" />
        </div>
        <Skeleton className="h-3 w-full" />
        <Skeleton className="h-3 w-3/4 mt-1" />
      </div>

      <Separator />

      {/* Subclasses section */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-8" />
        </div>
        <div className="space-y-1.5 ml-2">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>

      <Separator />

      {/* Properties section */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-3 w-8" />
        </div>
        <div className="space-y-1.5 ml-2">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-12" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-10" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-14" />
          </div>
        </div>
      </div>

      <Separator />

      {/* Relations section */}
      <div className="px-4 py-3">
        <div className="flex items-center justify-between mb-2">
          <Skeleton className="h-3 w-16" />
          <Skeleton className="h-3 w-8" />
        </div>
        <div className="space-y-1.5 ml-2">
          <Skeleton className="h-4 w-36" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
    </aside>
  );
}
