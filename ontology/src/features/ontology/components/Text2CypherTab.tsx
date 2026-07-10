'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Copy,
  Check,
  Play,
  Loader2,
  Terminal,
  ChevronDown,
  ToggleLeft,
  ToggleRight,
  Clock,
  Trash2,
  AlertCircle,
  Crosshair,
  WifiOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogFooter,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogAction,
  AlertDialogCancel,
} from '@/components/ui/alert-dialog';
import { text2CypherApi, neo4jApi, type Text2CypherResult, type Neo4jStatusResponse } from '../api';
import { useOntologyStore } from '../store';
import { uuid } from '../lib/uuid';

// Recursively collect string `id` values from Neo4j result rows.
// Nodes preserve their Supabase id (== canvas node id), whether serialized
// flat ({ _labels, id, name }) or nested ({ properties: { id } }).
function extractNodeIds(data: unknown[]): string[] {
  const ids = new Set<string>();
  const visit = (value: unknown) => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    const obj = value as Record<string, unknown>;
    if (typeof obj.id === 'string') ids.add(obj.id);
    if (obj.properties && typeof obj.properties === 'object') {
      const props = obj.properties as Record<string, unknown>;
      if (typeof props.id === 'string') ids.add(props.id);
    }
    Object.values(obj).forEach(visit);
  };
  data.forEach(visit);
  return [...ids];
}

// ─── Shiki highlighter (lazy loaded) ──────────────────────
type ShikiHighlighter = {
  codeToHtml: (code: string, opts: { lang: string; theme: string }) => string;
};

let shikiPromise: Promise<ShikiHighlighter | null> | null = null;

async function loadShiki(): Promise<ShikiHighlighter | null> {
  try {
    const { createHighlighter } = await import('shiki');
    return await createHighlighter({
      themes: ['github-dark', 'github-light'],
      langs: ['cypher'],
    });
  } catch {
    return null;
  }
}

function getShikiHighlighter(): Promise<ShikiHighlighter | null> {
  if (!shikiPromise) {
    shikiPromise = loadShiki().catch(() => {
      shikiPromise = null;
      return null;
    });
  }
  return shikiPromise;
}

// ─── Regex-based fallback highlighter ─────────────────────
function highlightCypherFallback(code: string): string {
  const keywords =
    /\b(CREATE|MATCH|SET|MERGE|DELETE|DETACH|REMOVE|RETURN|WHERE|WITH|AND|OR|NOT|IN|AS|ON|UNWIND|OPTIONAL|CALL|YIELD|LIMIT|ORDER|BY|DESC|ASC|DISTINCT|SKIP|CASE|WHEN|THEN|ELSE|END|COUNT|SUM|AVG|MIN|MAX|COLLECT|EXISTS|NONE|ANY|ALL|SINGLE)\b/g;
  const strings = /('[^']*'|"[^"]*")/g;
  const comments = /(\/\/.*$)/gm;
  const params = /(\$\w+)/g;

  let result = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  result = result.replace(
    comments,
    '<span class="text-muted-foreground/60 italic">$1</span>',
  );
  result = result.replace(
    strings,
    '<span class="text-success">$1</span>',
  );
  result = result.replace(
    keywords,
    '<span class="text-primary font-semibold">$1</span>',
  );
  result = result.replace(
    params,
    '<span class="text-warning">$1</span>',
  );

  return result;
}

// ─── Shiki-aware code block ───────────────────────────────
function CypherCodeBlock({ code, isDark }: { code: string; isDark: boolean }) {
  const [html, setHtml] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getShikiHighlighter().then((highlighter) => {
      if (cancelled || !highlighter) return;
      try {
        const highlighted = highlighter.codeToHtml(code, {
          lang: 'cypher',
          theme: isDark ? 'github-dark' : 'github-light',
        });
        setHtml(highlighted);
      } catch {
        // lang not supported — stay on fallback
      }
    });

    return () => {
      cancelled = true;
    };
  }, [code, isDark]);

  if (html) {
    return (
      <div
        className="text-xs font-mono leading-relaxed overflow-x-auto max-h-[200px] overflow-y-auto [&_pre]:!bg-transparent [&_pre]:!p-0 [&_code]:!bg-transparent"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  return (
    <pre className="text-xs font-mono leading-relaxed overflow-x-auto max-h-[200px] overflow-y-auto whitespace-pre-wrap">
      <code dangerouslySetInnerHTML={{ __html: highlightCypherFallback(code) }} />
    </pre>
  );
}

// ─── History helpers ──────────────────────────────────────
const HISTORY_KEY = 'ontology-text2cypher-history';
const MAX_HISTORY = 20;

interface HistoryEntry {
  id: string;
  question: string;
  cypher: string;
  timestamp: number;
  mode: 'nl' | 'direct';
}

function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as HistoryEntry[];
  } catch {
    return [];
  }
}

