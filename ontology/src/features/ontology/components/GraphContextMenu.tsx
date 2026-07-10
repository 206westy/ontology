'use client';

import { useEffect, useRef } from 'react';
import {
  Plus,
  LayoutGrid,
  Maximize2,
  Pencil,
  Palette,
  Link2,
  FolderPlus,
  UserPlus,
  Focus,
  Search,
  Trash2,
  Repeat2,
  Sparkles,
} from 'lucide-react';
import { NODE_COLORS, NODE_COLOR_LABELS } from '../constants/colors';
import type { NodeColorKey } from '../lib/types';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

export type ContextMenuTarget =
  | { type: 'pane'; position: ContextMenuPosition }
  | { type: 'class'; nodeId: string; nodeName: string; position: ContextMenuPosition }
  | { type: 'instance'; nodeId: string; nodeName: string; position: ContextMenuPosition }
  | { type: 'edge'; edgeId: string; edgeLabel: string; position: ContextMenuPosition };

interface GraphContextMenuProps {
  target: ContextMenuTarget | null;
  onClose: () => void;

  onNewClass?: (position: ContextMenuPosition) => void;
  onNewInstance?: (position: ContextMenuPosition) => void;
  onLayoutGraph?: () => void;
  onFitView?: () => void;

  onRenameNode?: (nodeId: string) => void;
  onChangeColor?: (nodeId: string, color: NodeColorKey) => void;
  onAddRelation?: (nodeId: string) => void;
  onAddSubclass?: (parentId: string) => void;
  onAddInstance?: (classId: string) => void;
  onExpandNode?: (nodeId: string) => void;
  onFocusMode?: (nodeId: string) => void;
  onFindInExplorer?: (nodeId: string) => void;
  onDeleteNode?: (nodeId: string) => void;

  onReverseEdge?: (edgeId: string) => void;
  onDeleteEdge?: (edgeId: string) => void;
  onClearAll?: () => void;
}

