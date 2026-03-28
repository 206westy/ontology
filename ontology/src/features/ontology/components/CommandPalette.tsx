'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Plus,
  GitCommitHorizontal,
  ArrowUpCircle,
  LayoutGrid,
  ShieldCheck,
  Search,
  Circle,
} from 'lucide-react';
import {
  CommandDialog,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { NODE_COLORS } from '../constants/colors';

interface CommandAction {
  id: string;
  label: string;
  icon: React.ReactNode;
  shortcut?: string;
  action: () => void;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);

  const openPopover = useOntologyStore((s) => s.openPopover);
  const triggerZoom = useOntologyStore((s) => s.triggerZoom);
  const focusNode = useOntologyStore((s) => s.focusNode);
  const selectNode = useOntologyStore((s) => s.selectNode);

  const classes = useOntologyStore((s) => s.classes);
  const instances = useOntologyStore((s) => s.instances);

  const nodes = useMemo(() => {
    const classNodes = classes.map((c) => ({
      id: c.id,
      name: c.name,
      type: 'class' as const,
      color: c.color,
    }));
    const instanceNodes = instances.map((i) => {
      const parentClass = classes.find((c) => c.id === i.classId);
      return {
        id: i.id,
        name: i.name,
        type: 'instance' as const,
        color: parentClass?.color ?? NODE_COLORS.instance,
        className: parentClass?.name,
      };
    });
    return [...classNodes, ...instanceNodes];
  }, [classes, instances]);

  const pendingChangesCount = useOntologyStore((s) => s.pendingChanges.length);

  // Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const handleNewNode = useCallback(() => {
    openPopover({
      type: 'newNode',
      position: { x: window.innerWidth / 2, y: 200 },
    });
    setOpen(false);
  }, [openPopover]);

  const handleCommit = useCallback(() => {
    // Simulate clicking the commit button by dispatching a custom event
    const commitBtn = document.querySelector('[data-testid="commit-button"]') as HTMLButtonElement;
    if (commitBtn) {
      commitBtn.click();
    }
    setOpen(false);
  }, []);

  const handlePush = useCallback(() => {
    const pushBtn = document.querySelector('[data-testid="push-button"]') as HTMLButtonElement;
    if (pushBtn) {
      pushBtn.click();
    }
    setOpen(false);
  }, []);

  const handleLayoutFit = useCallback(() => {
    triggerZoom('fit');
    setOpen(false);
  }, [triggerZoom]);

  const handleValidate = useCallback(() => {
    // Trigger validation via custom event
    window.dispatchEvent(new CustomEvent('ontology:validate'));
    setOpen(false);
  }, []);

  const handleNodeSelect = useCallback(
    (nodeId: string, nodeType: 'class' | 'instance') => {
      selectNode(nodeId, nodeType);
      focusNode(nodeId);
      setOpen(false);
    },
    [selectNode, focusNode],
  );

  const commands: CommandAction[] = useMemo(
    () => [
      {
        id: 'new-node',
        label: '새 노드 생성',
        icon: <Plus className="w-4 h-4" />,
        shortcut: '더블클릭',
        action: handleNewNode,
      },
      {
        id: 'commit',
        label: `저장 (커밋)${pendingChangesCount > 0 ? ` — ${pendingChangesCount}개 변경` : ''}`,
        icon: <GitCommitHorizontal className="w-4 h-4" />,
        shortcut: 'Ctrl+S',
        action: handleCommit,
      },
      {
        id: 'push',
        label: '반영 (Neo4j 푸시)',
        icon: <ArrowUpCircle className="w-4 h-4" />,
        action: handlePush,
      },
      {
        id: 'layout-fit',
        label: '레이아웃 정리 (화면 맞춤)',
        icon: <LayoutGrid className="w-4 h-4" />,
        action: handleLayoutFit,
      },
      {
        id: 'validate',
        label: '검증 실행',
        icon: <ShieldCheck className="w-4 h-4" />,
        action: handleValidate,
      },
    ],
    [handleNewNode, handleCommit, handlePush, handleLayoutFit, handleValidate, pendingChangesCount],
  );

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="명령 또는 노드 검색..." />
      <CommandList>
        <CommandEmpty>결과가 없습니다</CommandEmpty>

        <CommandGroup heading="명령">
          {commands.map((cmd) => (
            <CommandItem
              key={cmd.id}
              value={cmd.label}
              onSelect={cmd.action}
            >
              {cmd.icon}
              <span>{cmd.label}</span>
              {cmd.shortcut && (
                <CommandShortcut>{cmd.shortcut}</CommandShortcut>
              )}
            </CommandItem>
          ))}
        </CommandGroup>

        {nodes.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="노드 검색">
              {nodes.map((node) => (
                <CommandItem
                  key={node.id}
                  value={`${node.name} ${node.type === 'instance' && 'className' in node ? (node as { className?: string }).className ?? '' : ''}`}
                  onSelect={() => handleNodeSelect(node.id, node.type)}
                >
                  {node.type === 'class' ? (
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: node.color }}
                    />
                  ) : (
                    <Circle className="w-3 h-3 text-emerald-400 shrink-0" />
                  )}
                  <span>{node.name}</span>
                  <span className="text-[10px] text-muted-foreground ml-1">
                    {node.type === 'class' ? 'Class' : 'Instance'}
                    {node.type === 'instance' && 'className' in node && (node as { className?: string }).className && (
                      <> ({(node as { className?: string }).className})</>
                    )}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