function saveHistory(entries: HistoryEntry[]) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, MAX_HISTORY)));
  } catch {
    // quota exceeded
  }
}

function addToHistory(entry: Omit<HistoryEntry, 'id' | 'timestamp'>) {
  const entries = loadHistory();
  const newEntry: HistoryEntry = {
    ...entry,
    id: uuid(),
    timestamp: Date.now(),
  };
  const updated = [newEntry, ...entries].slice(0, MAX_HISTORY);
  saveHistory(updated);
  return updated;
}

// ─── Result display components ────────────────────────────

function ResultTable({ data }: { data: unknown[] }) {
  if (data.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        결과가 없습니다
      </p>
    );
  }

  const columns = Object.keys(data[0] as Record<string, unknown>);

  return (
    <div className="border border-border rounded-md overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-muted/50 border-b border-border">
              {columns.map((col) => (
                <th
                  key={col}
                  className="px-2.5 py-1.5 text-left font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, i) => {
              const record = row as Record<string, unknown>;
              return (
                <tr
                  key={i}
                  className="border-b border-border last:border-b-0 hover:bg-muted/30 transition-colors"
                >
                  {columns.map((col) => (
                    <td key={col} className="px-2.5 py-1.5 whitespace-nowrap">
                      {formatCellValue(record[col])}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-2.5 py-1 bg-muted/30 border-t border-border">
        <span className="text-xs text-muted-foreground">
          {data.length}개 결과
        </span>
      </div>
    </div>
  );
}

function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '(null)';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function ResultJson({ data: rawData }: { data: unknown }) {
  const json = useMemo(() => JSON.stringify(rawData, null, 2), [rawData]);

  return (
    <pre className="text-xs font-mono leading-relaxed p-3 bg-muted/30 rounded-md overflow-auto max-h-[300px] whitespace-pre-wrap break-all">
      {json}
    </pre>
  );
}

function ResultGraph({ data }: { data: unknown[] }) {
  // Extract nodes and edges from query results
  const { graphNodes, graphEdges } = useMemo(() => {
    const nodeMap = new Map<string, { id: string; label: string; type: string }>();
    const edgeList: { id: string; source: string; target: string; label: string }[] = [];

    for (const row of data) {
      const record = row as Record<string, unknown>;
      for (const value of Object.values(record)) {
        if (value && typeof value === 'object') {
          const v = value as Record<string, unknown>;
          // Neo4j node: has labels array and properties
          if (Array.isArray(v.labels) && v.properties) {
            const id = String(v.elementId ?? v.identity ?? v.id ?? uuid());
            if (!nodeMap.has(id)) {
              const props = v.properties as Record<string, unknown>;
              nodeMap.set(id, {
                id,
                label: String(props.name ?? props.title ?? v.labels[0] ?? id).slice(0, 20),
                type: String(v.labels[0] ?? 'Node'),
              });
            }
          }
          // Neo4j relationship: has type, startNodeElementId, endNodeElementId
          if (v.type && (v.startNodeElementId || v.start)) {
            const src = String(v.startNodeElementId ?? v.start ?? '');
            const tgt = String(v.endNodeElementId ?? v.end ?? '');
            if (src && tgt) {
              edgeList.push({
                id: String(v.elementId ?? v.identity ?? uuid()),
                source: src,
                target: tgt,
                label: String(v.type),
              });
            }
          }
        }
      }
    }

    // Position nodes in a circle layout
    const nodes = Array.from(nodeMap.values());
    const cx = 120, cy = 100, r = Math.min(80, nodes.length * 20);
    const graphNodes = nodes.map((n, i) => ({
      ...n,
      x: cx + r * Math.cos((2 * Math.PI * i) / nodes.length),
      y: cy + r * Math.sin((2 * Math.PI * i) / nodes.length),
    }));

    return { graphNodes, graphEdges: edgeList };
  }, [data]);

  if (graphNodes.length === 0) {
    return (
      <div className="text-center py-6">
        <p className="text-xs text-muted-foreground">
          그래프로 표시할 노드/관계가 없습니다
        </p>
        <p className="text-xs text-muted-foreground/60 mt-1">
          MATCH (n)-[r]-(m) RETURN n, r, m 형태의 쿼리를 사용하세요
        </p>
      </div>
    );
  }

  const colors = ['#7c3aed', '#8b5cf6', '#a78bfa', '#64748b', '#94a3b8', '#c4b5fd'];

  // Simple SVG graph visualization
  return (
    <div className="border border-border rounded-md overflow-hidden bg-muted/20">
      <svg viewBox="0 0 240 200" className="w-full h-[200px]">
        {/* Edges */}
        {graphEdges.map((edge) => {
          const src = graphNodes.find((n) => n.id === edge.source);
          const tgt = graphNodes.find((n) => n.id === edge.target);
          if (!src || !tgt) return null;
          const mx = (src.x + tgt.x) / 2;
          const my = (src.y + tgt.y) / 2;
          return (
            <g key={edge.id}>
              <line
                x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                stroke="hsl(var(--border))" strokeWidth={1.2}
                markerEnd="url(#arrowhead)"
              />
              <text x={mx} y={my - 4} textAnchor="middle"
                className="fill-muted-foreground" fontSize={7} fontWeight={500}>
                {edge.label}
              </text>
            </g>
          );
        })}
        {/* Nodes */}
        {graphNodes.map((node, i) => (
          <g key={node.id}>
            <circle cx={node.x} cy={node.y} r={14}
              fill={colors[i % colors.length]} opacity={0.9}
              stroke="white" strokeWidth={1.5}
            />
            <text x={node.x} y={node.y + 1} textAnchor="middle"
              dominantBaseline="middle" fill="white" fontSize={6} fontWeight={600}>
              {node.label.slice(0, 8)}
            </text>
            <text x={node.x} y={node.y + 22} textAnchor="middle"
              className="fill-muted-foreground" fontSize={6}>
              {node.type}
            </text>
          </g>
        ))}
        <defs>
          <marker id="arrowhead" markerWidth="6" markerHeight="4" refX="6" refY="2" orient="auto">
            <polygon points="0 0, 6 2, 0 4" fill="hsl(var(--border))" />
          </marker>
        </defs>
      </svg>
      <div className="px-2.5 py-1 bg-muted/30 border-t border-border">
        <span className="text-xs text-muted-foreground">
          {graphNodes.length}개 노드, {graphEdges.length}개 관계
        </span>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────

export default function Text2CypherTab() {
  const [mode, setMode] = useState<'nl' | 'direct'>('nl');
  const [input, setInput] = useState('');
  const [cypherDraft, setCypherDraft] = useState('');
  const [generatedCypher, setGeneratedCypher] = useState('');
  const [explanation, setExplanation] = useState('');
  const [results, setResults] = useState<unknown[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [resultView, setResultView] = useState<'table' | 'graph' | 'json'>('table');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [status, setStatus] = useState<Neo4jStatusResponse | null>(null);

  const highlightNodes = useOntologyStore((s) => s.highlightNodes);
  const pendingCount = useOntologyStore((s) => s.pendingChanges.length);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const historyRef = useRef<HTMLDivElement>(null);

  // Detect dark mode for Shiki
  const isDark =
    typeof document !== 'undefined' &&
    document.documentElement.classList.contains('dark');

  // Load history on mount
  useEffect(() => {
    setHistory(loadHistory());
  }, []);

  // Check Neo4j connection on mount (production graph is the query target)
  useEffect(() => {
    let cancelled = false;
    neo4jApi
      .status()
      .then((s) => {
        if (!cancelled) setStatus(s);
      })
      .catch(() => {
        if (!cancelled) setStatus({ connected: false, error: 'Neo4j 상태를 확인할 수 없습니다.' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Close history dropdown on outside click
  useEffect(() => {
    if (!showHistory) return;
    function handleClick(e: MouseEvent) {
      if (historyRef.current && !historyRef.current.contains(e.target as Node)) {
        setShowHistory(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [showHistory]);

  const handleGenerate = useCallback(async () => {
    const question = input.trim();
    if (!question || loading) return;

    setLoading(true);
    setError(null);
    setResults(null);
    setGeneratedCypher('');
    setExplanation('');

    try {
      const result: Text2CypherResult = await text2CypherApi.generate({
        question,
        executeQuery: false,
        maxRetries: 1,
      });

      setGeneratedCypher(result.cypher);
      setExplanation(result.explanation);

      if (result.cypher) {
        setHistory(addToHistory({ question, cypher: result.cypher, mode: 'nl' }));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '쿼리 생성에 실패했습니다');
    } finally {
      setLoading(false);
    }
  }, [input, loading]);

  // 운영(반영본) Neo4j 에 직접 실행되므로, 실행 전 확인 다이얼로그를 거친다.
  const [execConfirmOpen, setExecConfirmOpen] = useState(false);

  const handleExecute = useCallback(async () => {
    const cypher = mode === 'nl' ? generatedCypher : cypherDraft.trim();
    if (!cypher || executing) return;

    setExecuting(true);
    setError(null);
    setResults(null);

    try {
      if (mode === 'direct') {
        // Direct mode: execute raw Cypher via neo4j query endpoint
        const result = await neo4jApi.query(cypher);
        setGeneratedCypher(cypher);
        setResults(result.data);
        setHistory(addToHistory({ question: cypher, cypher, mode: 'direct' }));
      } else {
        // NL mode: use text2cypher API with execution enabled
        const result: Text2CypherResult = await text2CypherApi.generate({
          question: input.trim(),
          executeQuery: true,
          maxRetries: 1,
        });

        if (result.cypher) {
          setGeneratedCypher(result.cypher);
        }
        if (result.explanation) {
          setExplanation(result.explanation);
        }
        if (result.error) {
          setError(result.error);
        }
        if (result.results) {
          setResults(result.results);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '쿼리 실행에 실패했습니다');
    } finally {
      setExecuting(false);
    }
  }, [mode, generatedCypher, cypherDraft, executing, input]);

  const handleCopy = useCallback(async () => {
    const cypher = mode === 'nl' ? generatedCypher : cypherDraft;
    if (!cypher) return;
    await navigator.clipboard.writeText(cypher);
    setCopied(true);
    toast.success('Cypher 복사됨');
    setTimeout(() => setCopied(false), 2000);
  }, [mode, generatedCypher, cypherDraft]);

  const handleHistorySelect = useCallback(
    (entry: HistoryEntry) => {
      if (entry.mode === 'nl') {
        setMode('nl');
        setInput(entry.question);
        setGeneratedCypher(entry.cypher);
      } else {
        setMode('direct');
        setCypherDraft(entry.cypher);
        setGeneratedCypher(entry.cypher);
      }
      setShowHistory(false);
      setResults(null);
      setError(null);
    },
    [],
  );

  const handleClearHistory = useCallback(() => {
    saveHistory([]);
    setHistory([]);
    toast.success('히스토리가 삭제되었습니다');
  }, []);

  const handleShowOnCanvas = useCallback(() => {
    if (!results) return;
    const resultIds = extractNodeIds(results);
    const { classes, instances } = useOntologyStore.getState();
    const canvasIds = new Set<string>([
      ...classes.map((c) => c.id),
      ...instances.map((i) => i.id),
    ]);
    const matched = resultIds.filter((id) => canvasIds.has(id));
    if (matched.length === 0) {
      toast.info('결과 노드가 현재 캔버스에 없습니다. push 이후의 데이터일 수 있습니다.');
      return;
    }
    highlightNodes(matched);
    toast.success(`${matched.length}개 노드를 캔버스에서 강조합니다`);
  }, [results, highlightNodes]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (mode === 'nl') {
        handleGenerate();
      } else {
        handleExecute();
      }
    }
  };

  const activeCypher = mode === 'nl' ? generatedCypher : cypherDraft.trim();
  const isProcessing = loading || executing;

  return (
    <div className="flex flex-col h-full min-h-0">
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-3">
          {/* Neo4j connection guard (production graph is the query target) */}
          {status && !status.connected && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-warning/10 border border-warning/20">
              <WifiOff className="w-3.5 h-3.5 text-warning shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <p className="text-xs font-medium text-warning">
                  Neo4j(반영본)에 연결되어 있지 않습니다
                </p>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {status.suggestion ?? status.error ?? '연결 설정을 확인한 뒤 다시 시도하세요.'}
                </p>
              </div>
            </div>
          )}

          {/* Mode toggle + history */}
          <div className="flex items-center justify-between gap-2">
            <button
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
              onClick={() => {
                setMode((m) => (m === 'nl' ? 'direct' : 'nl'));
                setResults(null);
                setError(null);
              }}
            >
              {mode === 'nl' ? (
                <ToggleLeft className="w-4 h-4 text-primary" />
              ) : (
                <ToggleRight className="w-4 h-4 text-primary" />
              )}
              <span className="font-medium">
                {mode === 'nl' ? '자연어 모드' : 'Cypher 직접입력'}
              </span>
            </button>

            <div className="relative" ref={historyRef}>
              <button
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                onClick={() => setShowHistory(!showHistory)}
                disabled={history.length === 0}
              >
                <Clock className="w-3 h-3" />
                <span>히스토리</span>
                <ChevronDown className="w-3 h-3" />
              </button>

              {showHistory && history.length > 0 && (
                <div className="absolute right-0 top-full mt-1 w-64 bg-popover border border-border rounded-lg shadow-lg z-50 overflow-hidden">
                  <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border bg-muted/30">
                    <span className="text-xs font-semibold text-muted-foreground uppercase">
                      최근 쿼리
                    </span>
                    <button
                      className="text-xs text-muted-foreground hover:text-destructive transition-colors flex items-center gap-0.5"
                      onClick={handleClearHistory}
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                      전체 삭제
                    </button>
                  </div>
                  <div className="max-h-[200px] overflow-y-auto">
                    {history.map((entry) => (
                      <button
                        key={entry.id}
                        className="w-full text-left px-2.5 py-2 hover:bg-muted/50 transition-colors border-b border-border/50 last:border-b-0"
                        onClick={() => handleHistorySelect(entry)}
                      >
                        <div className="flex items-center gap-1.5 mb-0.5">
                          <Badge
                            variant="outline"
                            className="h-5 text-xs px-1 shrink-0"
                          >
                            {entry.mode === 'nl' ? 'NL' : 'CQL'}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(entry.timestamp).toLocaleTimeString('ko-KR', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                        <p className="text-xs text-foreground truncate">
                          {entry.question}
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Input area */}
          <div className="relative">
            <textarea
              ref={inputRef}
              value={mode === 'nl' ? input : cypherDraft}
              onChange={(e) => {
                if (mode === 'nl') {
                  setInput(e.target.value);
                } else {
                  setCypherDraft(e.target.value);
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                mode === 'nl'
                  ? 'Neo4j 그래프에 대해 자연어로 질문하세요...'
                  : 'Cypher 쿼리를 직접 입력하세요...'
              }
              className={`w-full text-xs bg-transparent border border-border rounded-md px-3 py-2 pr-9 outline-none focus:border-primary/50 resize-none placeholder:text-muted-foreground ${
                mode === 'direct' ? 'font-mono min-h-[60px]' : 'min-h-[36px]'
              }`}
              rows={mode === 'direct' ? 3 : 1}
              disabled={isProcessing}
            />
            <Button
              size="sm"
              variant="ghost"
              className="absolute right-1.5 top-1.5 h-6 w-6 p-0"
              disabled={
                isProcessing ||
                (mode === 'nl' ? !input.trim() : !cypherDraft.trim())
              }
              onClick={mode === 'nl' ? handleGenerate : () => setExecConfirmOpen(true)}
            >
              {isProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Search className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>

          {/* Generated Cypher preview */}
          {(generatedCypher || (mode === 'direct' && cypherDraft.trim())) && (
            <div className="space-y-2">
              {mode === 'nl' && explanation && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {explanation.replace(/```[\s\S]*?```/g, '').trim().slice(0, 200)}
                  {explanation.length > 200 ? '...' : ''}
                </p>
              )}

              <div className="relative rounded-lg border border-border bg-muted/50 p-3">
                <CypherCodeBlock
                  code={mode === 'nl' ? generatedCypher : cypherDraft}
                  isDark={isDark}
                />

                <div className="flex items-center justify-end gap-1 mt-2 pt-2 border-t border-border/50">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2 gap-1"
                    onClick={handleCopy}
                    disabled={!activeCypher}
                  >
                    {copied ? (
                      <Check className="w-3 h-3 text-success" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                    복사
                  </Button>
                  <Button
                    size="sm"
                    className="h-6 text-xs px-2.5 gap-1 bg-success hover:bg-success/90 text-success-foreground"
                    onClick={() => setExecConfirmOpen(true)}
                    disabled={!activeCypher || executing}
                  >
                    {executing ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Play className="w-3 h-3" />
                    )}
                    실행
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Error display */}
          {error && (
            <div className="flex items-start gap-2 p-2.5 rounded-md bg-destructive/10 border border-destructive/20">
              <AlertCircle className="w-3.5 h-3.5 text-destructive shrink-0 mt-0.5" />
              <p className="text-xs text-destructive leading-relaxed">
                {error}
              </p>
            </div>
          )}

          {/* Results area */}
          {results && (
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <button
                    className={`text-xs px-2 py-0.5 rounded-md transition-colors ${
                      resultView === 'table'
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setResultView('table')}
                  >
                    테이블
                  </button>
                  <button
                    className={`text-xs px-2 py-0.5 rounded-md transition-colors ${
                      resultView === 'graph'
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setResultView('graph')}
                  >
                    그래프
                  </button>
                  <button
                    className={`text-xs px-2 py-0.5 rounded-md transition-colors ${
                      resultView === 'json'
                        ? 'bg-primary/10 text-primary font-medium'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                    onClick={() => setResultView('json')}
                  >
                    JSON
                  </button>
                </div>

                {results.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 text-xs px-2 gap-1"
                    onClick={handleShowOnCanvas}
                  >
                    <Crosshair className="w-3 h-3" />
                    캔버스에 표시
                  </Button>
                )}
              </div>

              {resultView === 'table' ? (
                <ResultTable data={results} />
              ) : resultView === 'graph' ? (
                <ResultGraph data={results} />
              ) : (
                <ResultJson data={results} />
              )}

              {/* Production-basis note */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <p className="text-xs text-muted-foreground/70">
                  이 결과는 Neo4j(반영본) 기준입니다. 최근 편집은 push 후 반영됩니다.
                </p>
                {pendingCount > 0 && (
                  <Badge variant="outline" className="h-5 text-xs px-1 text-warning border-warning/40">
                    미반영 변경 {pendingCount}건
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!generatedCypher && !error && !results && !(mode === 'direct' && cypherDraft.trim()) && (
            <div className="flex flex-col items-center justify-center py-8">
              <div className="w-10 h-10 rounded-full bg-muted/50 flex items-center justify-center mb-3">
                <Terminal className="w-4 h-4 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground mb-1">
                {mode === 'nl'
                  ? '자연어로 Neo4j를 질의하세요'
                  : 'Cypher 쿼리를 직접 실행하세요'}
              </p>
              <p className="text-xs text-muted-foreground/70">
                {mode === 'nl'
                  ? '"Engineer 노드와 연결된 모든 Equipment를 보여줘"'
                  : 'MATCH (n) RETURN n LIMIT 10'}
              </p>
            </div>
          )}
        </div>
      </ScrollArea>

      <AlertDialog open={execConfirmOpen} onOpenChange={setExecConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>운영 Neo4j에 실행</AlertDialogTitle>
            <AlertDialogDescription>
              이 쿼리는 스테이징이 아닌 <strong>운영(반영본)</strong> Neo4j 그래프에 직접 실행됩니다. 내용을 확인한 뒤 진행하세요.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <pre className="max-h-48 overflow-auto rounded-md bg-muted/50 p-2 text-xs font-mono whitespace-pre-wrap break-words">
            {mode === 'nl' ? generatedCypher : cypherDraft.trim()}
          </pre>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setExecConfirmOpen(false);
                void handleExecute();
              }}
            >
              실행
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
