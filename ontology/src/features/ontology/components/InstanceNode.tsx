'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node, useStore } from '@xyflow/react';
import { motion } from 'framer-motion';
import { NODE_COLORS, getNodeCssColors } from '../constants/colors';
import { useOntologyStore } from '../hooks/useOntologyStore';

export type InstanceNodeData = {
  label: string;
  colorKey?: keyof typeof NODE_COLORS;
  isFocused?: boolean;
};

type InstanceNodeType = Node<InstanceNodeData, 'instanceNode'>;

type DetailLevel = 'full' | 'name' | 'dot';

function InstanceNodeComponent({ id, data, selected }: NodeProps<InstanceNodeType>) {
  const selectNode = useOntologyStore((s) => s.selectNode);
  const isSelected = !!selected;
  const isFocused = data.isFocused ?? false;

  const zoom = useStore((s) => s.transform[2]);
  const detail: DetailLevel = zoom >= 1 ? 'full' : zoom >= 0.5 ? 'name' : 'dot';

  const colorKey = data.colorKey ?? 'instance';
  const { borderColor, bgColor } = getNodeCssColors(colorKey);

  const selectedAccent = 'hsl(var(--primary))';

  const handleClick = () => {
    selectNode(id, 'instance');
  };

  // Dot mode
  if (detail === 'dot') {
    return (
      <div className="transition-opacity duration-150" onClick={handleClick} data-testid={`instance-node-${id}`}>
        <Handle type="target" position={Position.Top} className="!w-1 !h-1 !bg-transparent !border-0" />
        <div
          className="rounded-full cursor-pointer"
          style={{
            width: 8,
            height: 8,
            backgroundColor: borderColor,
            opacity: 0.6,
          }}
        />
        <Handle type="source" position={Position.Bottom} className="!w-1 !h-1 !bg-transparent !border-0" />
      </div>
    );
  }

  // Name mode: slightly smaller
  if (detail === 'name') {
    return (
      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.75 }}
        transition={{ type: 'spring', damping: 12, stiffness: 280, delay: 0.1 }}
        className="group transition-opacity duration-150"
        onClick={handleClick}
        data-testid={`instance-node-${id}`}
      >
        <Handle type="target" position={Position.Top} className="!w-1 !h-1 !bg-border !border-2 !border-card" />
        <div
          className={`flex items-center justify-center w-[44px] h-[44px] rounded-full cursor-pointer ${
            isFocused ? 'node-focus-ring' : ''
          }`}
          style={{
            border: `${isSelected ? 2 : 1.5}px solid ${isSelected ? selectedAccent : borderColor}`,
            backgroundColor: bgColor,
            boxShadow: isSelected ? `0 0 0 2px hsl(var(--node-${colorKey}) / 0.25)` : 'none',
          }}
        >
          <span className="text-[9px] font-medium text-foreground leading-tight text-center px-1 truncate max-w-[36px]">
            {data.label}
          </span>
        </div>
        <Handle type="source" position={Position.Bottom} className="!w-1 !h-1 !bg-border !border-2 !border-card" />
      </motion.div>
    );
  }

  // Full mode
  return (
    <motion.div
      initial={{ scale: 0.3, opacity: 0 }}
      animate={{ scale: 1, opacity: 0.85 }}
      transition={{ type: 'spring', damping: 12, stiffness: 280, delay: 0.1 }}
      className="group transition-opacity duration-150"
      onClick={handleClick}
      data-testid={`instance-node-${id}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-1.5 !h-1.5 !bg-border !border-2 !border-card"
      />

      <div
        className={`flex items-center justify-center w-[56px] h-[56px] rounded-full cursor-pointer transition-shadow hover:shadow-md ${
          isFocused ? 'node-focus-ring' : ''
        }`}
        style={{
          border: `${isSelected ? 2.5 : 2}px solid ${isSelected ? selectedAccent : borderColor}`,
          backgroundColor: bgColor,
          boxShadow: isSelected
            ? `0 0 0 2px hsl(var(--node-${colorKey}) / 0.25), 0 0 8px hsl(var(--node-${colorKey}) / 0.15)`
            : 'none',
        }}
      >
        <span className="text-[10px] font-medium text-foreground leading-tight text-center px-1 truncate max-w-[44px]">
          {data.label}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-1.5 !h-1.5 !bg-border !border-2 !border-card"
      />
    </motion.div>
  );
}

export default memo(InstanceNodeComponent);
