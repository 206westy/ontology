'use client';

import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Box } from 'lucide-react';

export default function ExplorerSkeleton() {
  return (
    <aside className="w-[260px] min-w-[260px] h-full flex flex-col border-r border-border bg-card animate-in fade-in duration-150">
      {/* Logo */}
      <div className="flex items-center gap-2 px-4 h-[52px] shrink-0">
        <div className="w-7 h-7 rounded-lg bg-primary flex items-center justify-center">
          <Box className="w-4 h-4 text-primary-foreground" />
        </div>
        <div className="flex flex-col gap-1">
          <span className="font-semibold text-sm tracking-tight leading-tight">Ontology Studio</span>
          <Skeleton className="h-2.5 w-20" />
        </div>
      </div>

      <Separator />

      {/* Search skeleton */}
      <div className="px-3 py-2.5 shrink-0">
        <Skeleton className="h-8 w-full rounded-md" />
      </div>

      {/* Tree skeleton */}
      <div className="flex-1 px-4 py-3 space-y-2">
        <Skeleton className="h-3 w-16 mb-3" />
        <Skeleton className="h-5 w-36" />
        <Skeleton className="h-5 w-28 ml-5" />
        <Skeleton className="h-5 w-32 ml-10" />
        <Skeleton className="h-5 w-24 ml-5" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-5 w-20 ml-5" />
        <Skeleton className="h-5 w-36" />
      </div>
    </aside>
  );
}
