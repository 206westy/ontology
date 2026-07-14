'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sparkles, Copy, GitBranch, Layers, Loader2, Boxes } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { useActiveOntology } from '@/features/workspace/hooks/useActiveOntology';
import { problemsApi } from '../api';
import type { LinkMode } from '../schemas';

interface OntologyRow {
  id: string;
  name: string;
  description: string;
}

const MODES: {
  mode: LinkMode;
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  needsTarget: boolean;
}[] = [
  { mode: 'new', label: '새로 만들기', desc: '빈 온톨로지에서 시작', icon: Sparkles, needsTarget: false },
  { mode: 'reuse', label: '기존 재사용', desc: '기존 온톨로지를 그대로 참조', icon: Copy, needsTarget: true },
  { mode: 'extend', label: '기존 확장', desc: '같은 온톨로지에 이 문제 맥락을 쌓기', icon: Layers, needsTarget: true },
  { mode: 'branch', label: '분기', desc: '새 브랜치로 격리해 편집(머지 가능)', icon: GitBranch, needsTarget: true },
];

// PRD-PF-C M2: 온톨로지 연결(복리 재사용 핵심). define 확정 직후 진입.
export default function OntologyLinkPicker({ problemId }: { problemId: string }) {
  const router = useRouter();
  const setActiveOntologyId = useActiveOntology((s) => s.setActiveOntologyId);
  const [mode, setMode] = useState<LinkMode>('new');
  const [ontologies, setOntologies] = useState<OntologyRow[]>([]);
  const [targetId, setTargetId] = useState('');
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch('/api/ontologies')
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: OntologyRow[]) => setOntologies(Array.isArray(rows) ? rows : []))
      .catch(() => {});
  }, []);

  const activeMode = MODES.find((m) => m.mode === mode)!;

  async function confirm() {
    if (activeMode.needsTarget && !targetId) {
      toast.error('대상 온톨로지를 선택하세요.');
      return;
    }
    setBusy(true);
    try {
      const link = await problemsApi.createLink(problemId, {
        mode,
        ontologyId: activeMode.needsTarget ? targetId : undefined,
        newOntologyName: mode === 'new' ? newName.trim() || undefined : undefined,
      });
      // 스튜디오가 이 온톨로지를 편집하도록 활성 온톨로지 전환.
      setActiveOntologyId(link.ontologyId);
      toast.success('온톨로지를 연결했습니다.');
      router.push(`/problems/${problemId}/studio`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '연결에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-2xl mx-auto w-full py-6 space-y-5">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">이 문제, 어떤 온톨로지에서 시작할까요?</h2>
        <p className="text-sm text-muted-foreground">
          문제마다 온톨로지를 재사용·확장·분기하며 복리로 키웁니다.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {MODES.map((m) => {
          const Icon = m.icon;
          const selected = mode === m.mode;
          return (
            <button
              key={m.mode}
              onClick={() => setMode(m.mode)}
              className={cn(
                'flex items-start gap-3 rounded-lg border p-3 text-left transition-colors',
                selected ? 'border-primary bg-primary/5 ring-1 ring-primary/30' : 'border-border hover:bg-muted/40',
              )}
            >
              <Icon className={cn('w-5 h-5 mt-0.5 shrink-0', selected ? 'text-primary' : 'text-muted-foreground')} />
              <div className="space-y-0.5">
                <div className="text-sm font-medium">{m.label}</div>
                <div className="text-xs text-muted-foreground">{m.desc}</div>
              </div>
            </button>
          );
        })}
      </div>

      {mode === 'new' ? (
        <div className="space-y-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="새 온톨로지 이름 (비우면 문제명 기반 자동)"
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="text-sm font-medium">대상 온톨로지</div>
          {ontologies.length === 0 ? (
            <div className="text-xs text-muted-foreground rounded-lg border border-dashed border-border py-6 text-center">
              재사용할 온톨로지가 없습니다. "새로 만들기"를 선택하세요.
            </div>
          ) : (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {ontologies.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setTargetId(o.id)}
                  className={cn(
                    'w-full flex items-center gap-2 rounded-md border px-3 py-2 text-left transition-colors',
                    targetId === o.id ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/40',
                  )}
                >
                  <Boxes className="w-4 h-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{o.name}</div>
                    {o.description && <div className="text-xs text-muted-foreground truncate">{o.description}</div>}
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex justify-end">
        <Button size="lg" className="gap-1.5" onClick={confirm} disabled={busy}>
          {busy && <Loader2 className="w-4 h-4 animate-spin" />}
          연결하고 온톨로지 구축으로
        </Button>
      </div>
    </div>
  );
}
