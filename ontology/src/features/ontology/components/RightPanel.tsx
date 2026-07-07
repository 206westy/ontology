'use client';

import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  ArrowRight,
  ArrowLeft,
  AlertTriangle,
  Circle,
  Pencil,
  Check,
  X,
  Trash2,
  Copy,
  Terminal,
  Shield,
  Sparkles,
  FileSearch,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { toast } from 'sonner';
import type { DataType } from '../lib/types';
import { getInheritedProperties, type InheritedProperty } from '../lib/property-inheritance';
import AIAssistantTab from './AIAssistantTab';
import { usePropertyAutocomplete } from '../hooks/useAutocomplete';
import AutocompleteSuggestions from './AutocompleteSuggestions';
import Text2CypherTab from './Text2CypherTab';
import ConstraintsPanel from './ConstraintsPanel';
import EvidencePanel, { type EdgeEvidence } from './EvidencePanel';
import { sourceTypeLabel } from '../lib/source-type-labels';

const DATA_TYPES: DataType[] = ['string', 'integer', 'float', 'boolean', 'date', 'enum'];

// 데이터 타입 표시 라벨(비전문가용). 내부 값(DataType)은 영문 그대로 유지하고 표기만 한국어.
const DATA_TYPE_LABEL: Record<DataType, string> = {
  string: '문자',
  integer: '정수',
  float: '소수',
  boolean: '예/아니오',
  date: '날짜',
  enum: '선택목록',
};


interface CollapsibleSectionProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  onAdd?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  addLabel?: string;
  hint?: string;
  children: React.ReactNode;
}

function CollapsibleSection({ title, count, defaultOpen = true, onAdd, addLabel = '추가', hint, children }: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="px-4 py-2">
      <button
        className="flex items-center gap-1.5 w-full text-left group"
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <ChevronDown className="w-3 h-3 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 text-muted-foreground" />
        )}
        <span className="text-sm font-semibold tracking-tight text-foreground/80">
          {title}
        </span>
        <span className="text-[11px] font-mono text-muted-foreground ml-auto">
          ({count})
        </span>
      </button>
      {/* 비전문가용 한 줄 설명 — 섹션이 무엇인지 용어 없이 안내 */}
      {hint && open && (
        <p className="mt-1 ml-[18px] text-[11px] leading-snug text-muted-foreground/70">{hint}</p>
      )}
      {open && (
        <div className="mt-2 space-y-0.5">
          {children}
          {onAdd && (
            <button
              className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 mt-1.5 py-1 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onAdd(e);
              }}
            >
              <Plus className="w-3 h-3" />
              <span>{addLabel}</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// PRD-K M4: blur 저장 성공을 필드 옆 체크 아이콘(1.5초)으로 즉시 확인시키는 훅.
const FIELD_SAVED_FLASH_MS = 1500;

function useSavedFlash(onSaved?: () => void) {
  const [savedFlash, setSavedFlash] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const markSaved = useCallback(() => {
    setSavedFlash(true);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setSavedFlash(false), FIELD_SAVED_FLASH_MS);
    onSaved?.();
  }, [onSaved]);

  return { savedFlash, markSaved };
}

function InlineEditableText({
  value,
  placeholder,
  onSave,
  onSaved,
  multiline = false,
  className = '',
}: {
  value: string;
  placeholder: string;
  onSave: (val: string) => void;
  onSaved?: () => void;
  multiline?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);
  const { savedFlash, markSaved } = useSavedFlash(onSaved);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      if (inputRef.current instanceof HTMLTextAreaElement) {
        inputRef.current.selectionStart = inputRef.current.value.length;
      }
    }
  }, [editing]);

  const handleSave = () => {
    if (draft !== value) {
      onSave(draft);
      markSaved();
    }
    setEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !multiline) {
      handleSave();
    }
    if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  if (editing) {
    if (multiline) {
      return (
        <textarea
          ref={inputRef as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setDraft(value);
              setEditing(false);
            }
          }}
          className={`w-full text-xs bg-transparent border border-primary/30 rounded px-1.5 py-1 resize-none outline-none focus:border-primary/50 min-h-[60px] ${className}`}
          placeholder={placeholder}
        />
      );
    }
    return (
      <input
        ref={inputRef as React.RefObject<HTMLInputElement>}
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={`w-full bg-transparent border-b border-primary/30 outline-none text-xs py-0.5 focus:border-primary/50 ${className}`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <div
      className={`cursor-pointer rounded px-1.5 py-0.5 -mx-1.5 hover:bg-muted/50 transition-colors group ${className}`}
      onClick={() => setEditing(true)}
    >
      <span className={`text-xs ${value ? 'text-foreground' : 'text-muted-foreground italic'}`}>
        {value || placeholder}
      </span>
      {savedFlash ? (
        <Check className="w-3 h-3 text-success inline ml-1.5" data-testid="field-saved-check" />
      ) : (
        <Pencil className="w-2.5 h-2.5 text-muted-foreground opacity-60 group-hover:opacity-100 inline ml-1.5 transition-opacity" />
      )}
    </div>
  );
}

