'use client';

import { useState } from 'react';
import { m, AnimatePresence } from 'motion/react';
import { ChevronRight, Copy, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface CypherPreviewProps {
  cypher: string;
}

function highlightCypher(code: string): string {
  const keywords = /\b(CREATE|MATCH|SET|MERGE|DELETE|DETACH|REMOVE|RETURN|WHERE|WITH|AND|OR|NOT|IN|AS|ON|UNWIND|OPTIONAL|CALL|YIELD)\b/g;
  const strings = /('[^']*'|"[^"]*")/g;
  const comments = /(\/\/.*$)/gm;

  let result = code
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  result = result.replace(comments, '<span class="text-muted-foreground/60 italic">$1</span>');
  result = result.replace(strings, '<span class="text-success">$1</span>');
  result = result.replace(keywords, '<span class="text-primary font-semibold">$1</span>');

  return result;
}

export default function CypherPreview({ cypher }: CypherPreviewProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(cypher);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!cypher) return null;

  return (
    <div className="space-y-1">
      <button
        className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:text-foreground transition-colors w-full"
        onClick={() => setIsOpen(!isOpen)}
      >
        <ChevronRight
          className={`w-3.5 h-3.5 transition-transform ${isOpen ? 'rotate-90' : ''}`}
        />
        Cypher 미리보기
      </button>

      <AnimatePresence>
        {isOpen && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="relative rounded-lg border border-border bg-muted/50 p-3 mt-1">
              <pre className="text-xs font-mono leading-relaxed overflow-x-auto max-h-[200px] overflow-y-auto">
                <code dangerouslySetInnerHTML={{ __html: highlightCypher(cypher) }} />
              </pre>
              <Button
                variant="ghost"
                size="sm"
                className="absolute top-2 right-2 h-6 w-6 p-0"
                onClick={handleCopy}
              >
                {copied ? (
                  <Check className="w-3 h-3 text-success" />
                ) : (
                  <Copy className="w-3 h-3 text-muted-foreground" />
                )}
              </Button>
            </div>
          </m.div>
        )}
      </AnimatePresence>
    </div>
  );
}
