'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import { Sparkles, Send, User, Bot, Loader2, RotateCcw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { useChat } from '@ai-sdk/react';
import { DefaultChatTransport } from 'ai';

export default function AIAssistantTab({ nodeName }: { nodeName: string }) {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const selectedNodeId = useOntologyStore((s) => s.selectedNodeId);
  const selectedNodeType = useOntologyStore((s) => s.selectedNodeType);
  const aiClasses = useOntologyStore((s) => s.classes);
  const aiInstances = useOntologyStore((s) => s.instances);
  const aiEdges = useOntologyStore((s) => s.edges);

  const context = useMemo(() => {
    const id = selectedNodeId;
    const type = selectedNodeType;
    const selectedClass = type === 'class' ? aiClasses.find((c) => c.id === id) : null;
    const selectedInstance = type === 'instance' ? aiInstances.find((i) => i.id === id) : null;

    const summary = `Classes: ${aiClasses.length}, Instances: ${aiInstances.length}, Relations: ${aiEdges.length}`;
    const classNames = aiClasses.map((c) => c.name).join(', ');

    return {
      selectedNodeIds: id ? [id] : [],
      selectedNodeType: type ?? undefined,
      ontologySummary: `${summary}\nClass list: ${classNames}`,
      selectedName: selectedClass?.name ?? selectedInstance?.name ?? '',
    };
  }, [selectedNodeId, selectedNodeType, aiClasses, aiInstances, aiEdges]);

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: '/api/llm/chat',
        prepareSendMessagesRequest({ messages, id }) {
          return {
            body: {
              id,
              messages,
              context: {
                selectedNodeIds: context.selectedNodeIds,
                selectedNodeType: context.selectedNodeType,
                ontologySummary: context.ontologySummary,
              },
            },
          };
        },
      }),
    [context.selectedNodeIds, context.selectedNodeType, context.ontologySummary],
  );

  const { messages, sendMessage, status, setMessages, stop } = useChat({
    transport,
  });

  const isLoading = status === 'submitted' || status === 'streaming';

  // Auto-scroll on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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

  const handleSubmit = useCallback(() => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    sendMessage({ text: trimmed });
    setInput('');
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleReset = () => {
    if (isLoading) {
      stop();
    }
    setMessages([]);
  };

  const hasMessages = messages.length > 0;

  const getMessageText = (msg: (typeof messages)[number]): string => {
    return msg.parts
      .filter((part) => part.type === 'text')
      .map((part) => (part as { type: 'text'; text: string }).text)
      .join('');
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Messages area */}
      {hasMessages ? (
        <ScrollArea className="flex-1 min-h-0">
          <div ref={scrollRef} className="p-3 space-y-3">
            {messages.map((msg) => {
              const text = getMessageText(msg);
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
                      {text || (
                        <span className="inline-flex items-center gap-1 text-muted-foreground">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          생각하는 중...
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>
      ) : (
        <div className="flex-1 flex items-center justify-center px-6">
          <div className="text-center">
            <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-4 h-4 text-primary" />
            </div>
            <p className="text-xs text-muted-foreground mb-1">AI에게 질문하세요</p>
            <p className="text-[10px] text-muted-foreground/70">
              선택된 노드에 대해 설명, 추천, 검증을 요청할 수 있습니다
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
        <div className="flex gap-1.5 items-end">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={nodeName ? `"${nodeName}"에 대해 질문하세요...` : 'AI에게 질문하세요...'}
            className="flex-1 min-h-[32px] max-h-[120px] text-xs bg-transparent border border-border rounded-md px-2.5 py-1.5 outline-none focus:border-primary/50 resize-none placeholder:text-muted-foreground"
            rows={1}
            disabled={isLoading}
          />
          <Button
            size="sm"
            className="h-8 w-8 p-0 shrink-0"
            disabled={!input.trim() || isLoading}
            onClick={handleSubmit}
          >
            {isLoading ? (
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
