'use client';

import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, Loader2 } from 'lucide-react';
import { aiGlow } from '@/lib/motion-presets';

interface Suggestion {
  name: string;
  description?: string;
  reason?: string;
  dataType?: string;
  isRequired?: boolean;
}

interface AutocompleteSuggestionsProps {
  suggestions: Suggestion[];
  isLoading: boolean;
  error: string | null;
  onSelect: (suggestion: Suggestion) => void;
  onTrigger: () => void;
  visible: boolean;
  label?: string;
}

export default function AutocompleteSuggestions({
  suggestions,
  isLoading,
  error,
  onSelect,
  onTrigger,
  visible,
  label = 'AI \uCD94\uCC9C',
}: AutocompleteSuggestionsProps) {
  return (
    <div className="relative">
      {/* AI trigger button */}
      <motion.button
        type="button"
        className="flex items-center gap-1 text-[10px] h-5 px-2 rounded-full gradient-brand text-white font-medium shadow-sm hover:shadow-md transition-shadow"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onTrigger();
        }}
        title="Ctrl+Space"
        animate={
          isLoading
            ? {
                boxShadow: [
                  '0 0 4px hsl(263 70% 50.4% / 0.3)',
                  '0 0 12px hsl(263 70% 50.4% / 0.6)',
                  '0 0 4px hsl(263 70% 50.4% / 0.3)',
                ],
              }
            : {}
        }
        transition={isLoading ? (aiGlow as Record<string, unknown>) : undefined}
      >
        {isLoading ? (
          <Loader2 className="w-3 h-3 animate-spin" />
        ) : (
          <Sparkles className="w-3 h-3" />
        )}
        <span>{label}</span>
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {visible && (suggestions.length > 0 || isLoading || error) && (
          <motion.div
            initial={{ opacity: 0, y: -4, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -4, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute z-50 left-0 top-full mt-1 w-64 max-h-[200px] overflow-y-auto bg-white dark:bg-card border border-border rounded-lg shadow-lg"
          >
            {isLoading && (
              <div className="flex items-center gap-2 px-3 py-2.5 text-xs text-muted-foreground">
                <Loader2 className="w-3 h-3 animate-spin" />
                {`AI \uCD94\uCC9C \uBD84\uC11D \uC911...`}
              </div>
            )}

            {error && (
              <div className="px-3 py-2.5 text-xs text-destructive">
                {error}
              </div>
            )}

            {!isLoading && suggestions.length > 0 && (
              <div className="py-1">
                {suggestions.map((s, i) => (
                  <button
                    key={`${s.name}-${i}`}
                    type="button"
                    className="flex flex-col w-full text-left px-3 py-2 hover:bg-muted/50 transition-colors"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onSelect(s);
                    }}
                  >
                    <span className="text-xs font-medium text-foreground">
                      {s.name}
                      {s.dataType && (
                        <span className="ml-1.5 text-[9px] font-normal text-muted-foreground bg-muted px-1 py-0.5 rounded">
                          {s.dataType}
                        </span>
                      )}
                    </span>
                    {(s.description || s.reason) && (
                      <span className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">
                        {s.description || s.reason}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {!isLoading && !error && suggestions.length === 0 && (
              <div className="px-3 py-2.5 text-xs text-muted-foreground">
                {`\uCD94\uCC9C \uACB0\uACFC\uAC00 \uC5C6\uC2B5\uB2C8\uB2E4.`}
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
