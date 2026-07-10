'use client';

import { useEffect, useRef } from 'react';
import {
  Pencil,
  Focus,
  FolderPlus,
  UserPlus,
  Trash2,
} from 'lucide-react';

export interface ExplorerContextTarget {
  nodeId: string;
  nodeName: string;
  nodeType: 'class' | 'instance';
  position: { x: number; y: number };
}

interface ExplorerContextMenuProps {
  target: ExplorerContextTarget | null;
  onClose: () => void;
  onRename?: (nodeId: string) => void;
  onFocusOnCanvas?: (nodeId: string) => void;
  onAddSubclass?: (parentId: string) => void;
  onAddInstance?: (classId: string) => void;
  onDelete?: (nodeId: string, nodeType: 'class' | 'instance') => void;
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

export default function ExplorerContextMenu({
  target,
  onClose,
  onRename,
  onFocusOnCanvas,
  onAddSubclass,
  onAddInstance,
  onDelete,
}: ExplorerContextMenuProps) {
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

  const isClass = target.nodeType === 'class';

  return (
    <div
      ref={menuRef}
      className="fixed z-50 min-w-[180px] rounded-lg border border-border bg-popover p-1 shadow-elevation-2 animate-in fade-in-0 zoom-in-95"
      style={{ left: target.position.x, top: target.position.y }}
    >
      <div className="px-2.5 py-1 text-xs font-semibold text-muted-foreground uppercase tracking-wider truncate max-w-[200px]">
        {target.nodeName}
      </div>
      <MenuSeparator />
      <MenuItem onClick={() => handleAction(() => onRename?.(target.nodeId))}>
        <Pencil className="w-3.5 h-3.5" />
        이름 변경
      </MenuItem>
      <MenuItem onClick={() => handleAction(() => onFocusOnCanvas?.(target.nodeId))}>
        <Focus className="w-3.5 h-3.5" />
        캔버스에서 찾기
      </MenuItem>
      {isClass && (
        <>
          <MenuItem onClick={() => handleAction(() => onAddSubclass?.(target.nodeId))}>
            <FolderPlus className="w-3.5 h-3.5" />
            하위 클래스 추가
          </MenuItem>
          <MenuItem onClick={() => handleAction(() => onAddInstance?.(target.nodeId))}>
            <UserPlus className="w-3.5 h-3.5" />
            인스턴스 추가
          </MenuItem>
        </>
      )}
      <MenuSeparator />
      <MenuItem destructive onClick={() => handleAction(() => onDelete?.(target.nodeId, target.nodeType))}>
        <Trash2 className="w-3.5 h-3.5" />
        삭제
        <span className="ml-auto text-xs">Delete</span>
      </MenuItem>
    </div>
  );
}
