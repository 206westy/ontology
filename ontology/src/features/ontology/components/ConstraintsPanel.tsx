'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Shield,
  Plus,
  Trash2,
  Hash,
  Split,
  ArrowRightLeft,
  SlidersHorizontal,
  Loader2,
  Power,
  PowerOff,
  AlertTriangle,
  AlertCircle,
  Info,
} from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Separator } from '@/components/ui/separator';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { constraintsApi, validateApi } from '../api';
import { toast } from 'sonner';
import type { ConstraintKind, ConstraintType, OntologyConstraint } from '../lib/types';

type ConstraintTypeInfo = {
  value: ConstraintType;
  label: string;
  description: string;
  icon: typeof Hash;
};

const CONSTRAINT_TYPES: ConstraintTypeInfo[] = [
  {
    value: 'cardinality',
    label: 'Cardinality',
    description: '최소/최대 관계 수 제약',
    icon: Hash,
  },
  {
    value: 'disjoint',
    label: 'Disjoint',
    description: '두 클래스가 겹치지 않음',
    icon: Split,
  },
  {
    value: 'domain_range',
    label: 'Domain/Range',
    description: '관계의 도메인/레인지 제약',
    icon: ArrowRightLeft,
  },
  {
    value: 'property_value',
    label: 'Property Value',
    description: '프로퍼티 값 범위 제약',
    icon: SlidersHorizontal,
  },
];

const SEVERITY_OPTIONS = [
  { value: 'error', label: '오류', icon: AlertCircle, color: 'text-destructive' },
  { value: 'warning', label: '경고', icon: AlertTriangle, color: 'text-warning' },
  { value: 'info', label: '참고', icon: Info, color: 'text-info' },
] as const;

function getConstraintIcon(type: ConstraintType | null) {
  const info = CONSTRAINT_TYPES.find((t) => t.value === type);
  return info?.icon ?? Shield;
}

