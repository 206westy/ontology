'use client';

import { Search } from 'lucide-react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { PatternCatalogQuery } from '../../ontology/api';

// PRD-BM-D01 (M1-3): 카탈로그 필터·정렬 바. 검색(q) + 정렬 + 공유 스코프.

interface MarketplaceFiltersProps {
  query: PatternCatalogQuery;
  onChange: (next: PatternCatalogQuery) => void;
  total: number;
}

const SORTS: { value: string; label: string }[] = [
  { value: 'occurrence', label: '많이 쓰인 순' },
  { value: 'health', label: '헬스 높은 순' },
  { value: 'recent', label: '최신 순' },
];

// 기본(all→visibility 미지정)은 공유 카탈로그(org+public)만. private 은 "내 비공개"로 명시 조회.
const VISIBILITIES: { value: string; label: string }[] = [
  { value: 'all', label: '공유 카탈로그' },
  { value: 'org', label: '조직 공유' },
  { value: 'public', label: '공개' },
  { value: 'private', label: '내 비공개' },
];

export function MarketplaceFilters({ query, onChange, total }: MarketplaceFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* 검색 */}
      <div className="relative min-w-[200px] flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          value={query.q ?? ''}
          onChange={(e) => onChange({ ...query, q: e.target.value || undefined })}
          placeholder="도메인·패턴 이름 검색"
          aria-label="패턴 검색"
          className="h-9 w-full rounded-lg border border-border bg-background pl-8 pr-3 text-sm outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-ring/30"
        />
      </div>

      {/* 공유 스코프 */}
      <Select
        value={query.visibility ?? 'all'}
        onValueChange={(v) => onChange({ ...query, visibility: v === 'all' ? undefined : v })}
      >
        <SelectTrigger className="h-9 w-[130px] text-sm" aria-label="공유 스코프 필터">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {VISIBILITIES.map((v) => (
            <SelectItem key={v.value} value={v.value} className="text-sm">
              {v.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* 정렬 */}
      <Select
        value={query.sort ?? 'occurrence'}
        onValueChange={(v) => onChange({ ...query, sort: v })}
      >
        <SelectTrigger className="h-9 w-[140px] text-sm" aria-label="정렬 기준">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {SORTS.map((s) => (
            <SelectItem key={s.value} value={s.value} className="text-sm">
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <span className="ml-auto whitespace-nowrap text-xs tabular-nums text-muted-foreground">
        {total}개 패턴
      </span>
    </div>
  );
}