function PropertyRow({
  name,
  dataType,
  isRequired,
  enumValues,
  onDelete,
}: {
  name: string;
  dataType: DataType;
  isRequired: boolean;
  enumValues: string[] | null;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 py-1.5 px-1.5 rounded hover:bg-muted/40 transition-colors group -mx-1">
      <span className="text-xs font-mono text-primary/80 truncate flex-1">{name}</span>
      <Badge variant="secondary" className="h-5 text-[11px] px-1.5 font-normal shrink-0">
        {DATA_TYPE_LABEL[dataType]}
      </Badge>
      {isRequired && (
        <Badge variant="outline" className="h-5 text-[11px] px-1.5 font-normal text-amber-600 border-amber-300 shrink-0">
          req
        </Badge>
      )}
      {dataType === 'enum' && enumValues && (
        <Badge variant="outline" className="h-5 text-[11px] px-1.5 font-normal text-cyan-600 border-cyan-300 shrink-0">
          {enumValues.length}
        </Badge>
      )}
      {onDelete && (
        <button
          className="-my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-60 transition-opacity text-muted-foreground hover:text-destructive group-hover:opacity-100"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
        >
          <Trash2 className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}

function InheritedPropertyRow({
  name,
  dataType,
  isRequired,
  inheritedFromName,
  onOverride,
}: {
  name: string;
  dataType: DataType;
  isRequired: boolean;
  inheritedFromName: string;
  onOverride: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5 py-1.5 px-1.5 rounded hover:bg-muted/40 transition-colors group -mx-1">
      <span className="text-xs font-mono text-muted-foreground truncate flex-1">{name}</span>
      <Badge variant="secondary" className="h-5 text-[11px] px-1.5 font-normal shrink-0 opacity-60">
        {DATA_TYPE_LABEL[dataType]}
      </Badge>
      {isRequired && (
        <Badge variant="outline" className="h-5 text-[11px] px-1.5 font-normal text-amber-600/60 border-amber-300/60 shrink-0">
          req
        </Badge>
      )}
      <button
        className="-my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-60 transition-opacity text-muted-foreground hover:text-primary group-hover:opacity-100"
        onClick={(e) => { e.stopPropagation(); onOverride(); }}
        title={`${inheritedFromName}에서 상속됨 — 클릭하여 오버라이드`}
      >
        <Copy className="w-3 h-3" />
      </button>
    </div>
  );
}

// PRD-K M4 (B5): 노드 미선택 시 빈 상태 안내 — 탭 구성 자체는 선택 여부와 무관하게 고정.
function SelectNodePlaceholder({ message }: { message: string }) {
  return (
    <div className="flex-1 flex items-center justify-center px-6 h-full">
      <div className="text-center">
        <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
          <Circle className="w-5 h-5 text-muted-foreground" />
        </div>
        <p className="text-xs text-muted-foreground">{message}</p>
      </div>
    </div>
  );
}

// PRD-K M4 (B5): 선택이 없어도 본 패널과 동일한 6탭 — 같은 위치=같은 기능(근육기억 보존).
// 선택 의존 탭(상세·관계·AI·근거)은 dim 처리 + "노드를 선택하세요" 빈 상태를 보여준다.
function EmptyState({
  activeTab,
  onTabChange,
}: {
  activeTab: string;
  onTabChange: (tab: string) => void;
}) {
  return (
    <aside className="w-full h-full flex flex-col bg-card overflow-hidden">
      <div className="flex items-center px-4 h-[52px] shrink-0">
        <span className="text-sm font-semibold tracking-tight">속성 패널</span>
      </div>
      <Separator />
      <Tabs value={activeTab} onValueChange={onTabChange} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-9 px-4 shrink-0">
          <TabsTrigger value="detail" className="text-xs h-8 px-3 opacity-60 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            상세
          </TabsTrigger>
          <TabsTrigger value="relations" className="text-xs h-8 px-3 opacity-60 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            관계
          </TabsTrigger>
          <TabsTrigger value="constraints" className="text-xs h-8 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none gap-1">
            <Shield className="w-3 h-3" />
            제약
          </TabsTrigger>
          <TabsTrigger value="ai" className="text-xs h-8 px-3 opacity-60 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            AI
          </TabsTrigger>
          <TabsTrigger value="cypher" className="text-xs h-8 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none gap-1">
            <Terminal className="w-3 h-3" />
            Cypher
          </TabsTrigger>
          <TabsTrigger value="evidence" className="text-xs h-8 px-3 opacity-60 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none gap-1">
            <FileSearch className="w-3 h-3" />
            근거
          </TabsTrigger>
        </TabsList>
        <TabsContent value="detail" className="flex-1 mt-0 min-h-0">
          <SelectNodePlaceholder message="노드를 선택하면 정보가 표시됩니다" />
        </TabsContent>
        <TabsContent value="relations" className="flex-1 mt-0 min-h-0">
          <SelectNodePlaceholder message="노드를 선택하면 관계가 표시됩니다" />
        </TabsContent>
        <TabsContent value="constraints" className="flex-1 mt-0 min-h-0 flex flex-col">
          <ConstraintsPanel />
        </TabsContent>
        <TabsContent value="ai" className="flex-1 mt-0 min-h-0">
          <SelectNodePlaceholder message="노드를 선택하면 AI 도구를 쓸 수 있습니다" />
        </TabsContent>
        <TabsContent value="cypher" className="flex-1 mt-0 min-h-0 flex flex-col">
          <Text2CypherTab />
        </TabsContent>
        <TabsContent value="evidence" className="flex-1 mt-0 min-h-0">
          <SelectNodePlaceholder message="노드를 선택하면 근거가 표시됩니다" />
        </TabsContent>
      </Tabs>
    </aside>
  );
}

function AddPropertyInline({
  classId,
  className,
  classDescription,
  existingPropertyNames,
  onDone,
}: {
  classId: string;
  className?: string;
  classDescription?: string;
  existingPropertyNames?: string[];
  onDone: () => void;
}) {
  const addProperty = useOntologyStore((s) => s.addProperty);
  const [name, setName] = useState('');
  const [dataType, setDataType] = useState<DataType>('string');
  const inputRef = useRef<HTMLInputElement>(null);

  const propAC = usePropertyAutocomplete();
  const [showPropAC, setShowPropAC] = useState(false);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleAdd = () => {
    if (!name.trim()) return;
    addProperty({ name: name.trim(), classId, dataType });
    setName('');
    setDataType('string');
    inputRef.current?.focus();
  };

  const handleACSelect = (s: { name: string; dataType?: string; isRequired?: boolean }) => {
    setName(s.name);
    if (s.dataType && DATA_TYPES.includes(s.dataType as DataType)) {
      setDataType(s.dataType as DataType);
    }
    setShowPropAC(false);
    propAC.clear();
  };

  const triggerAC = () => {
    setShowPropAC(true);
    propAC.trigger(name, className ?? '', classDescription, existingPropertyNames);
  };

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1 py-1 px-1 -mx-1 bg-primary/5 rounded">
        <input
          ref={inputRef}
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleAdd();
            if (e.key === 'Escape') onDone();
            if (e.ctrlKey && e.key === ' ') {
              e.preventDefault();
              triggerAC();
            }
          }}
          placeholder={'\uC774\uB984'}
          className="flex-1 min-w-0 h-6 text-xs font-mono bg-transparent border-b border-primary/20 outline-none focus:border-primary/40 px-0.5"
        />
        <select
          value={dataType}
          onChange={(e) => setDataType(e.target.value as DataType)}
          className="h-6 text-[11px] bg-transparent border border-border rounded px-1 outline-none"
        >
          {DATA_TYPES.map((t) => (
            <option key={t} value={t}>{DATA_TYPE_LABEL[t]}</option>
          ))}
        </select>
        <button
          className="w-6 h-6 flex items-center justify-center text-primary hover:bg-primary/10 rounded transition-colors"
          onClick={handleAdd}
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:bg-muted/50 rounded transition-colors"
          onClick={onDone}
        >
          <X className="w-3 h-3" />
        </button>
      </div>
      <div className="px-1 -mx-1">
        <AutocompleteSuggestions
          suggestions={propAC.suggestions}
          isLoading={propAC.isLoading}
          error={propAC.error}
          visible={showPropAC}
          label={`AI \uCD94\uCC9C`}
          onTrigger={triggerAC}
          onSelect={handleACSelect}
        />
      </div>
    </div>
  );
}