// PRD-L M1: kind 배지 — 강제 규칙과 설명 메모를 한 목록에서 구분한다.
// 배지 taxonomy 스타일(semantic 토큰) 재사용, 12px(text-xs) 유지(PRD-K 스케일).
function RuleKindBadge({ kind }: { kind: ConstraintKind }) {
  const isEnforced = kind === 'enforced';
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded border px-1.5 py-0.5 text-xs ${
        isEnforced ? 'border-info/50 text-info' : 'border-border text-muted-foreground'
      }`}
      title={
        isEnforced
          ? '검증 실행 시 실제로 검사됩니다'
          : '참고용 메모 — 검증에서 검사되지 않습니다'
      }
    >
      {isEnforced ? '강제됨' : '설명 메모'}
    </span>
  );
}

// PRD-L M3: 관계 레이어 배지 라벨 — semantic(지식)/kinetic(행동).
const RELATION_LAYER_LABEL: Record<string, string> = {
  semantic: '지식',
  kinetic: '행동',
};

function getSeverityIcon(severity: string) {
  const opt = SEVERITY_OPTIONS.find((s) => s.value === severity);
  if (!opt) return { Icon: Info, color: 'text-muted-foreground' };
  return { Icon: opt.icon, color: opt.color };
}

interface ConstraintWithRelations extends OntologyConstraint {
  sourceClass?: { id: string; name: string } | null;
  targetClass?: { id: string; name: string } | null;
  relationType?: { id: string; name: string } | null;
  property?: { id: string; name: string } | null;
}

interface AddConstraintFormState {
  kind: ConstraintKind;
  constraintType: ConstraintType;
  description: string;
  sourceClassId: string;
  targetClassId: string;
  relationTypeId: string;
  propertyId: string;
  severity: string;
  configMinCardinality: string;
  configMaxCardinality: string;
  configMinValue: string;
  configMaxValue: string;
  configPattern: string;
}

const INITIAL_FORM: AddConstraintFormState = {
  kind: 'enforced',
  constraintType: 'cardinality',
  description: '',
  sourceClassId: '',
  targetClassId: '',
  relationTypeId: '',
  propertyId: '',
  severity: 'error',
  configMinCardinality: '',
  configMaxCardinality: '',
  configMinValue: '',
  configMaxValue: '',
  configPattern: '',
};

function buildConfig(form: AddConstraintFormState): Record<string, unknown> {
  switch (form.constraintType) {
    case 'cardinality': {
      const config: Record<string, unknown> = {};
      if (form.configMinCardinality) config.min = Number(form.configMinCardinality);
      if (form.configMaxCardinality) config.max = Number(form.configMaxCardinality);
      return config;
    }
    case 'disjoint':
      return {};
    case 'domain_range':
      return {};
    case 'property_value': {
      const config: Record<string, unknown> = {};
      if (form.configMinValue) config.min = Number(form.configMinValue);
      if (form.configMaxValue) config.max = Number(form.configMaxValue);
      if (form.configPattern) config.pattern = form.configPattern;
      return config;
    }
    default:
      return {};
  }
}

export default function ConstraintsPanel() {
  const classes = useOntologyStore((s) => s.classes);
  const relationTypes = useOntologyStore((s) => s.relationTypes);
  const properties = useOntologyStore((s) => s.properties);

  const selectedNodeId = useOntologyStore((s) => s.selectedNodeId);
  const selectedNodeType = useOntologyStore((s) => s.selectedNodeType);

  const [constraints, setConstraints] = useState<ConstraintWithRelations[]>([]);
  const [loading, setLoading] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState<AddConstraintFormState>(INITIAL_FORM);
  const [filterType, setFilterType] = useState<string>('all');

  const fetchConstraints = useCallback(async () => {
    setLoading(true);
    try {
      const params: { constraintType?: string; sourceClassId?: string } = {};
      if (filterType !== 'all') params.constraintType = filterType;
      if (selectedNodeId && selectedNodeType === 'class') {
        params.sourceClassId = selectedNodeId;
      }
      const data = (await constraintsApi.list(params)) as ConstraintWithRelations[];
      setConstraints(data);
    } catch {
      toast.error('제약 조건 목록을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [filterType, selectedNodeId, selectedNodeType]);

  useEffect(() => {
    fetchConstraints();
  }, [fetchConstraints]);

  const handleAdd = async () => {
    if (!form.description.trim()) {
      toast.error('설명을 입력해주세요');
      return;
    }

    setSubmitting(true);
    try {
      // PRD-L M1: 설명 메모는 constraintType 없이 description 만 기록한다(비강제).
      if (form.kind === 'memo') {
        await constraintsApi.create({
          kind: 'memo',
          constraintType: null,
          description: form.description.trim(),
          sourceClassId: form.sourceClassId || null,
          targetClassId: null,
          relationTypeId: null,
          propertyId: null,
          config: {},
          severity: 'info',
          isActive: true,
        });
      } else {
        await constraintsApi.create({
          kind: 'enforced',
          constraintType: form.constraintType,
          description: form.description.trim(),
          sourceClassId: form.sourceClassId || null,
          targetClassId: form.targetClassId || null,
          relationTypeId: form.relationTypeId || null,
          propertyId: form.propertyId || null,
          config: buildConfig(form),
          severity: form.severity as 'error' | 'warning' | 'info',
          isActive: true,
        });
      }
      toast.success(form.kind === 'memo' ? '설명 메모가 추가되었습니다' : '제약 조건이 추가되었습니다');
      setShowAddDialog(false);
      setForm(INITIAL_FORM);
      await fetchConstraints();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '제약 조건 추가에 실패했습니다');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await constraintsApi.delete(deleteTarget);
      toast.success('제약 조건이 삭제되었습니다');
      setDeleteTarget(null);
      await fetchConstraints();
    } catch {
      toast.error('제약 조건 삭제에 실패했습니다');
    }
  };

  const handleToggleActive = async (constraint: ConstraintWithRelations) => {
    try {
      await constraintsApi.update(constraint.id, {
        isActive: !constraint.isActive,
      });
      toast.success(
        constraint.isActive ? '제약 조건이 비활성화되었습니다' : '제약 조건이 활성화되었습니다',
      );
      await fetchConstraints();
    } catch {
      toast.error('상태 변경에 실패했습니다');
    }
  };

  const handleValidateAfterChange = async () => {
    try {
      const result = await validateApi.run();
      const { errors, warnings } = result.summary;
      if (errors > 0) {
        toast.error(`검증 결과: 오류 ${errors}건, 경고 ${warnings}건`);
      } else if (warnings > 0) {
        toast.warning(`검증 결과: 경고 ${warnings}건`);
      } else {
        toast.success('검증 통과: 문제가 없습니다');
      }
    } catch {
      toast.error('검증 실행 중 오류가 발생했습니다');
    }
  };

  const openAddDialogForClass = () => {
    const initial = { ...INITIAL_FORM };
    if (selectedNodeId && selectedNodeType === 'class') {
      initial.sourceClassId = selectedNodeId;
    }
    setForm(initial);
    setShowAddDialog(true);
  };

  const propertiesForClass = form.sourceClassId
    ? properties.filter((p) => p.classId === form.sourceClassId)
    : properties;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 shrink-0">
        <Shield className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold tracking-tight flex-1">제약 조건</span>
        <Button
          variant="outline"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={handleValidateAfterChange}
        >
          검증 실행
        </Button>
        <Button
          variant="default"
          size="sm"
          className="h-7 text-xs gap-1"
          onClick={openAddDialogForClass}
        >
          <Plus className="w-3 h-3" />
          추가
        </Button>
      </div>

      <Separator />

      {/* Filter */}
      <div className="px-4 py-2 shrink-0">
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="타입 필터" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 타입</SelectItem>
            {CONSTRAINT_TYPES.map((ct) => (
              <SelectItem key={ct.value} value={ct.value}>
                {ct.label} - {ct.description}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {selectedNodeId && selectedNodeType === 'class' && (
          <p className="text-xs text-muted-foreground mt-1">
            선택된 클래스의 제약만 표시 중
          </p>
        )}
      </div>

      <Separator />

      {/* Constraint List */}
      <ScrollArea className="flex-1">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : constraints.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 px-4">
            <Shield className="w-8 h-8 text-muted-foreground/40 mb-2" />
            <p className="text-xs text-muted-foreground text-center">
              제약 조건이 없습니다
            </p>
            <p className="text-xs text-muted-foreground/70 text-center mt-1">
              &quot;추가&quot; 버튼을 눌러 제약 조건을 생성하세요
            </p>
          </div>
        ) : (
          <div className="px-2 py-1 space-y-1">
            {constraints.map((constraint) => {
              const isMemo = constraint.kind === 'memo';
              const TypeIcon = getConstraintIcon(constraint.constraintType);
              const { Icon: SevIcon, color: sevColor } = getSeverityIcon(constraint.severity);
              return (
                <div
                  key={constraint.id}
                  className={`group rounded-lg border px-3 py-2.5 transition-colors hover:bg-muted/40 ${
                    constraint.isActive ? 'border-border' : 'border-border/50 opacity-60'
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <TypeIcon className="w-3.5 h-3.5 text-primary mt-0.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <RuleKindBadge kind={constraint.kind} />
                        {!isMemo && (
                          <Badge
                            variant="secondary"
                            className="h-5 text-xs px-1.5 font-normal shrink-0"
                          >
                            {CONSTRAINT_TYPES.find((t) => t.value === constraint.constraintType)?.label}
                          </Badge>
                        )}
                        {!isMemo && <SevIcon className={`w-3 h-3 shrink-0 ${sevColor}`} />}
                        {!constraint.isActive && (
                          <Badge variant="outline" className="h-5 text-xs px-1 font-normal text-muted-foreground">
                            비활성
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-foreground leading-relaxed break-words">
                        {constraint.description || '(설명 없음)'}
                      </p>
                      {/* 설명 메모는 description 만 — 타입/카디널리티 배지는 표시하지 않는다 */}
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {constraint.sourceClass && (
                          <Badge variant="outline" className="h-5 text-xs px-1.5 font-normal">
                            소스: {constraint.sourceClass.name}
                          </Badge>
                        )}
                        {!isMemo && constraint.targetClass && (
                          <Badge variant="outline" className="h-5 text-xs px-1.5 font-normal">
                            타겟: {constraint.targetClass.name}
                          </Badge>
                        )}
                        {!isMemo && constraint.relationType && (
                          <Badge variant="outline" className="h-5 text-xs px-1.5 font-normal text-info border-info/30">
                            관계: {constraint.relationType.name}
                          </Badge>
                        )}
                        {!isMemo && constraint.property && (
                          <Badge variant="outline" className="h-5 text-xs px-1.5 font-normal text-primary border-primary/30">
                            속성: {constraint.property.name}
                          </Badge>
                        )}
                        {constraint.constraintType === 'cardinality' && constraint.config && (
                          <Badge variant="outline" className="h-5 text-xs px-1.5 font-normal font-mono">
                            {(constraint.config as Record<string, number>).min ?? '*'}..
                            {(constraint.config as Record<string, number>).max ?? '*'}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={() => handleToggleActive(constraint)}
                        title={constraint.isActive ? '비활성화' : '활성화'}
                      >
                        {constraint.isActive ? (
                          <Power className="w-3 h-3 text-success" />
                        ) : (
                          <PowerOff className="w-3 h-3 text-muted-foreground" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => setDeleteTarget(constraint.id)}
                        title="삭제"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Add Constraint Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle className="text-base">규칙 추가</DialogTitle>
            <DialogDescription className="text-xs">
              온톨로지에 적용할 규칙을 설정합니다.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* PRD-L M1: 규칙 종류 — 유형 규칙(강제) / 설명 메모(비강제) */}
            <div className="space-y-1.5">
              <Label className="text-xs">규칙 종류</Label>
              <Select
                value={form.kind}
                onValueChange={(v) =>
                  setForm((f) => ({ ...f, kind: v as ConstraintKind }))
                }
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="enforced">
                    유형 규칙 — 검증 실행 시 실제로 검사됩니다
                  </SelectItem>
                  <SelectItem value="memo">
                    설명 메모 — 참고용 메모, 검증에서 검사되지 않습니다
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Constraint Type (enforced only) */}
            {form.kind === 'enforced' && (
              <div className="space-y-1.5">
                <Label className="text-xs">제약 유형</Label>
                <Select
                  value={form.constraintType}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, constraintType: v as ConstraintType }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CONSTRAINT_TYPES.map((ct) => {
                      const Icon = ct.icon;
                      return (
                        <SelectItem key={ct.value} value={ct.value}>
                          <span className="flex items-center gap-2">
                            <Icon className="w-3.5 h-3.5" />
                            {ct.label} — {ct.description}
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Description */}
            <div className="space-y-1.5">
              <Label className="text-xs">설명 *</Label>
              <Input
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder={
                  form.kind === 'memo'
                    ? '자유서술 설명 메모...'
                    : '이 제약 조건에 대한 설명...'
                }
                className="h-9 text-xs"
              />
            </div>

            {/* Severity (enforced only) */}
            {form.kind === 'enforced' && (
              <div className="space-y-1.5">
                <Label className="text-xs">심각도</Label>
                <Select
                  value={form.severity}
                  onValueChange={(v) => setForm((f) => ({ ...f, severity: v }))}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SEVERITY_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        <span className="flex items-center gap-2">
                          <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
                          {s.label}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Source Class (enforced only — 메모는 description 하나만 입력) */}
            {form.kind === 'enforced' && (
              <div className="space-y-1.5">
                <Label className="text-xs">소스 클래스</Label>
                <Select
                  value={form.sourceClassId || '_none'}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      sourceClassId: v === '_none' ? '' : v,
                      propertyId: '',
                    }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="선택 (선택사항)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">(없음)</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Target Class (for disjoint and domain_range) */}
            {form.kind === 'enforced' && (form.constraintType === 'disjoint' || form.constraintType === 'domain_range') && (
              <div className="space-y-1.5">
                <Label className="text-xs">타겟 클래스</Label>
                <Select
                  value={form.targetClassId || '_none'}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, targetClassId: v === '_none' ? '' : v }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="선택 (선택사항)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">(없음)</SelectItem>
                    {classes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Relation (for cardinality and domain_range) */}
            {/* PRD-L M3: "관계 타입" 개념 노출 제거 — 라벨은 "관계", 값은 relationTypeId 유지(데이터모델 보존). */}
            {form.kind === 'enforced' && (form.constraintType === 'cardinality' || form.constraintType === 'domain_range') && (
              <div className="space-y-1.5">
                <Label className="text-xs">관계</Label>
                <Select
                  value={form.relationTypeId || '_none'}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, relationTypeId: v === '_none' ? '' : v }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="선택 (선택사항)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">(없음)</SelectItem>
                    {relationTypes.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        <span className="flex items-center gap-2">
                          {r.name}
                          <span className="rounded border px-1 text-xs leading-tight text-muted-foreground">
                            {RELATION_LAYER_LABEL[r.layer] ?? r.layer}
                          </span>
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Property (for property_value) */}
            {form.kind === 'enforced' && form.constraintType === 'property_value' && (
              <div className="space-y-1.5">
                <Label className="text-xs">프로퍼티</Label>
                <Select
                  value={form.propertyId || '_none'}
                  onValueChange={(v) =>
                    setForm((f) => ({ ...f, propertyId: v === '_none' ? '' : v }))
                  }
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue placeholder="선택 (선택사항)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">(없음)</SelectItem>
                    {propertiesForClass.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} ({p.dataType})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Cardinality Config */}
            {form.kind === 'enforced' && form.constraintType === 'cardinality' && (
              <div className="space-y-1.5">
                <Label className="text-xs">카디널리티 범위</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={0}
                    value={form.configMinCardinality}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, configMinCardinality: e.target.value }))
                    }
                    placeholder="최소"
                    className="h-9 text-xs flex-1"
                  />
                  <span className="text-xs text-muted-foreground">~</span>
                  <Input
                    type="number"
                    min={0}
                    value={form.configMaxCardinality}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, configMaxCardinality: e.target.value }))
                    }
                    placeholder="최대"
                    className="h-9 text-xs flex-1"
                  />
                </div>
              </div>
            )}

            {/* Property Value Config */}
            {form.kind === 'enforced' && form.constraintType === 'property_value' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-xs">값 범위</Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={form.configMinValue}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, configMinValue: e.target.value }))
                      }
                      placeholder="최소값"
                      className="h-9 text-xs flex-1"
                    />
                    <span className="text-xs text-muted-foreground">~</span>
                    <Input
                      type="number"
                      value={form.configMaxValue}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, configMaxValue: e.target.value }))
                      }
                      placeholder="최대값"
                      className="h-9 text-xs flex-1"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">패턴 (정규식)</Label>
                  <Input
                    value={form.configPattern}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, configPattern: e.target.value }))
                    }
                    placeholder="예: ^[A-Z]{2,4}$"
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowAddDialog(false)}
              disabled={submitting}
            >
              취소
            </Button>
            <Button
              size="sm"
              onClick={handleAdd}
              disabled={submitting || !form.description.trim()}
            >
              {submitting && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
              추가
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>제약 조건 삭제</AlertDialogTitle>
            <AlertDialogDescription>
              이 제약 조건을 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>삭제</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
