'use client';

import { Unlink, Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

// A-5 preview: nodes with no grounded relation. We never force a connection —
// islands are honest. The user may optionally ask for a connection suggestion,
// or simply leave them as islands (the default: do nothing).
interface IslandListProps {
  islands: string[];
  onSuggest?: (name: string) => void;
}

export default function IslandList({ islands, onSuggest }: IslandListProps) {
  return (
    <section>
      <div className="flex items-center gap-1.5 mb-1.5">
        <Unlink className="w-3 h-3 text-muted-foreground/70" />
        <span className="text-xs font-semibold text-muted-foreground uppercase">
          섬 {islands.length > 0 && `${islands.length}개`}
        </span>
      </div>

      {islands.length === 0 ? (
        <p className="text-xs text-muted-foreground/70 pl-1">
          연결되지 않은 노드 없음
        </p>
      ) : (
        <>
          <p className="text-xs text-muted-foreground/70 mb-1.5 pl-1">
            근거가 없어 연결하지 않았습니다. 그대로 섬으로 둘 수 있습니다.
          </p>
          <div className="space-y-1">
            {islands.map((name) => (
              <div
                key={name}
                className="flex items-center gap-1.5 py-0.5 pl-1 group"
              >
                <span className="w-2 h-2 rounded-full bg-muted-foreground/40 shrink-0" />
                <Badge variant="outline" className="text-xs h-5 border-dashed">
                  {name}
                </Badge>
                {onSuggest && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-5 px-1.5 text-xs gap-0.5 ml-auto text-muted-foreground hover:text-foreground"
                    onClick={() => onSuggest(name)}
                  >
                    <Link2 className="w-2.5 h-2.5" />
                    연결 제안
                  </Button>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}
