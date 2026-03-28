'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node, useStore } from '@xyflow/react';
import { motion } from 'motion/react';
import { Crown, Layers, Leaf, User, MapPin, CalendarDays, Lightbulb, Workflow, FileText } from 'lucide-react';
import { NODE_COLORS, getNodeCssColors } from '../constants/colors';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { nodeEnter, safeTransition } from '@/lib/motion-presets';

export type ClassNodeData = {
  label: string;
  count?: number;
  colorKey?: keyof typeof NODE_COLORS;
  isEmpty?: boolean;
  isFocused?: boolean;
  nodeRole?: 'root' | 'mid' | 'leaf';
};

type ClassNodeType = Node<ClassNodeData, 'classNode'>;

type DetailLevel = 'full' | 'name' | 'dot';

type IconProps = React.SVGAttributes<SVGElement> & { className?: string };
const ROLE_ICON_MAP: Record<'root' | 'mid' | 'leaf', React.ComponentType<IconProps>> = {
  root: Crown,
  mid: Layers,
  leaf: Leaf,
};

const TYPE_ICON_MAP: Record<string, React.ComponentType<IconProps>> = {
  person: User,
  place: MapPin,
  event: CalendarDays,
  concept: Lightbulb,
  process: Workflow,
  artifact: FileText,
};

function ClassNodeComponent({ id, data, selected }: NodeProps<ClassNodeType>) {
  const selectNode = useOntologyStore((s) => s.selectNode);
  const isSelected = !!selected;
  const isFocused = data.isFocused ?? false;

  const zoom = useStore((s) => s.transform[2]);
  const detail: DetailLevel = zoom >= 1 ? 'full' : zoom >= 0.5 ? 'name' : 'dot';

  const colorKey = data.colorKey ?? 'root';
  const { borderColor, bgColor } = getNodeCssColors(colorKey);
  const isEmpty = data.isEmpty ?? (data.count === 0);

  const selectedAccent = 'hsl(var(--primary))';
  const transition = safeTransition(nodeEnter);

  const handleClick = () => {
    selectNode(id, 'class');
  };

  // Dot mode: minimal colored circle
  if (detail === 'dot') {
    const dotSize = 10;
    return (
      <div className="transition-opacity duration-150" onClick={handleClick} data-testid={`class-node-${id}`}>
        <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-transparent !border-0" />
        <div
          className="rounded-full cursor-pointer"
          style={{
            width: dotSize,
            height: dotSize,
            backgroundColor: borderColor,
            opacity: isEmpty ? 0.3 : 0.8,
          }}
        />
        <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-transparent !border-0" />
      </div>
    );
  }

  // Name mode: smaller circle with name only
  if (detail === 'name') {
    const nameSize = 60;
    return (
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: isEmpty ? 0.55 : 1 }}
        transition={transition}
        className="group transition-all duration-150 hover:scale-[1.03]"
        onClick={handleClick}
        data-testid={`class-node-${id}`}
      >
        <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-muted-foreground/40 !border-2 !border-card group-hover:!bg-primary/60 group-hover:!w-3 group-hover:!h-3 !transition-all !duration-150" />
        <div
          className={`flex items-center justify-center rounded-full cursor-pointer transition-shadow duration-150 hover:shadow-lg ${
            isFocused ? 'node-focus-ring' : ''
          }`}
          style={{
            width: nameSize,
            height: nameSize,
            border: `${isSelected ? 2.5 : 1.2}px solid ${isSelected ? selectedAccent : borderColor}`,
            backgroundColor: bgColor,
            boxShadow: isSelected
              ? `0 0 var(--node-selected-glow-blur) var(--node-selected-glow-spread) hsl(var(--node-${colorKey}) / var(--node-selected-glow-opacity))`
              : 'none',
          }}
        >
          <span className="text-caption font-semibold text-foreground leading-tight text-center px-1.5 truncate max-w-[52px]">
            {data.label}
          </span>
        </div>
        <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-muted-foreground/40 !border-2 !border-card group-hover:!bg-primary/60 group-hover:!w-3 group-hover:!h-3 !transition-all !duration-150" />
      </motion.div>
    );
  }

  // Full mode (PRD r=40, diameter 80px max)
  const baseSize = 80;
  const size = Math.max(44, Math.min(baseSize, 44 + (data.count ?? 0) * 4));
  const RoleIcon = data.nodeRole ? ROLE_ICON_MAP[data.nodeRole] : undefined;
  const TypeIcon = TYPE_ICON_MAP[colorKey];

  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: isEmpty ? 0.55 : 1 }}
      transition={transition}
      className="group transition-all duration-150 hover:scale-[1.03]"
      onClick={handleClick}
      data-testid={`class-node-${id}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-muted-foreground/40 !border-2 !border-card group-hover:!bg-primary/60 group-hover:!w-4 group-hover:!h-4 !transition-all !duration-150"
      />

      <div className="relative">
        <div
          className={`flex flex-col items-center justify-center rounded-full cursor-pointer transition-all duration-150 hover:shadow-lg ${
            isFocused ? 'node-focus-ring' : ''
          }`}
          style={{
            width: size,
            height: size,
            border: isEmpty
              ? `1.5px dashed ${isSelected ? selectedAccent : borderColor}`
              : `${isSelected ? 2.5 : 1.5}px solid ${isSelected ? selectedAccent : borderColor}`,
            backgroundColor: bgColor,
            boxShadow: isSelected
              ? `0 0 var(--node-selected-glow-blur) var(--node-selected-glow-spread) hsl(var(--node-${colorKey}) / var(--node-selected-glow-opacity)), 0 0 24px hsl(var(--node-${colorKey}) / 0.12)`
              : 'none',
          }}
        >
          <span className="text-body-sm font-semibold text-foreground leading-tight text-center px-2 line-clamp-2 max-w-[100px]">
            {data.label}
          </span>
          {isEmpty && (
            <span className="text-caption text-muted-foreground mt-0.5">
              비어있음
            </span>
          )}
        </div>

        {/* v3: Role icon badge (top-left) — hierarchy role indicator */}
        {RoleIcon && (
          <span
            className="absolute -top-1.5 -left-1.5 flex items-center justify-center w-[20px] h-[20px] rounded-full bg-white/90 dark:bg-card/90 border border-border shadow-sm"
          >
            <RoleIcon className="w-2.5 h-2.5" color={borderColor} />
          </span>
        )}

        {/* v3: Semantic type icon badge (top-right) — domain type indicator */}
        {TypeIcon && (
          <span
            className="absolute -top-1.5 -right-1.5 flex items-center justify-center w-[20px] h-[20px] rounded-full border border-card shadow-elevation-1"
            style={{ backgroundColor: borderColor }}
          >
            <TypeIcon className="w-2.5 h-2.5 text-white" />
          </span>
        )}

        {/* Instance count badge (bottom-right, only when count > 0 and no type icon conflict) */}
        {data.count !== undefined && data.count > 0 && (
          <span
            className="absolute -bottom-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-caption font-mono font-semibold text-white px-1"
            style={{ backgroundColor: borderColor }}
          >
            {data.count}
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-muted-foreground/40 !border-2 !border-card group-hover:!bg-primary/60 group-hover:!w-4 group-hover:!h-4 !transition-all !duration-150"
      />
    </motion.div>
  );
}

export default memo(ClassNodeComponent);