function AddSubclassInline({ parentId, parentColor, onDone }: { parentId: string; parentColor: string; onDone: () => void }) {
  const addClass = useOntologyStore((s) => s.addClass);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleAdd = () => {
    if (!name.trim()) return;
    addClass({ name: name.trim(), parentId, color: parentColor });
    setName('');
    inputRef.current?.focus();
  };

  return (
    <div className="flex items-center gap-1 py-1 px-1 -mx-1 bg-primary/5 rounded">
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleAdd();
          if (e.key === 'Escape') onDone();
        }}
        placeholder="하위 클래스 이름"
        className="flex-1 min-w-0 h-6 text-xs font-mono bg-transparent border-b border-primary/20 outline-none focus:border-primary/40 px-0.5"
      />
      <button
        className="w-6 h-6 flex items-center justify-center text-primary hover:bg-primary/10 rounded transition-colors"
        onClick={handleAdd}
      >
        <Check className="w-3 h-3" />
      </button>
      <button
        className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:bg-muted/50 rounded transition-colors"
        onClick={onDone}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function AddInstanceInline({ classId, onDone }: { classId: string; onDone: () => void }) {
  const addInstance = useOntologyStore((s) => s.addInstance);
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleAdd = () => {
    if (!name.trim()) return;
    addInstance({ name: name.trim(), classId });
    setName('');
    inputRef.current?.focus();
  };

  return (
    <div className="flex items-center gap-1 py-1 px-1 -mx-1 bg-primary/5 rounded">
      <input
        ref={inputRef}
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleAdd();
          if (e.key === 'Escape') onDone();
        }}
        placeholder="인스턴스 이름"
        className="flex-1 min-w-0 h-6 text-xs font-mono bg-transparent border-b border-primary/20 outline-none focus:border-primary/40 px-0.5"
      />
      <button
        className="w-6 h-6 flex items-center justify-center text-primary hover:bg-primary/10 rounded transition-colors"
        onClick={handleAdd}
      >
        <Check className="w-3 h-3" />
      </button>
      <button
        className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:bg-muted/50 rounded transition-colors"
        onClick={onDone}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function AddConstraintInline({ classId, onDone }: { classId: string; onDone: () => void }) {
  const addAxiom = useOntologyStore((s) => s.addAxiom);
  const [description, setDescription] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleAdd = () => {
    if (!description.trim()) return;
    addAxiom({ description: description.trim(), classIds: [classId] });
    setDescription('');
    inputRef.current?.focus();
  };

  return (
    <div className="flex items-center gap-1 py-1 px-1 -mx-1 bg-primary/5 rounded">
      <input
        ref={inputRef}
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') handleAdd();
          if (e.key === 'Escape') onDone();
        }}
        onBlur={() => {
          if (!description.trim()) onDone();
        }}
        placeholder="제약조건 설명"
        className="flex-1 min-w-0 h-6 text-xs bg-transparent border-b border-primary/20 outline-none focus:border-primary/40 px-0.5"
      />
      <button
        className="w-6 h-6 flex items-center justify-center text-primary hover:bg-primary/10 rounded transition-colors"
        onClick={handleAdd}
      >
        <Check className="w-3 h-3" />
      </button>
      <button
        className="w-6 h-6 flex items-center justify-center text-muted-foreground hover:bg-muted/50 rounded transition-colors"
        onClick={onDone}
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}

