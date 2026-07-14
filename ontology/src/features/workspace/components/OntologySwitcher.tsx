'use client';

import { useState, useEffect } from 'react';
import { Check, ChevronsUpDown, Plus, Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { useActiveOntology } from '../hooks/useActiveOntology';
import { toast } from 'sonner';

interface OntologyRow {
  id: string;
  name: string;
  slug: string;
  workspaceId: string;
}

/**
 * PRD-PF-A M5: 온톨로지 전환/생성 스위처(shadcn Popover).
 * 온톨로지 1개를 선택했을 때의 편집 경험은 오늘과 100% 동일 — 이 컨트롤은
 * "지금 어떤 온톨로지를 보고 있는가"라는 스코프 한 겹만 얹는다.
 * 전환은 의도적 컨텍스트 전환이므로 새 헤더로 전량 재로드한다.
 */
export default function OntologySwitcher() {
  const activeOntologyId = useActiveOntology((s) => s.activeOntologyId);
  const setActiveOntologyId = useActiveOntology((s) => s.setActiveOntologyId);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<OntologyRow[]>([]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/ontologies')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: OntologyRow[]) => setItems(Array.isArray(rows) ? rows : []))
      .catch(() => setItems([]));
  }, []);

  const active = items.find((o) => o.id === activeOntologyId);

  function switchTo(id: string) {
    setOpen(false);
    if (id === activeOntologyId) return;
    setActiveOntologyId(id);
    window.location.reload();
  }

  async function createOntology() {
    const name = newName.trim();
    if (!name || busy) return;
    setBusy(true);
    try {
      const res = await fetch('/api/ontologies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      if (!res.ok) throw new Error('create failed');
      const onto: OntologyRow = await res.json();
      toast.success(`온톨로지 "${onto.name}" 생성됨`);
      setActiveOntologyId(onto.id);
      window.location.reload();
    } catch {
      toast.error('온톨로지 생성에 실패했습니다.');
      setBusy(false);
    }
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 h-8"
          title="온톨로지 전환"
        >
          <Boxes className="w-4 h-4 text-primary" />
          <span className="max-w-[140px] truncate">
            {active?.name ?? '온톨로지'}
          </span>
          <ChevronsUpDown className="w-3.5 h-3.5 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1.5">
        <div className="text-xs font-medium text-muted-foreground px-2 py-1">
          온톨로지 전환
        </div>
        <div className="max-h-64 overflow-y-auto">
          {items.map((o) => (
            <button
              key={o.id}
              onClick={() => switchTo(o.id)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left"
            >
              <Check
                className={`w-4 h-4 shrink-0 ${o.id === activeOntologyId ? 'opacity-100 text-primary' : 'opacity-0'}`}
              />
              <span className="truncate">{o.name}</span>
            </button>
          ))}
        </div>
        <div className="border-t mt-1 pt-1">
          {creating ? (
            <div className="flex gap-1 px-1">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="새 온톨로지 이름"
                className="h-8 text-sm"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') createOntology();
                }}
              />
              <Button size="sm" className="h-8" onClick={createOntology} disabled={busy}>
                생성
              </Button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-2 py-1.5 text-sm rounded hover:bg-muted text-left text-primary"
            >
              <Plus className="w-4 h-4" /> 새 온톨로지
            </button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
