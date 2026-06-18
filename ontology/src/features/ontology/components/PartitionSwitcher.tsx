'use client';

import { useState } from 'react';
import { Layers, Plus, Check, Globe } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { useCreatePartition } from '../hooks/usePartitions';
import { toast } from 'sonner';

// PRD-B B-3: 구획 전환기 — 현재 구획 표시 + 전환 + 전체 보기 토글 + 새 구획.
export default function PartitionSwitcher() {
  const partitions = useOntologyStore((s) => s.partitions);
  const currentPartitionId = useOntologyStore((s) => s.currentPartitionId);
  const showAllPartitions = useOntologyStore((s) => s.showAllPartitions);
  const selectPartition = useOntologyStore((s) => s.selectPartition);
  const toggleShowAllPartitions = useOntologyStore((s) => s.toggleShowAllPartitions);
  const createPartition = useCreatePartition();

  const [open, setOpen] = useState(false);
  const [newName, setNewName] = useState('');

  const current = partitions.find((p) => p.id === currentPartitionId);
  const label = showAllPartitions ? '전체 구획' : (current?.name ?? '구획');

  const PALETTE = ['#2563eb', '#dc2626', '#16a34a', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#65a30d'];

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const color = PALETTE[partitions.length % PALETTE.length];
      const created = (await createPartition.mutateAsync({ name, description: '', color })) as { id: string };
      setNewName('');
      selectPartition(created.id);
      toast.success(`구획 "${name}" 생성됨`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '구획 생성 실패');
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5 max-w-[160px]" title="구획 선택">
          <Layers className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <button
          type="button"
          onClick={() => {
            toggleShowAllPartitions(true);
            setOpen(false);
          }}
          className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-muted ${showAllPartitions ? 'text-primary font-medium' : 'text-foreground'}`}
        >
          <Globe className="w-3.5 h-3.5" />
          <span className="flex-1 text-left">전체 구획 보기</span>
          {showAllPartitions && <Check className="w-3.5 h-3.5" />}
        </button>

        <div className="my-1 h-px bg-border" />

        <div className="max-h-56 overflow-y-auto">
          {partitions.map((p) => {
            const active = !showAllPartitions && p.id === currentPartitionId;
            return (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  selectPartition(p.id);
                  setOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-muted ${active ? 'text-primary font-medium' : 'text-foreground'}`}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: p.color }} />
                <span className="flex-1 text-left truncate">{p.name}</span>
                {active && <Check className="w-3.5 h-3.5" />}
              </button>
            );
          })}
        </div>

        <div className="my-1 h-px bg-border" />

        <div className="flex items-center gap-1.5 px-1 py-1">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleCreate();
              }
            }}
            placeholder="새 구획 이름"
            className="h-7 text-xs"
          />
          <Button
            size="sm"
            className="h-7 px-2 shrink-0"
            disabled={!newName.trim() || createPartition.isPending}
            onClick={handleCreate}
            title="새 구획 생성"
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