function InstanceValueRow({
  propertyName,
  dataType,
  isRequired,
  enumValues,
  value,
  onSave,
}: {
  propertyName: string;
  dataType: DataType;
  isRequired: boolean;
  enumValues: string[] | null;
  value: string;
  onSave: (val: string) => void;
  onSaved?: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);
  const { savedFlash, markSaved } = useSavedFlash(onSaved);

  useEffect(() => {
    setDraft(value);
  }, [value]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  const handleSave = useCallback(() => {
    if (draft !== value) {
      onSave(draft);
      markSaved();
    }
    setEditing(false);
  }, [draft, value, onSave, markSaved]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSave();
    if (e.key === 'Escape') {
      setDraft(value);
      setEditing(false);
    }
  };

  const renderEditor = () => {
    if (dataType === 'boolean') {
      return (
        <button
          className={`w-8 h-4 rounded-full relative transition-colors ${
            value === 'true' ? 'bg-primary' : 'bg-muted-foreground/30'
          }`}
          onClick={() => {
            onSave(value === 'true' ? 'false' : 'true');
            markSaved();
          }}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow-sm transition-transform ${
              value === 'true' ? 'left-[18px]' : 'left-0.5'
            }`}
          />
        </button>
      );
    }

    if (dataType === 'enum' && enumValues && enumValues.length > 0) {
      return (
        <select
          value={value}
          onChange={(e) => {
            onSave(e.target.value);
            markSaved();
          }}
          className="h-6 text-xs bg-transparent border border-border rounded px-1.5 outline-none min-w-[80px] max-w-[140px]"
        >
          <option value="">--</option>
          {enumValues.map((ev) => (
            <option key={ev} value={ev}>{ev}</option>
          ))}
        </select>
      );
    }

    if (editing) {
      return (
        <input
          ref={inputRef}
          type={dataType === 'integer' || dataType === 'float' ? 'number' : dataType === 'date' ? 'date' : 'text'}
          step={dataType === 'float' ? '0.01' : undefined}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          className="flex-1 min-w-0 h-6 text-xs bg-transparent border-b border-primary/30 outline-none focus:border-primary/50 px-0.5 max-w-[140px]"
          placeholder="..."
        />
      );
    }

    return (
      <span
        className={`text-xs cursor-pointer px-1 py-0.5 rounded hover:bg-muted/50 transition-colors truncate max-w-[140px] ${
          value ? 'text-foreground' : 'text-muted-foreground italic'
        }`}
        onClick={() => setEditing(true)}
      >
        {value || '비어있음'}
      </span>
    );
  };

  return (
    <div className="flex items-center gap-2 py-1.5 px-1.5 rounded hover:bg-muted/40 transition-colors -mx-1">
      <span className="text-xs font-mono text-primary/80 truncate min-w-[60px] shrink-0">{propertyName}</span>
      {isRequired && (
        <span className="text-[11px] text-amber-500 shrink-0">*</span>
      )}
      {savedFlash && <Check className="w-3 h-3 text-success shrink-0" data-testid="field-saved-check" />}
      <span className="flex-1" />
      {renderEditor()}
    </div>
  );
}

export default function RightPanel({ onDeleteRequest }: { onDeleteRequest?: () => void } = {}) {
  const selectedNodeId = useOntologyStore((s) => s.selectedNodeId);
  const selectedNodeType = useOntologyStore((s) => s.selectedNodeType);
  const updateClass = useOntologyStore((s) => s.updateClass);
  const selectNode = useOntologyStore((s) => s.selectNode);
  const requestNodeExpansion = useOntologyStore((s) => s.requestNodeExpansion);
  const aiExpandRequest = useOntologyStore((s) => s.aiExpandRequest);
  const [activeTab, setActiveTab] = useState('detail');

  // 확장 요청이 올라오면 AI 탭으로 전환해 AIAssistantTab을 마운트/노출한다.
  useEffect(() => {
    if (aiExpandRequest) setActiveTab('ai');
  }, [aiExpandRequest]);

  // Individual selectors avoid useShallow + React 19 useSyncExternalStore conflict
  const storeClasses = useOntologyStore((s) => s.classes);
  const storeInstances = useOntologyStore((s) => s.instances);
  const storeProperties = useOntologyStore((s) => s.properties);
  const storeInstanceValues = useOntologyStore((s) => s.instanceValues);
  const storeEdges = useOntologyStore((s) => s.edges);
  const storeAxioms = useOntologyStore((s) => s.axioms);
  const storeRelationTypes = useOntologyStore((s) => s.relationTypes);

  const nodeDetail = useMemo(() => {
    const id = selectedNodeId;
    const type = selectedNodeType;
    if (!id) return null;

    const selectedClass = type === 'class' ? storeClasses.find((c) => c.id === id) : null;
    const selectedInstance = type === 'instance' ? storeInstances.find((i) => i.id === id) : null;
    if (!selectedClass && !selectedInstance) return null;

    const parentClass = selectedInstance
      ? storeClasses.find((c) => c.id === selectedInstance.classId) ?? null
      : null;

    return {
      selectedClass,
      selectedInstance,
      parentClass,
      nodeName: selectedClass?.name ?? selectedInstance?.name ?? '',
      nodeColor: selectedClass?.color ?? parentClass?.color ?? '#86efac',
      nodeDescription: selectedClass?.description ?? '',
      subclasses: selectedClass ? storeClasses.filter((c) => c.parentId === id) : [],
      nodeProperties: selectedClass
        ? storeProperties.filter((p) => p.classId === id).sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
      instanceProperties: selectedInstance && parentClass
        ? storeProperties.filter((p) => p.classId === parentClass.id).sort((a, b) => a.sortOrder - b.sortOrder)
        : [],
      instanceValues: selectedInstance
        ? storeInstanceValues.filter((iv) => iv.instanceId === id)
        : [],
      nodeInstances: selectedClass ? storeInstances.filter((i) => i.classId === id) : [],
      nodeEdges: storeEdges.filter((e) => e.sourceId === id || e.targetId === id),
      nodeAxioms: selectedClass ? storeAxioms.filter((a) => a.classIds.includes(id)) : [],
      allProperties: storeProperties,
      relationTypes: storeRelationTypes,
      classes: storeClasses,
      instances: storeInstances,
    };
  }, [selectedNodeId, selectedNodeType, storeClasses, storeInstances, storeProperties, storeInstanceValues, storeEdges, storeAxioms, storeRelationTypes]);

  const addProperty = useOntologyStore((s) => s.addProperty);
  const addAxiom = useOntologyStore((s) => s.addAxiom);
  const removeProperty = useOntologyStore((s) => s.removeProperty);
  const removeInstance = useOntologyStore((s) => s.removeInstance);
  const removeEdge = useOntologyStore((s) => s.removeEdge);
  const removeAxiom = useOntologyStore((s) => s.removeAxiom);
  const openPopover = useOntologyStore((s) => s.openPopover);
  const updateInstance = useOntologyStore((s) => s.updateInstance);
  const setInstanceValue = useOntologyStore((s) => s.setInstanceValue);

  const [showAddProperty, setShowAddProperty] = useState(false);
  const [showAddSubclass, setShowAddSubclass] = useState(false);
  const [showAddInstance, setShowAddInstance] = useState(false);
  const [showAddConstraint, setShowAddConstraint] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  // PRD-K M4 (B3): 패널 안 저장 상태 — 필드 저장 시 갱신, 헤더에 "초안에 저장됨 ✓" 상시 표시.
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null);
  const notifyFieldSaved = useCallback(() => setLastSavedAt(Date.now()), []);

  // These useMemo hooks MUST be before the early return to maintain consistent hook order
  const inheritedProperties = useMemo(() => {
    if (!nodeDetail?.selectedClass) return [];
    return getInheritedProperties(nodeDetail.selectedClass.id, nodeDetail.classes, nodeDetail.allProperties)
      .filter((ip) => !ip.isOverridden);
  }, [nodeDetail]);

  const inheritedByAncestor = useMemo(() => {
    const groups: Record<string, { name: string; props: InheritedProperty[] }> = {};
    for (const ip of inheritedProperties) {
      const key = ip.inheritedFrom!;
      if (!groups[key]) {
        groups[key] = { name: ip.inheritedFromName!, props: [] };
      }
      groups[key].props.push(ip);
    }
    return Object.entries(groups);
  }, [inheritedProperties]);

  const allInheritedForInstance = useMemo(() => {
    if (!nodeDetail?.selectedInstance || !nodeDetail?.parentClass) return [];
    return getInheritedProperties(nodeDetail.parentClass.id, nodeDetail.classes, nodeDetail.allProperties)
      .filter((ip) => !ip.isOverridden);
  }, [nodeDetail]);

  if (!selectedNodeId || !nodeDetail)
    return <EmptyState activeTab={activeTab} onTabChange={setActiveTab} />;

  const {
    selectedClass,
    selectedInstance,
    parentClass,
    nodeName,
    nodeColor,
    nodeDescription,
    subclasses,
    nodeProperties,
    instanceProperties,
    instanceValues,
    nodeInstances,
    nodeEdges,
    nodeAxioms,
    allProperties,
    relationTypes,
    classes,
    instances,
  } = nodeDetail;

  const handleOverride = (ip: InheritedProperty) => {
    if (!selectedClass) return;
    addProperty({
      name: ip.name,
      classId: selectedClass.id,
      dataType: ip.dataType,
      isRequired: ip.isRequired,
      enumValues: ip.enumValues,
      constraintRule: ip.constraintRule,
    });
  };

  const handleNameSave = () => {
    if (nameDraft.trim() && nameDraft !== nodeName) {
      if (selectedClass) {
        updateClass(selectedClass.id, { name: nameDraft.trim() });
      } else if (selectedInstance) {
        updateInstance(selectedInstance.id, { name: nameDraft.trim() });
      }
      notifyFieldSaved();
    }
    setEditingName(false);
  };

  const handleNavigate = (id: string, type: 'class' | 'instance') => {
    selectNode(id, type);
  };

  return (
    <aside className="w-full h-full flex flex-col bg-card overflow-hidden" data-testid="right-panel">
      {/* Parent class breadcrumb for instances */}
      {selectedInstance && parentClass && (
        <button
          className="flex items-center gap-1 px-4 py-1.5 text-xs text-primary/70 hover:text-primary hover:bg-muted/30 transition-colors w-full text-left shrink-0"
          onClick={() => handleNavigate(parentClass.id, 'class')}
        >
          <ArrowLeft className="w-3 h-3" />
          <span>{parentClass.name}의 인스턴스</span>
        </button>
      )}

      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-[52px] shrink-0">
        <div
          className="w-2.5 h-2.5 rounded-full shrink-0"
          style={{ backgroundColor: nodeColor }}
        />
        {editingName ? (
          <input
            type="text"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleNameSave();
              if (e.key === 'Escape') setEditingName(false);
            }}
            className="text-sm font-semibold tracking-tight bg-transparent border-b border-primary/30 outline-none flex-1 min-w-0"
            autoFocus
          />
        ) : (
          <span
            className="text-sm font-semibold tracking-tight truncate cursor-pointer hover:text-primary/80 transition-colors flex-1"
            onClick={() => {
              setNameDraft(nodeName);
              setEditingName(true);
            }}
          >
            {nodeName}
          </span>
        )}
        <Badge
          variant="outline"
          className="text-[11px] h-5 shrink-0 uppercase"
          title={
            selectedNodeType === 'class'
              ? '클래스 — 유형·카테고리(비슷한 것들을 대표하는 묶음)'
              : '인스턴스 — 실제 사례(클래스의 구체적 한 개)'
          }
        >
          {selectedNodeType === 'class' ? 'CLASS' : 'INSTANCE'}
        </Badge>
        {/* PRD-K M4 (B3): 화면 반대편 CommitBar 를 보지 않고도 패널 안에서 저장 상태 확인 */}
        {lastSavedAt !== null && (
          <span
            className="flex items-center gap-0.5 text-[11px] text-muted-foreground shrink-0"
            data-testid="panel-saved-status"
            title="편집 내용이 초안(스테이징)에 저장되었습니다"
          >
            <Check className="w-3 h-3 text-success" />
            초안에 저장됨
          </span>
        )}
        {selectedNodeId && (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-2 gap-1 text-primary hover:text-primary hover:bg-primary/10 shrink-0"
            onClick={() => requestNodeExpansion(selectedNodeId)}
            title="이 노드를 기준으로 AI 확장"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span className="text-xs">확장</span>
          </Button>
        )}
        {onDeleteRequest && (
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive shrink-0"
            onClick={onDeleteRequest}
            title="삭제 (Delete)"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </div>

      <Separator />

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-9 px-4 shrink-0">
          <TabsTrigger value="detail" className="text-xs h-8 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            상세
          </TabsTrigger>
          <TabsTrigger value="relations" className="text-xs h-8 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            관계
          </TabsTrigger>
          <TabsTrigger value="constraints" className="text-xs h-8 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none gap-1">
            <Shield className="w-3 h-3" />
            제약
          </TabsTrigger>
          <TabsTrigger value="ai" className="text-xs h-8 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            AI
          </TabsTrigger>
          <TabsTrigger value="cypher" className="text-xs h-8 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none gap-1">
            <Terminal className="w-3 h-3" />
            Cypher
          </TabsTrigger>
          <TabsTrigger value="evidence" className="text-xs h-8 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none gap-1">
            <FileSearch className="w-3 h-3" />
            근거
          </TabsTrigger>
        </TabsList>

        {/* Detail Tab */}
        <TabsContent value="detail" className="flex-1 mt-0 min-h-0">
          <ScrollArea className="h-full">
            {/* Description */}
            {selectedClass && (
              <div className="px-4 py-3">
                <InlineEditableText
                  value={nodeDescription}
                  placeholder="클릭하여 설명을 추가하세요..."
                  onSave={(val) => updateClass(selectedClass.id, { description: val })}
                  onSaved={notifyFieldSaved}
                  multiline
                  className="leading-relaxed"
                />
              </div>
            )}

            {/* Provenance (출처): 추출·보강 시 영속화된 sourceType/evidence 표시(표시 전용).
                M6: AI confidence 는 매 추출마다 기준이 달라 재현 불가능한 신호라 노출하지 않는다
                (값은 provenance 로 보존하되 사용자에게 숫자로 보여주지 않음). */}
            {selectedClass &&
              (selectedClass.sourceType || selectedClass.evidence) && (
                <div className="px-4 pb-3 -mt-1 space-y-1.5">
                  <div className="flex items-center flex-wrap gap-1">
                    {selectedClass.sourceType && (
                      <Badge variant="outline" className="text-[11px] h-5 px-1.5 text-muted-foreground">
                        {sourceTypeLabel(selectedClass.sourceType)}
                      </Badge>
                    )}
                  </div>
                  {selectedClass.evidence && selectedClass.evidence !== 'existing' && (
                    <p
                      className="text-[11px] text-muted-foreground/70 italic line-clamp-2"
                      title={selectedClass.evidence}
                    >
                      &ldquo;{selectedClass.evidence}&rdquo;
                    </p>
                  )}
                </div>
              )}

            <Separator />

            {/* Subclasses */}
            {selectedClass && (
              <>
                <CollapsibleSection
                  title="하위 클래스"
                  hint="이 유형을 더 잘게 나눈 종류 (예: 차량 → 승용차·트럭)"
                  count={subclasses.length}
                  defaultOpen
                  onAdd={() => setShowAddSubclass(true)}
                  addLabel="하위 클래스 추가"
                >
                  {subclasses.map((sub) => (
                    <button
                      key={sub.id}
                      className="flex items-center gap-1.5 w-full text-left py-1.5 px-1.5 rounded hover:bg-muted/50 transition-colors -mx-1"
                      onClick={() => handleNavigate(sub.id, 'class')}
                    >
                      <div
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: sub.color }}
                      />
                      <span className="text-xs">{sub.name}</span>
                      <ArrowRight className="w-2.5 h-2.5 text-muted-foreground ml-auto opacity-60 group-hover:opacity-100" />
                    </button>
                  ))}
                  {showAddSubclass && selectedClass && (
                    <AddSubclassInline
                      parentId={selectedClass.id}
                      parentColor={selectedClass.color}
                      onDone={() => setShowAddSubclass(false)}
                    />
                  )}
                  {subclasses.length === 0 && !showAddSubclass && (
                    <p className="text-xs text-muted-foreground py-1">하위 클래스가 없습니다</p>
                  )}
                </CollapsibleSection>

                <Separator />
              </>
            )}

            {/* Properties */}
            {selectedClass && (
              <>
                <CollapsibleSection
                  title="속성"
                  hint="이 유형이 가지는 항목 (예: 이름·나이·가격)"
                  count={nodeProperties.length}
                  defaultOpen
                  onAdd={() => setShowAddProperty(true)}
                  addLabel="속성 추가"
                >
                  {nodeProperties.map((prop) => (
                    <PropertyRow
                      key={prop.id}
                      name={prop.name}
                      dataType={prop.dataType}
                      isRequired={prop.isRequired}
                      enumValues={prop.enumValues}
                      onDelete={() => removeProperty(prop.id)}
                    />
                  ))}
                  {showAddProperty && (
                    <AddPropertyInline
                      classId={selectedNodeId}
                      className={nodeName}
                      classDescription={nodeDescription}
                      existingPropertyNames={nodeProperties.map((p) => p.name)}
                      onDone={() => setShowAddProperty(false)}
                    />
                  )}
                </CollapsibleSection>

                <Separator />

                {/* Inherited Properties */}
                {inheritedByAncestor.length > 0 && (
                  <>
                    {inheritedByAncestor.map(([ancestorId, { name: ancestorName, props }]) => (
                      <div key={ancestorId} className="px-4 py-2">
                        <div className="flex items-center gap-1.5 mb-2">
                          <span className="text-sm font-semibold tracking-tight text-muted-foreground/70">
                            {ancestorName}에서 상속된 속성
                          </span>
                          <span className="text-[11px] font-mono text-muted-foreground/60 ml-auto">
                            ({props.length})
                          </span>
                        </div>
                        <div className="space-y-0.5">
                          {props.map((ip) => (
                            <InheritedPropertyRow
                              key={ip.id}
                              name={ip.name}
                              dataType={ip.dataType}
                              isRequired={ip.isRequired}
                              inheritedFromName={ancestorName}
                              onOverride={() => handleOverride(ip)}
                            />
                          ))}
                        </div>
                      </div>
                    ))}
                    <Separator />
                  </>
                )}
              </>
            )}

            {/* Constraints */}
            {selectedClass && (
              <>
                <CollapsibleSection
                  title="제약조건"
                  hint="이 유형이 지켜야 할 규칙 (예: 나이는 0 이상)"
                  count={nodeAxioms.length}
                  defaultOpen={false}
                  onAdd={() => setShowAddConstraint(true)}
                  addLabel="제약조건 추가"
                >
                  {nodeAxioms.map((axiom) => (
                    <div key={axiom.id} className="flex items-start gap-1.5 py-1.5 px-1.5 rounded hover:bg-muted/40 transition-colors -mx-1 group">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-xs text-foreground leading-relaxed flex-1">{axiom.description}</span>
                      <button
                        className="-my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-60 transition-opacity text-muted-foreground hover:text-destructive group-hover:opacity-100"
                        onClick={() => removeAxiom(axiom.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
                  {showAddConstraint && selectedClass && (
                    <AddConstraintInline
                      classId={selectedClass.id}
                      onDone={() => setShowAddConstraint(false)}
                    />
                  )}
                  {nodeAxioms.length === 0 && !showAddConstraint && (
                    <p className="text-xs text-muted-foreground py-1">제약조건이 없습니다</p>
                  )}
                </CollapsibleSection>

                <Separator />
              </>
            )}

            {/* Instances */}
            {selectedClass && (
              <CollapsibleSection
                title="인스턴스 (실제 사례)"
                hint="이 유형에 속하는 실제 개체 (예: 홍길동, 3호기)"
                count={nodeInstances.length}
                defaultOpen={false}
                onAdd={() => setShowAddInstance(true)}
                addLabel="인스턴스 추가"
              >
                {showAddInstance && selectedClass && (
                  <AddInstanceInline
                    classId={selectedClass.id}
                    onDone={() => setShowAddInstance(false)}
                  />
                )}
                {nodeInstances.length > 0 ? (
                  <div className="border border-border rounded-md overflow-hidden">
                    <div className="flex items-center bg-muted/30 px-2 py-1 border-b border-border">
                      <span className="text-[11px] font-semibold text-muted-foreground uppercase flex-1">이름</span>
                      {nodeProperties.slice(0, 2).map((prop) => (
                        <span key={prop.id} className="text-[11px] font-semibold text-muted-foreground uppercase w-16 text-right truncate">
                          {prop.name}
                        </span>
                      ))}
                    </div>
                    {nodeInstances.map((inst) => (
                      <div
                        key={inst.id}
                        className="flex items-center w-full px-2 py-1.5 hover:bg-muted/30 transition-colors border-b border-border last:border-b-0 group"
                      >
                        <button
                          className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                          onClick={() => handleNavigate(inst.id, 'instance')}
                        >
                          <Circle className="w-2 h-2 text-green-400 shrink-0" strokeWidth={2} />
                          <span className="text-xs text-foreground truncate">{inst.name}</span>
                        </button>
                        {/* PRD-K M4 (B7): '—' 하드코딩 대신 실제 값 미리보기 */}
                        {nodeProperties.slice(0, 2).map((prop) => {
                          const preview = storeInstanceValues.find(
                            (iv) => iv.instanceId === inst.id && iv.propertyId === prop.id,
                          )?.value;
                          return (
                            <span
                              key={prop.id}
                              className={`text-xs w-16 text-right truncate ${
                                preview ? 'text-foreground' : 'text-muted-foreground'
                              }`}
                              title={preview || undefined}
                            >
                              {preview || '—'}
                            </span>
                          );
                        })}
                        <button
                          className="ml-1 -my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-60 transition-opacity text-muted-foreground hover:text-destructive group-hover:opacity-100"
                          onClick={() => removeInstance(inst.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground py-1">인스턴스가 없습니다</p>
                )}
              </CollapsibleSection>
            )}

            {/* Instance detail view */}
            {selectedInstance && (
              <>
                {/* Property Values */}
                <CollapsibleSection
                  title="속성 값"
                  hint="이 사례의 실제 값을 입력하세요"
                  count={instanceProperties.length + allInheritedForInstance.length}
                  defaultOpen
                >
                  {instanceProperties.length > 0 || allInheritedForInstance.length > 0 ? (
                    <div className="space-y-1">
                      {instanceProperties.map((prop) => {
                        const iv = instanceValues.find((v) => v.propertyId === prop.id);
                        const currentValue = iv?.value ?? '';

                        return (
                          <InstanceValueRow
                            key={prop.id}
                            propertyName={prop.name}
                            dataType={prop.dataType}
                            isRequired={prop.isRequired}
                            enumValues={prop.enumValues}
                            value={currentValue}
                            onSave={(val) => setInstanceValue(selectedInstance.id, prop.id, val)}
                            onSaved={notifyFieldSaved}
                          />
                        );
                      })}
                      {allInheritedForInstance.length > 0 && instanceProperties.length > 0 && (
                        <div className="border-t border-border/50 my-1" />
                      )}
                      {allInheritedForInstance.map((ip) => {
                        const iv = instanceValues.find((v) => v.propertyId === ip.id);
                        const currentValue = iv?.value ?? '';

                        return (
                          <InstanceValueRow
                            key={`inherited-${ip.id}`}
                            propertyName={ip.name}
                            dataType={ip.dataType}
                            isRequired={ip.isRequired}
                            enumValues={ip.enumValues}
                            value={currentValue}
                            onSave={(val) => setInstanceValue(selectedInstance.id, ip.id, val)}
                            onSaved={notifyFieldSaved}
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground py-1">
                      부모 클래스에 프로퍼티가 없습니다
                    </p>
                  )}
                </CollapsibleSection>

                <Separator />
              </>
            )}
          </ScrollArea>
        </TabsContent>

        {/* Relations Tab */}
        <TabsContent value="relations" className="flex-1 mt-0 min-h-0">
          <ScrollArea className="h-full">
            <CollapsibleSection
              title="관계"
              hint="다른 노드와 어떻게 연결되는지 (예: 회사 →고용→ 사람)"
              count={nodeEdges.length}
              defaultOpen
              onAdd={(e) => {
                if (!selectedNodeId) return;
                // PRD-K M4 (B12): 화면 정중앙이 아니라 트리거 버튼 인근에 열어 컨텍스트 유지.
                const rect = e.currentTarget.getBoundingClientRect();
                openPopover({
                  type: 'relation',
                  position: { x: rect.left, y: rect.bottom + 8 },
                  sourceId: selectedNodeId,
                });
              }}
              addLabel="관계 추가"
            >
              {nodeEdges.map((edge) => {
                const relType = relationTypes.find((r) => r.id === edge.relationTypeId);
                const isOutgoing = edge.sourceId === selectedNodeId;
                const otherNodeId = isOutgoing ? edge.targetId : edge.sourceId;
                const otherClass = classes.find((c) => c.id === otherNodeId);
                const otherInstance = instances.find((i) => i.id === otherNodeId);
                const otherName = otherClass?.name ?? otherInstance?.name ?? '?';

                return (
                  <div key={edge.id} className="flex items-center gap-1.5 py-1.5 px-1.5 rounded hover:bg-muted/40 transition-colors -mx-1 group">
                    {isOutgoing ? (
                      <ArrowRight className="w-3 h-3 text-muted-foreground shrink-0" />
                    ) : (
                      <ArrowLeft className="w-3 h-3 text-muted-foreground shrink-0" />
                    )}
                    <Badge variant="secondary" className="h-5 text-[11px] px-1.5 font-normal bg-cyan-50 text-cyan-700 border-cyan-200 shrink-0">
                      {relType?.name ?? 'relation'}
                    </Badge>
                    <button
                      className="text-xs text-foreground hover:text-primary transition-colors truncate flex-1 text-left"
                      onClick={() => handleNavigate(otherNodeId, otherClass ? 'class' : 'instance')}
                    >
                      {otherName}
                    </button>
                    <button
                      className="-my-1 flex h-6 w-6 shrink-0 items-center justify-center rounded opacity-60 transition-opacity text-muted-foreground hover:text-destructive group-hover:opacity-100"
                      onClick={() => removeEdge(edge.id)}
                      aria-label={`관계 삭제: ${relType?.name ?? 'relation'} → ${otherName}`}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
              {nodeEdges.length === 0 && (
                <p className="text-xs text-muted-foreground py-1">관계가 없습니다</p>
              )}
            </CollapsibleSection>
          </ScrollArea>
        </TabsContent>

        {/* Constraints Tab */}
        <TabsContent value="constraints" className="flex-1 mt-0 min-h-0 flex flex-col">
          <ConstraintsPanel />
        </TabsContent>

        {/* AI Tab */}
        <TabsContent value="ai" className="flex-1 mt-0 min-h-0 flex flex-col">
          <AIAssistantTab nodeName={nodeName} />
        </TabsContent>

        {/* Cypher Tab */}
        <TabsContent value="cypher" className="flex-1 mt-0 min-h-0 flex flex-col">
          <Text2CypherTab />
        </TabsContent>

        {/* Evidence Tab (근거) — 데이터 모델의 provenance 노출(표시 전용) */}
        <TabsContent value="evidence" className="flex-1 mt-0 min-h-0 flex flex-col">
          <EvidencePanel
            nodeName={nodeName}
            nodeProvenance={
              selectedClass
                ? {
                    sourceType: selectedClass.sourceType,
                    evidence: selectedClass.evidence,
                    confidence: selectedClass.confidence,
                  }
                : null
            }
            edgeEvidence={nodeEdges.map((edge): EdgeEvidence => {
              const relType = relationTypes.find((r) => r.id === edge.relationTypeId);
              const isOutgoing = edge.sourceId === selectedNodeId;
              const otherNodeId = isOutgoing ? edge.targetId : edge.sourceId;
              const otherClass = classes.find((c) => c.id === otherNodeId);
              const otherInstance = instances.find((i) => i.id === otherNodeId);
              return {
                id: edge.id,
                relationName: relType?.name ?? 'relation',
                direction: isOutgoing ? 'out' : 'in',
                otherName: otherClass?.name ?? otherInstance?.name ?? '?',
                sourceType: edge.sourceType,
                evidence: edge.evidence,
                confidence: edge.confidence,
              };
            })}
          />
        </TabsContent>
      </Tabs>
    </aside>
  );
}
