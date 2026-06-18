'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Sparkles, Send, User, Bot, Loader2, RotateCcw, Import, X, AlertTriangle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { assistApi } from '../api';
import type { OntologyAction } from '../lib/schemas';
import { isBulkInput } from '../lib/input-heuristics';
import { uuid } from '../lib/uuid';
import ActionCard, { type ActionState } from './ai/ActionCard';

interface ActionItem {
  action: OntologyAction;
  state: ActionState;
  skipReason?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  actions?: ActionItem[];
}

const ASSIST_TIMEOUT_MS = 45_000;

export default function AIAssistantTab({ nodeName }: { nodeName: string }) {
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timedOutRef = useRef(false);

  const selectedNodeId = useOntologyStore((s) => s.selectedNodeId);
  const aiClasses = useOntologyStore((s) => s.classes);
  const aiInstances = useOntologyStore((s) => s.instances);
  const aiEdges = useOntologyStore((s) => s.edges);
  const applyAssistantActions = useOntologyStore((s) => s.applyAssistantActions);
  const highlightNodes = useOntologyStore((s) => s.highlightNodes);
  const openPopover = useOntologyStore((s) => s.openPopover);

  const ontologySummary = useMemo(() => {
    const summary = `Classes: ${aiClasses.length}, Instances: ${aiInstances.length}, Relations: ${aiEdges.length}`;
    const classNames = aiClasses.map((c) => c.name).join(', ');
    return `${summary}\nClass list: ${classNames}`;
  }, [aiClasses, aiInstances, aiEdges]);

  const bulky = useMemo(() => isBulkInput(input), [input]);

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Auto-resize textarea
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (tickRef.current) clearInterval(tickRef.current);
      abortRef.current?.abort();
    };
  }, []);

  const stopTimers = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (tickRef.current) clearInterval(tickRef.current);
    timeoutRef.current = null;
    tickRef.current = null;
  }, []);

  // Open the import (parse) flow with the current input prefilled.
  const handleRouteToImport = useCallback(() => {
    const text = input.trim();
    if (!text) return;
    openPopover({
      type: 'newNode',
      position: { x: window.innerWidth / 2, y: 200 },
      initialText: text,
    });
    setInput('');
  }, [input, openPopover]);

  const handleCancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const handleSubmit = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;

    const userMsg: ChatMessage = { id: uuid(), role: 'user', text: trimmed };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setElapsed(0);
    timedOutRef.current = false;

    const controller = new AbortController();
    abortRef.current = controller;
    const startedAt = Date.now();
    tickRef.current = setInterval(() => setElapsed(Math.round((Date.now() - startedAt) / 1000)), 250);
    timeoutRef.current = setTimeout(() => {
      timedOutRef.current = true;
      controller.abort();
    }, ASSIST_TIMEOUT_MS);

    try {
      const res = await assistApi.send(
        { message: trimmed, selectedNodeId: selectedNodeId ?? undefined, ontologySummary },
        controller.signal,
      );
      setMessages((prev) => [
        ...prev,
        {
          id: uuid(),
          role: 'assistant',
          text: res.reply,
          actions: res.actions.map((action) => ({ action, state: 'pending' as ActionState })),
        },
      ]);
    } catch (err) {
      const aborted = err instanceof DOMException && err.name === 'AbortError';
      if (aborted) {
        // Restore the input so the user can retry or route to import.
        setInput(trimmed);
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        if (timedOutRef.current) {
          toast.warning('응답이 지연되어 중단했습니다. 입력을 줄이거나 "가져오기"를 사용해 보세요.');
        } else {
          toast.info('요청을 취소했습니다.');
        }
      } else {
        setMessages((prev) => [
          ...prev,
          {
            id: uuid(),
            role: 'assistant',
            text: err instanceof Error ? err.message : '요청 처리에 실패했습니다.',
          },
        ]);
      }
    } finally {
      stopTimers();
      abortRef.current = null;
      setLoading(false);
    }
  }, [input, loading, selectedNodeId, ontologySummary, stopTimers]);

  // Apply a set of action items (single compound store action = one undo step)
  const runApply = useCallback(
    (msgId: string, indices: number[]) => {
      setMessages((prev) => {
        const msg = prev.find((m) => m.id === msgId);
        if (!msg?.actions) return prev;

        const targets = indices
          .map((i) => ({ i, item: msg.actions![i] }))
          .filter(({ item }) => item && item.state === 'pending');
        if (targets.length === 0) return prev;

        const result = applyAssistantActions(targets.map(({ item }) => item.action));

        const skipQueue = [...result.skipped];
        const nextActions = msg.actions.map((item, idx) => {
          const hit = targets.find((t) => t.i === idx);
          if (!hit) return item;
          const skipIdx = skipQueue.findIndex((s) => s.label === item.action.label);
          if (skipIdx !== -1) {
            const [skip] = skipQueue.splice(skipIdx, 1);
            return { ...item, state: 'skipped' as ActionState, skipReason: skip.reason };
          }
          return { ...item, state: 'applied' as ActionState };
        });

        if (result.applied.length > 0) {
          highlightNodes(result.applied);
        }
        const appliedCount = targets.length - result.skipped.length;
        if (appliedCount > 0) toast.success(`${appliedCount}개 액션을 적용했습니다`);
        if (result.skipped.length > 0) toast.warning(`${result.skipped.length}개 액션을 적용하지 못했습니다`);

        return prev.map((m) => (m.id === msgId ? { ...m, actions: nextActions } : m));
      });
    },
    [applyAssistantActions, highlightNodes],
  );

  const ignoreOne = useCallback((msgId: string, index: number) => {
    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== msgId || !m.actions) return m;
        return {
          ...m,
          actions: m.actions.map((item, i) =>
            i === index && item.state === 'pending' ? { ...item, state: 'ignored' as ActionState } : item,
          ),
        };
      }),
    );
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleReset = () => setMessages([]);

  const hasMessages = messages.length > 0;

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages area */}
      {hasMessages ? (
        <ScrollArea className="flex-1 min-h-0">
          <div ref={scrollRef} className="p-3 space-y-3">
            {messages.map((msg) => {
              const pendingIdx =
                msg.actions
                  ?.map((item, i) => (item.state === 'pending' ? i : -1))
                  .filter((i) => i !== -1) ?? [];
              return (
                <div key={msg.id} className="flex gap-2">
                  <div className="shrink-0 mt-0.5">
                    {msg.role === 'user' ? (
                      <div className="w-5 h-5 rounded-full bg-muted flex items-center justify-center">
                        <User className="w-3 h-3 text-muted-foreground" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                        <Bot className="w-3 h-3 text-primary" />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium text-muted-foreground mb-0.5">
                      {msg.role === 'user' ? '나' : 'AI 어시스턴트'}
                    </p>
                    <div className="text-xs text-foreground leading-relaxed whitespace-pre-wrap break-words">
                      {msg.text}
                    </div>

                    {msg.actions && msg.actions.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {pendingIdx.length > 1 && (
                          <div className="flex justify-end">
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-5 text-[10px] px-2"
                              onClick={() => runApply(msg.id, pendingIdx)}
                            >
                              모두 적용 ({pendingIdx.length})
                            </Button>
                          </div>
                        )}
                        {msg.actions.map((item, i) => (
                          <ActionCard
                            key={i}
                            action={item.action}
                            state={item.state}
                            skipReason={item.skipReason}
                            onApply={() => runApply(msg.id, [i])}
                            onIgnore={() => ignoreOne(msg.id, i)}
                          />
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
            {loading && (
              <div className="flex gap-2 items-center">
                <div className="shrink-0">
                  <div className="w-5 h-5 rounded-full bg-primary/10 flex items-center justify-center">
                    <Bot className="w-3 h-3 text-primary" />
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 text-muted-foreground text-xs">
                  <Loader2 className="w-3 h-3 animate-spin" />
                  분석 중… ({elapsed}s)
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-destructive"
                  onClick={handleCancel}
                >
                  <X className="w-3 h-3 mr-0.5" />
                  취소
                </Button>
              </div>
            )}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground mb-1">AI에게 요청하세요</p>
            <p className="text-[10px] text-muted-foreground/70">
              예: &quot;SUPRA 하위에 ECOLITE 클래스 추가&quot; — 제안을 검토 후 적용할 수 있습니다
            </p>
          </div>
        </div>
      )}

      <Separator />

      {/* Input area */}
      <div className="p-3 shrink-0">
        {hasMessages && (
          <div className="flex justify-end mb-1.5">
            <Button
              variant="ghost"
              size="sm"
              className="h-5 text-[10px] px-1.5 text-muted-foreground hover:text-foreground"
              onClick={handleReset}
            >
              <RotateCcw className="w-2.5 h-2.5 mr-1" />
              대화 초기화
            </Button>
          </div>
        )}

        {/* Bulk input → suggest the import (parse) flow (PATCH-2) */}
        {bulky && !loading && (
          <div className="mb-2 rounded-md border border-amber-500/30 bg-amber-500/10 p-2 space-y-1.5">
            <div className="flex items-start gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-[10px] text-amber-700 dark:text-amber-400 leading-relaxed">
                이건 문서에 가까워요. &lsquo;가져오기&rsquo;로 처리하면 더 빠르고 정확합니다.
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              className="h-6 w-full text-[10px] gap-1 border-amber-500/40"
              onClick={handleRouteToImport}
            >
              <Import className="w-3 h-3" />
              가져오기로 처리
            </Button>
          </div>
        )}

        <div className="flex gap-1.5 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={nodeName ? `"${nodeName}"에 대해 요청하세요...` : 'AI에게 요청하세요...'}
            className="flex-1 min-h-[32px] max-h-[120px] text-xs bg-transparent border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-primary/50 resize-none placeholder:text-muted-foreground"
            rows={1}
            disabled={loading}
          />
          <Button
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            disabled={!input.trim() || loading}
            onClick={handleSubmit}
          >
            {loading ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Send className="w-3.5 h-3.5" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