function MenuItem({
  children,
  onClick,
  destructive,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      className={`
        flex items-center gap-2 w-full px-2.5 py-1.5 text-xs rounded-sm
        transition-colors cursor-default
        ${destructive
          ? 'text-destructive hover:bg-destructive/10 focus:bg-destructive/10'
          : 'text-foreground hover:bg-accent/10 focus:bg-accent/10'
        }
      `}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function MenuSeparator() {
  return <div className="h-px bg-border my-1" />;
}

function ColorSubmenu({
  nodeId,
  onChangeColor,
}: {
  nodeId: string;
  onChangeColor?: (id: string, color: NodeColorKey) => void;
}) {
  const colorEntries = Object.entries(NODE_COLORS) as [NodeColorKey, string][];

  return (
    <div className="grid grid-cols-5 gap-1 px-2 py-1.5">
      {colorEntries.map(([key, hex]) => (
        <button
          key={key}
          className="w-5 h-5 rounded-full border border-border/50 hover:scale-110 transition-transform"
          style={{ backgroundColor: hex }}
          title={NODE_COLOR_LABELS[key]}
          onClick={() => onChangeColor?.(nodeId, key)}
        />
      ))}
    </div>
  );
}

export default function GraphContextMenu({
  target,
  onClose,
  onNewClass,
  onNewInstance,
  onLayoutGraph,
  onFitView,
  onRenameNode,
  onChangeColor,
  onAddRelation,
  onAddSubclass,
  onAddInstance,
  onExpandNode,
  onFocusMode,
  onFindInExplorer,
  onDeleteNode,
  onReverseEdge,
  onDeleteEdge,
  onClearAll,
}: GraphContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!target) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as HTMLElement)) {
        onClose();
      }
    };

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [target, onClose]);

  if (!target) return null;

  const handleAction = (fn?: () => void) => {
    fn?.();
    onClose();
  };

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[200px] rounded-lg border border-border bg-popover p-1 shadow-elevation-2 animate-in fade-in-0 zoom-in-95"
      style={{ left: target.position.x, top: target.position.y }}
    >
      {target.type === 'pane' && (
        <>
          <MenuItem onClick={() => handleAction(() => onNewClass?.(target.position))}>
            <Plus className="w-3.5 h-3.5" />
            새 클래스
            <span className="ml-auto text-xs text-muted-foreground">N</span>
          </MenuItem>
          <MenuItem onClick={() => handleAction(() => onNewInstance?.(target.position))}>
            <UserPlus className="w-3.5 h-3.5" />
            새 인스턴스
          </MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => handleAction(() => onLayoutGraph?.())}>
            <LayoutGrid className="w-3.5 h-3.5" />
            레이아웃 정리
          </MenuItem>
          <MenuItem onClick={() => handleAction(() => onFitView?.())}>
            <Maximize2 className="w-3.5 h-3.5" />
            전체 보기
            <span className="ml-auto text-xs text-muted-foreground">Fit</span>
          </MenuItem>
          <MenuSeparator />
          <MenuItem destructive onClick={() => handleAction(() => onClearAll?.())}>
            <Trash2 className="w-3.5 h-3.5" />
            전체 초기화
          </MenuItem>
        </>
      )}

      {target.type === 'class' && (
        <>
          <div className="px-2.5 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {target.nodeName}
          </div>
          <MenuSeparator />
          <MenuItem onClick={() => handleAction(() => onRenameNode?.(target.nodeId))}>
            <Pencil className="w-3.5 h-3.5" />
            이름 변경
            <span className="ml-auto text-xs text-muted-foreground">F2</span>
          </MenuItem>
          <div className="px-1">
            <div className="flex items-center gap-2 px-1.5 py-1 text-xs text-foreground">
              <Palette className="w-3.5 h-3.5" />
              색상 변경
            </div>
            <ColorSubmenu nodeId={target.nodeId} onChangeColor={(id, c) => handleAction(() => onChangeColor?.(id, c))} />
          </div>
          <MenuSeparator />
          {onExpandNode && (
            <MenuItem onClick={() => handleAction(() => onExpandNode?.(target.nodeId))}>
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              AI로 확장
            </MenuItem>
          )}
          <MenuItem onClick={() => handleAction(() => onAddRelation?.(target.nodeId))}>
            <Link2 className="w-3.5 h-3.5" />
            관계 추가
          </MenuItem>
          <MenuItem onClick={() => handleAction(() => onAddSubclass?.(target.nodeId))}>
            <FolderPlus className="w-3.5 h-3.5" />
            하위 클래스 추가
          </MenuItem>
          <MenuItem onClick={() => handleAction(() => onAddInstance?.(target.nodeId))}>
            <UserPlus className="w-3.5 h-3.5" />
            인스턴스 추가
          </MenuItem>
          <MenuSeparator />
          <MenuItem onClick={() => handleAction(() => onFocusMode?.(target.nodeId))}>
            <Focus className="w-3.5 h-3.5" />
            포커스 모드
          </MenuItem>
          <MenuItem onClick={() => handleAction(() => onFindInExplorer?.(target.nodeId))}>
            <Search className="w-3.5 h-3.5" />
            Explorer에서 보기
          </MenuItem>
          <MenuSeparator />
          <MenuItem destructive onClick={() => handleAction(() => onDeleteNode?.(target.nodeId))}>
            <Trash2 className="w-3.5 h-3.5" />
            삭제
            <span className="ml-auto text-xs">Delete</span>
          </MenuItem>
        </>
      )}

      {target.type === 'instance' && (
        <>
          <div className="px-2.5 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {target.nodeName}
          </div>
          <MenuSeparator />
          <MenuItem onClick={() => handleAction(() => onRenameNode?.(target.nodeId))}>
            <Pencil className="w-3.5 h-3.5" />
            이름 변경
            <span className="ml-auto text-xs text-muted-foreground">F2</span>
          </MenuItem>
          <MenuItem onClick={() => handleAction(() => onAddRelation?.(target.nodeId))}>
            <Link2 className="w-3.5 h-3.5" />
            관계 추가
          </MenuItem>
          {onExpandNode && (
            <MenuItem onClick={() => handleAction(() => onExpandNode?.(target.nodeId))}>
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              AI로 확장
            </MenuItem>
          )}
          <MenuSeparator />
          <MenuItem onClick={() => handleAction(() => onFocusMode?.(target.nodeId))}>
            <Focus className="w-3.5 h-3.5" />
            포커스 모드
          </MenuItem>
          <MenuItem onClick={() => handleAction(() => onFindInExplorer?.(target.nodeId))}>
            <Search className="w-3.5 h-3.5" />
            Explorer에서 보기
          </MenuItem>
          <MenuSeparator />
          <MenuItem destructive onClick={() => handleAction(() => onDeleteNode?.(target.nodeId))}>
            <Trash2 className="w-3.5 h-3.5" />
            삭제
            <span className="ml-auto text-xs">Delete</span>
          </MenuItem>
        </>
      )}

      {target.type === 'edge' && (
        <>
          <div className="px-2.5 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            {target.edgeLabel || '관계'}
          </div>
          <MenuSeparator />
          <MenuItem onClick={() => handleAction(() => onReverseEdge?.(target.edgeId))}>
            <Repeat2 className="w-3.5 h-3.5" />
            방향 반전
          </MenuItem>
          <MenuSeparator />
          <MenuItem destructive onClick={() => handleAction(() => onDeleteEdge?.(target.edgeId))}>
            <Trash2 className="w-3.5 h-3.5" />
            삭제
          </MenuItem>
        </>
      )}
    </div>
  );
}
