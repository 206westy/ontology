'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node, useStore } from '@xyflow/react';
import { motion } from 'framer-motion';
import { NODE_COLORS, getNodeCssColors } from '../constants/colors';
import { useOntologyStore } from '../hooks/useOntologyStore';

export type ClassNodeData = {
  label: string;
  count?: number;
  colorKey?: keyof typeof NODE_COLORS;
  isEmpty?: boolean;
  isFocused?: boolean;
};

type ClassNodeType = Node<ClassNodeData, 'classNode'>;

type DetailLevel = 'full' | 'name' | 'dot';

function ClassNodeComponent({ id, data, selected }: NodeProps<ClassNodeType>) {
  const selectNode = useOntologyStore((s) => s.selectNode);
  const isSelected = !!selected;
  const isFocused = data.isFocused ?? false;

  // Level of Detail based on zoom
  const zoom = useStore((s) => s.transform[2]);
  const detail: DetailLevel = zoom >= 1 ? 'full' : zoom >= 0.5 ? 'name' : 'dot';

  const colorKey = data.colorKey ?? 'root';
  const { borderColor, bgColor } = getNodeCssColors(colorKey);
  const isEmpty = data.isEmpty ?? (data.count === 0);

  // Uses CSS variable so light/dark switches automatically via globals.css
  const selectedAccent = 'hsl(var(--primary))';

  const handleClick = () => {
    selectNode(id, 'class');
  };

  // Dot mode: minimal colored circle
  if (detail === 'dot') {
    const dotSize = 10;
    return (
      <div className="transition-opacity duration-150" onClick={handleClick} data-testid={`class-node-${id}`}>
        <Handle type="target" position={Position.Top} className="!w-1 !h-1 !bg-transparent !border-0" />
        <div
          className="rounded-full cursor-pointer"
          style={{
            width: dotSize,
            height: dotSize,
            backgroundColor: borderColor,
            opacity: isEmpty ? 0.3 : 0.8,
          }}
        />
        <Handle type="source" position={Position.Bottom} className="!w-1 !h-1 !bg-transparent !border-0" />
      </div>
    );
  }

  // Name mode: smaller circle with name only
  if (detail === 'name') {
    const nameSize = 60;
    return (
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: isEmpty ? 0.35 : 1 }}
        transition={{ type: 'spring', damping: 15, stiffness: 300 }}
        className="group transition-opacity duration-150 hover:scale-[1.05] transition-transform"
        onClick={handleClick}
        data-testid={`class-node-${id}`}
      >
        <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-border !border-2 !border-card" />
        <div
          className={`flex items-center justify-center rounded-full cursor-pointer ${
            isFocused ? 'node-focus-ring' : ''
          }`}
          style={{
            width: nameSize,
            height: nameSize,
            border: `${isSelected ? 2 : 1.2}px solid ${isSelected ? selectedAccent : borderColor}`,
            backgroundColor: bgColor,
            boxShadow: isSelected ? `0 0 0 2px hsl(var(--node-${colorKey}) / 0.25)` : 'none',
          }}
        >
          <span className="text-[10px] font-semibold text-foreground leading-tight text-center px-1.5 truncate max-w-[52px]">
            {data.label}
          </span>
        </div>
        <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-border !border-2 !border-card" />
      </motion.div>
    );
  }

  // Full mode (PRD r=40 → diameter 80px max)
  const baseSize = 80;
  const size = Math.max(44, Math.min(baseSize, 44 + (data.count ?? 0) * 4));

  return (
    <motion.div
      initial={{ scale: 0.5, opacity: 0 }}
      animate={{ scale: 1, opacity: isEmpty ? 0.35 : 1 }}
      transition={{ type: 'spring', damping: 15, stiffness: 300 }}
      className="group transition-opacity duration-150 hover:scale-[1.05] transition-transform"
      onClick={handleClick}
      data-testid={`class-node-${id}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-2 !h-2 !bg-border !border-2 !border-card"
      />

      <div className="relative">
        <div
          className={`flex items-center justify-center rounded-full cursor-pointer transition-shadow duration-150 hover:shadow-lg ${
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
              ? `0 0 0 3px hsl(var(--node-${colorKey}) / 0.25), 0 0 12px hsl(var(--node-${colorKey}) / 0.15)`
              : 'none',
          }}
        >
          <span className="text-xs font-semibold text-foreground leading-tight text-center px-2 truncate max-w-[72px]">
            {data.label}
          </span>
        </div>
        {data.count !== undefined && data.count > 0 && (
          <span
            className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] rounded-full text-[9px] font-mono font-semibold text-white px-1"
            style={{ backgroundColor: borderColor }}
          >
            {data.count}
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-2 !h-2 !bg-border !border-2 !border-card"
      />
    </motion.div>
  );
}

export default memo(ClassNodeComponent);
