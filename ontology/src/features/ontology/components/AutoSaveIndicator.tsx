'use client';

import { Check, AlertCircle, Loader2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export type AutoSaveState = 'idle' | 'unsaved' | 'saving' | 'saved' | 'error';

interface AutoSaveIndicatorProps {
  state: AutoSaveState;
  /** Whether auto-save is enabled */
  autoEnabled?: boolean;
  /** Toggle auto-save on/off */
  onToggleAuto?: () => void;
}

const STATE_CONFIG: Record<
  AutoSaveState,
  { label: string; dotClass: string; icon?: React.ReactNode }
> = {
  idle: {
    label: '변경 없음',
    dotClass: 'bg-muted-foreground',
  },
  unsaved: {
    label: '미저장',
    dotClass: 'bg-[hsl(var(--warning))] animate-[save-pulse_1.5s_ease-in-out_infinite]',
  },
  saving: {
    label: '저장 중...',
    dotClass: 'bg-[hsl(var(--gradient-brand-from))] animate-[save-pulse_0.6s_ease-in-out_infinite]',
    icon: <Loader2 className="w-3 h-3 animate-spin" />,
  },
  saved: {
    label: '저장 완료',
    dotClass: 'bg-[hsl(var(--success))]',
    icon: <Check className="w-3 h-3 text-[hsl(var(--success))]" />,
  },
  error: {
    label: '저장 실패',
    dotClass: 'bg-[hsl(var(--destructive))]',
    icon: <AlertCircle className="w-3 h-3 text-[hsl(var(--destructive))]" />,
  },
};

export default function AutoSaveIndicator({
  state,
  autoEnabled = false,
  onToggleAuto,
}: AutoSaveIndicatorProps) {
  const config = STATE_CONFIG[state];

  return (
    <div className="flex items-center gap-1.5">
      {/* Status dot */}
      <div
        className={`w-[var(--autosave-dot-size)] h-[var(--autosave-dot-size)] rounded-full transition-colors duration-200 ${config.dotClass}`}
      />

      {/* Icon (if applicable) */}
      {config.icon}

      {/* Status label */}
      <span className="text-xs text-muted-foreground">{config.label}</span>

      {/* Auto toggle badge */}
      {onToggleAuto && (
        <button
          type="button"
          onClick={onToggleAuto}
          className="ml-0.5"
        >
          <Badge
            variant={autoEnabled ? 'default' : 'outline'}
            className={`text-xs px-1.5 py-0.5 cursor-pointer select-none transition-colors ${
              autoEnabled
                ? 'gradient-brand text-white border-transparent'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Auto
          </Badge>
        </button>
      )}
    </div>
  );
}
