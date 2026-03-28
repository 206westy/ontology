'use client';

import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node, useStore } from '@xyflow/react';
import { motion } from 'motion/react';
import { NODE_COLORS, getNodeCssColors } from '../constants/colors';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { nodeEnter, safeTransition } from '@/lib/motion-presets';

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
  const transition = safeTransition(nodeEnter);

  const handleClick = () => {
    selectNode(id, 'instance');
  };

  // Dot mode: small rounded square
  if (detail === 'dot') {
    return (
      <div className="transition-opacity duration-150" onClick={handleClick} data-testid={`instance-node-${id}`}>
        <Handle type="target" position={Position.Top} className="!w-1.5 !h-1.5 !bg-transparent !border-0" />
        <div
          className="rounded cursor-pointer"
          style={{
            width: 8,
            height: 8,
            backgroundColor: borderColor,
            opacity: 0.6,
          }}
        />
        <Handle type="source" position={Position.Bottom} className="!w-1.5 !h-1.5 !bg-transparent !border-0" />
      </div>
    );
  }

  // Name mode: small rounded rectangle
  if (detail === 'name') {
    return (
      <motion.div
        initial={{ scale: 0.3, opacity: 0 }}
        animate={{ scale: 1, opacity: 0.75 }}
        transition={{ ...transition, delay: 0.1 }}
        className="group transition-all duration-150 hover:scale-[1.03]"
        onClick={handleClick}
        data-testid={`instance-node-${id}`}
      >
        <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-muted-foreground/40 !border-2 !border-card group-hover:!bg-primary/60 group-hover:!w-3 group-hover:!h-3 !transition-all !duration-150" />
        <div
          className={`flex items-center justify-center w-[52px] h-[36px] rounded-xl cursor-pointer transition-shadow duration-150 hover:shadow-md ${
            isFocused ? 'node-focus-ring' : ''
          }`}
          style={{
            border: `${isSelected ? 2.5 : 1.5}px solid ${isSelected ? selectedAccent : borderColor}`,
            backgroundColor: bgColor,
            boxShadow: isSelected
              ? `0 0 var(--node-selected-glow-blur) var(--node-selected-glow-spread) hsl(var(--node-${colorKey}) / var(--node-selected-glow-opacity))`
              : 'none',
          }}
        >
          <span className="text-caption font-medium text-foreground leading-tight text-center px-1 truncate max-w-[44px]">
            {data.label}
          </span>
        </div>
        <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-muted-foreground/40 !border-2 !border-card group-hover:!bg-primary/60 group-hover:!w-3 group-hover:!h-3 !transition-all !duration-150" />
      </motion.div>
    );
  }

  // Full mode: rounded rectangle (v3 change from circle)
  return (
    <motion.div
      initial={{ scale: 0.3, opacity: 0 }}
      animate={{ scale: 1, opacity: 0.85 }}
      transition={{ ...transition, delay: 0.1 }}
      className="group transition-all duration-150 hover:scale-[1.03]"
      onClick={handleClick}
      data-testid={`instance-node-${id}`}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-muted-foreground/40 !border-2 !border-card group-hover:!bg-primary/60 group-hover:!w-4 group-hover:!h-4 !transition-all !duration-150"
      />

      <div
        className={`flex items-center justify-center w-[72px] h-[44px] rounded-xl cursor-pointer transition-all duration-150 hover:shadow-lg ${
          isFocused ? 'node-focus-ring' : ''
        }`}
        style={{
          border: `${isSelected ? 2.5 : 2}px solid ${isSelected ? selectedAccent : borderColor}`,
          backgroundColor: bgColor,
          boxShadow: isSelected
            ? `0 0 var(--node-selected-glow-blur) var(--node-selected-glow-spread) hsl(var(--node-${colorKey}) / var(--node-selected-glow-opacity)), 0 0 20px hsl(var(--node-${colorKey}) / 0.12)`
            : 'none',
        }}
      >
        <span className="text-body-sm font-medium text-foreground leading-tight text-center px-1.5 truncate max-w-[60px]">
          {data.label}
        </span>
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-muted-foreground/40 !border-2 !border-card group-hover:!bg-primary/60 group-hover:!w-4 group-hover:!h-4 !transition-all !duration-150"
      />
    </motion.div>
  );
}

export default memo(InstanceNodeComponent);
