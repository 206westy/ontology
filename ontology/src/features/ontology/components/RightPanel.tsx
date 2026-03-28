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

const DATA_TYPES: DataType[] = ['string', 'integer', 'float', 'boolean', 'date', 'enum'];


interface CollapsibleSectionProps {
  title: string;
  count: number;
  defaultOpen?: boolean;
  onAdd?: () => void;
  addLabel?: string;
  children: React.ReactNode;
}

function CollapsibleSection({ title, count, defaultOpen = true, onAdd, addLabel = '추가', children }: CollapsibleSectionProps) {
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
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          {title}
        </span>
        <span className="text-[10px] font-mono text-muted-foreground ml-auto">
          ({count})
        </span>
      </button>
      {open && (
        <div className="mt-2 space-y-0.5">
          {children}
          {onAdd && (
            <button
              className="flex items-center gap-1 text-[11px] text-primary/70 hover:text-primary mt-1.5 transition-colors"
              onClick={(e) => {
                e.stopPropagation();
                onAdd();
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

function InlineEditableText({
  value,
  placeholder,
  onSave,
  multiline = false,
  className = '',
}: {
  value: string;
  placeholder: string;
  onSave: (val: string) => void;
  multiline?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLTextAreaElement | HTMLInputElement>(null);

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
      <Pencil className="w-2.5 h-2.5 text-muted-foreground opacity-0 group-hover:opacity-100 inline ml-1.5 transition-opacity" />
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
      <span className="text-[11px] font-mono text-primary/80 truncate flex-1">{name}</span>
      <Badge variant="secondary" className="h-4 text-[9px] px-1.5 font-normal shrink-0">
        {dataType}
      </Badge>
      {isRequired && (
        <Badge variant="outline" className="h-4 text-[9px] px-1 font-normal text-amber-600 border-amber-300 shrink-0">
          req
        </Badge>
      )}
      {dataType === 'enum' && enumValues && (
        <Badge variant="outline" className="h-4 text-[9px] px-1 font-normal text-cyan-600 border-cyan-300 shrink-0">
          {enumValues.length}
        </Badge>
      )}
      {onDelete && (
        <button
          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
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
      <span className="text-[11px] font-mono text-muted-foreground truncate flex-1">{name}</span>
      <Badge variant="secondary" className="h-4 text-[9px] px-1.5 font-normal shrink-0 opacity-60">
        {dataType}
      </Badge>
      {isRequired && (
        <Badge variant="outline" className="h-4 text-[9px] px-1 font-normal text-amber-600/60 border-amber-300/60 shrink-0">
          req
        </Badge>
      )}
      <button
        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary shrink-0"
        onClick={(e) => { e.stopPropagation(); onOverride(); }}
        title={`${inheritedFromName}에서 상속됨 — 클릭하여 오버라이드`}
      >
        <Copy className="w-3 h-3" />
      </button>
    </div>
  );
}

function EmptyState() {
  return (
    <aside className="w-full h-full flex flex-col bg-card overflow-hidden">
      <div className="flex items-center px-4 h-[52px] shrink-0">
        <span className="text-sm font-semibold tracking-tight">속성 패널</span>
      </div>
      <Separator />
      <Tabs defaultValue="empty" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-9 px-4 shrink-0">
          <TabsTrigger value="empty" className="text-xs h-7 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            상세
          </TabsTrigger>
          <TabsTrigger value="cypher" className="text-xs h-7 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none gap-1">
            <Terminal className="w-3 h-3" />
            Cypher
          </TabsTrigger>
          <TabsTrigger value="constraints" className="text-xs h-7 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none gap-1">
            <Shield className="w-3 h-3" />
            제약
          </TabsTrigger>
        </TabsList>
        <TabsContent value="empty" className="flex-1 mt-0 min-h-0">
          <div className="flex-1 flex items-center justify-center px-6 h-full">
            <div className="text-center">
              <div className="w-12 h-12 rounded-full bg-muted/50 flex items-center justify-center mx-auto mb-3">
                <Circle className="w-5 h-5 text-muted-foreground" />
              </div>
              <p className="text-xs text-muted-foreground">노드를 선택하면 정보가 표시됩니다</p>
            </div>
          </div>
        </TabsContent>
        <TabsContent value="cypher" className="flex-1 mt-0 min-h-0 flex flex-col">
          <Text2CypherTab />
        </TabsContent>
        <TabsContent value="constraints" className="flex-1 mt-0 min-h-0 flex flex-col">
          <ConstraintsPanel />
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
          className="flex-1 min-w-0 h-6 text-[11px] font-mono bg-transparent border-b border-primary/20 outline-none focus:border-primary/40 px-0.5"
        />
        <select
          value={dataType}
          onChange={(e) => setDataType(e.target.value as DataType)}
          className="h-6 text-[9px] bg-transparent border border-border rounded px-1 outline-none"
        >
          {DATA_TYPES.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>
        <button
          className="w-5 h-5 flex items-center justify-center text-primary hover:bg-primary/10 rounded transition-colors"
          onClick={handleAdd}
        >
          <Check className="w-3 h-3" />
        </button>
        <button
          className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:bg-muted/50 rounded transition-colors"
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
        className="flex-1 min-w-0 h-6 text-[11px] font-mono bg-transparent border-b border-primary/20 outline-none focus:border-primary/40 px-0.5"
      />
      <button
        className="w-5 h-5 flex items-center justify-center text-primary hover:bg-primary/10 rounded transition-colors"
        onClick={handleAdd}
      >
        <Check className="w-3 h-3" />
      </button>
      <button
        className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:bg-muted/50 rounded transition-colors"
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
        className="flex-1 min-w-0 h-6 text-[11px] font-mono bg-transparent border-b border-primary/20 outline-none focus:border-primary/40 px-0.5"
      />
      <button
        className="w-5 h-5 flex items-center justify-center text-primary hover:bg-primary/10 rounded transition-colors"
        onClick={handleAdd}
      >
        <Check className="w-3 h-3" />
      </button>
      <button
        className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:bg-muted/50 rounded transition-colors"
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
        className="flex-1 min-w-0 h-6 text-[11px] bg-transparent border-b border-primary/20 outline-none focus:border-primary/40 px-0.5"
      />
      <button
        className="w-5 h-5 flex items-center justify-center text-primary hover:bg-primary/10 rounded transition-colors"
        onClick={handleAdd}
      >
        <Check className="w-3 h-3" />
      </button>
      <button
        className="w-5 h-5 flex items-center justify-center text-muted-foreground hover:bg-muted/50 rounded transition-colors"
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
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

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
    }
    setEditing(false);
  }, [draft, value, onSave]);

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
          onClick={() => onSave(value === 'true' ? 'false' : 'true')}
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
          onChange={(e) => onSave(e.target.value)}
          className="h-6 text-[11px] bg-transparent border border-border rounded px-1.5 outline-none min-w-[80px] max-w-[140px]"
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
          className="flex-1 min-w-0 h-6 text-[11px] bg-transparent border-b border-primary/30 outline-none focus:border-primary/50 px-0.5 max-w-[140px]"
          placeholder="..."
        />
      );
    }

    return (
      <span
        className={`text-[11px] cursor-pointer px-1 py-0.5 rounded hover:bg-muted/50 transition-colors truncate max-w-[140px] ${
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
      <span className="text-[11px] font-mono text-primary/80 truncate min-w-[60px] shrink-0">{propertyName}</span>
      {isRequired && (
        <span className="text-[9px] text-amber-500 shrink-0">*</span>
      )}
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

  if (!selectedNodeId || !nodeDetail) return <EmptyState />;

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
          className="flex items-center gap-1 px-4 py-1.5 text-[11px] text-primary/70 hover:text-primary hover:bg-muted/30 transition-colors w-full text-left shrink-0"
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
        <Badge variant="outline" className="text-[9px] h-5 shrink-0 uppercase">
          {selectedNodeType === 'class' ? 'CLASS' : 'INSTANCE'}
        </Badge>
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
      <Tabs defaultValue="detail" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start rounded-none border-b bg-transparent h-9 px-4 shrink-0">
          <TabsTrigger value="detail" className="text-xs h-7 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            상세
          </TabsTrigger>
          <TabsTrigger value="relations" className="text-xs h-7 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            관계
          </TabsTrigger>
          <TabsTrigger value="constraints" className="text-xs h-7 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none gap-1">
            <Shield className="w-3 h-3" />
            제약
          </TabsTrigger>
          <TabsTrigger value="ai" className="text-xs h-7 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none">
            AI
          </TabsTrigger>
          <TabsTrigger value="cypher" className="text-xs h-7 px-3 data-[state=active]:shadow-none data-[state=active]:border-b-2 data-[state=active]:border-primary rounded-none gap-1">
            <Terminal className="w-3 h-3" />
            Cypher
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
                  multiline
                  className="leading-relaxed"
                />
              </div>
            )}

            <Separator />

            {/* Subclasses */}
            {selectedClass && (
              <>
                <CollapsibleSection
                  title="Subclasses"
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
                      <ArrowRight className="w-2.5 h-2.5 text-muted-foreground ml-auto opacity-0 group-hover:opacity-100" />
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
                    <p className="text-[10px] text-muted-foreground py-1">하위 클래스가 없습니다</p>
                  )}
                </CollapsibleSection>

                <Separator />
              </>
            )}

            {/* Properties */}
            {selectedClass && (
              <>
                <CollapsibleSection
                  title="Properties"
                  count={nodeProperties.length}
                  defaultOpen
                  onAdd={() => setShowAddProperty(true)}
                  addLabel="프로퍼티 추가"
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
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                            Inherited from {ancestorName}
                          </span>
                          <span className="text-[10px] font-mono text-muted-foreground/60 ml-auto">
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
                  title="Constraints"
                  count={nodeAxioms.length}
                  defaultOpen={false}
                  onAdd={() => setShowAddConstraint(true)}
                  addLabel="제약조건 추가"
                >
                  {nodeAxioms.map((axiom) => (
                    <div key={axiom.id} className="flex items-start gap-1.5 py-1.5 px-1.5 rounded hover:bg-muted/40 transition-colors -mx-1 group">
                      <AlertTriangle className="w-3 h-3 text-amber-500 shrink-0 mt-0.5" />
                      <span className="text-[11px] text-foreground leading-relaxed flex-1">{axiom.description}</span>
                      <button
                        className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
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
                    <p className="text-[10px] text-muted-foreground py-1">제약조건이 없습니다</p>
                  )}
                </CollapsibleSection>

                <Separator />
              </>
            )}

            {/* Instances */}
            {selectedClass && (
              <CollapsibleSection
                title="Instances"
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
                      <span className="text-[9px] font-semibold text-muted-foreground uppercase flex-1">이름</span>
                      {nodeProperties.slice(0, 2).map((prop) => (
                        <span key={prop.id} className="text-[9px] font-semibold text-muted-foreground uppercase w-16 text-right truncate">
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
                          <span className="text-[11px] text-foreground truncate">{inst.name}</span>
                        </button>
                        {nodeProperties.slice(0, 2).map((prop) => (
                          <span key={prop.id} className="text-[10px] text-muted-foreground w-16 text-right truncate">
                            —
                          </span>
                        ))}
                        <button
                          className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0 ml-1"
                          onClick={() => removeInstance(inst.id)}
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-muted-foreground py-1">인스턴스가 없습니다</p>
                )}
              </CollapsibleSection>
            )}

            {/* Instance detail view */}
            {selectedInstance && (
              <>
                {/* Property Values */}
                <CollapsibleSection
                  title="Property Values"
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
                          />
                        );
                      })}
                    </div>
                  ) : (
                    <p className="text-[10px] text-muted-foreground py-1">
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
              title="Relations"
              count={nodeEdges.length}
              defaultOpen
              onAdd={() => {
                if (!selectedNodeId) return;
                openPopover({
                  type: 'relation',
                  position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
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
                    <Badge variant="secondary" className="h-4 text-[9px] px-1.5 font-normal bg-cyan-50 text-cyan-700 border-cyan-200 shrink-0">
                      {relType?.name ?? 'relation'}
                    </Badge>
                    <button
                      className="text-[11px] text-foreground hover:text-primary transition-colors truncate flex-1 text-left"
                      onClick={() => handleNavigate(otherNodeId, otherClass ? 'class' : 'instance')}
                    >
                      {otherName}
                    </button>
                    <button
                      className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => removeEdge(edge.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                );
              })}
              {nodeEdges.length === 0 && (
                <p className="text-[10px] text-muted-foreground py-1">관계가 없습니다</p>
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
      </Tabs>
    </aside>
  );
}
