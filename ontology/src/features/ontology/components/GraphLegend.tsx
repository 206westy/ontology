'use client';

// 그래프 범례 (PRD §7) — 좌하단 고정. 색=도메인 / 크기=연결 차수 인코딩을 명시하고,
// 색 칩 클릭으로 도메인 표시/숨김(colorFilter)을 토글한다. 모달/토스트 금지 규칙 준수(인라인 카드).

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { useOntologyStore } from '../hooks/useOntologyStore';
import { NODE_COLOR_LABELS, getNodeCssColors } from '../constants/colors';
import type { NodeColorKey } from '../lib/types';

const KEYS = Object.keys(NODE_COLOR_LABELS) as NodeColorKey[];

export default function GraphLegend() {
  const [open, setOpen] = useState(true);
  const colorFilter = useOntologyStore((s) => s.colorFilter);
  const toggleColorFilter = useOntologyStore((s) => s.toggleColorFilter);

  const filtering = colorFilter.length > 0;
  // colorFilter가 비어있으면 전부 표시(=전부 활성), 아니면 포함된 것만 활성.
  const isOn = (key: NodeColorKey) => !filtering || colorFilter.includes(key);

  return (
    <div className="absolute bottom-3 left-3 z-10 w-[188px] select-none rounded-xl border border-border bg-card/80 shadow-elevation-2 backdrop-blur-md">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-2 px-3 py-2 text-caption font-semibold text-foreground"
        aria-expanded={open}
      >
        <span className="tracking-tight">범례</span>
        <ChevronDown
          aria-hidden="true"
          className="h-3.5 w-3.5 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none"
          style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
        />
      </button>

      {open && (
        <div className="px-2 pb-2">
          <ul className="grid grid-cols-2 gap-x-1 gap-y-0.5">
            {KEYS.map((key) => {
              const { borderColor } = getNodeCssColors(key);
              const on = isOn(key);
              return (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => toggleColorFilter(key)}
                    aria-pressed={on}
                    aria-label={`${NODE_COLOR_LABELS[key]} 도메인 토글`}
                    className="flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-left text-[11px] text-foreground transition-[background-color,opacity] hover:bg-accent/40 motion-reduce:transition-none"
                    style={{ opacity: on ? 1 : 0.4 }}
                  >
                    <span
                      aria-hidden="true"
                      className="h-2.5 w-2.5 shrink-0 rounded-full border"
                      style={{
                        // 활성: 채움 / 비활성(필터 제외): 외곽선만(hollow)
                        backgroundColor: on ? borderColor : 'transparent',
                        borderColor,
                      }}
                    />
                    <span className="min-w-0 truncate">{NODE_COLOR_LABELS[key]}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="mt-2 space-y-1 border-t border-border/60 px-1.5 pt-1.5 text-[10px] leading-relaxed text-muted-foreground">
            {/* 모양 = 종류 */}
            <div className="flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
                <circle cx="8" cy="8" r="6" className="fill-muted-foreground/20 stroke-muted-foreground" strokeWidth="1.5" />
              </svg>
              <span>큰 원 = <span className="text-foreground/80">클래스</span>(유형)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
                <circle cx="8" cy="8" r="3" className="fill-muted-foreground stroke-muted-foreground" strokeWidth="1" />
              </svg>
              <span>작은 점 = <span className="text-foreground/80">인스턴스</span>(사례) · 호버로 이름</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true" className="shrink-0">
                <circle cx="8" cy="8" r="6" fill="none" className="stroke-muted-foreground/60" strokeWidth="1.5" strokeDasharray="2 2" />
              </svg>
              <span>점선 원 = 빈 클래스(미작성)</span>
            </div>
            {/* 선 = 관계 종류 */}
            <div className="flex items-center gap-1.5 pt-0.5">
              <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true" className="shrink-0">
                <line x1="1" y1="5" x2="15" y2="5" className="stroke-muted-foreground" strokeWidth="1.5" strokeDasharray="3 2" />
                <path d="M15 2 L19 5 L15 8 Z" className="fill-muted-foreground" />
              </svg>
              <span>파선 = 상·하위(계층)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true" className="shrink-0">
                <line x1="1" y1="5" x2="19" y2="5" className="stroke-muted-foreground/60" strokeWidth="1" strokeDasharray="1 2" />
              </svg>
              <span>점선 = 소속(인스턴스→클래스)</span>
            </div>
            <div className="flex items-center gap-1.5">
              <svg width="20" height="10" viewBox="0 0 20 10" aria-hidden="true" className="shrink-0">
                <line x1="1" y1="5" x2="15" y2="5" className="stroke-foreground/70" strokeWidth="1.5" />
                <path d="M15 2 L19 5 L15 8 Z" className="fill-foreground/70" />
              </svg>
              <span>실선 = 관계(이름 표시)</span>
            </div>
            <p className="pt-1">
              <span className="text-foreground/80">색</span> = 도메인 ·{' '}
              <span className="text-foreground/80">크기</span> = 연결 차수
            </p>
            <p className="text-muted-foreground/70">클래스 더블클릭 = 인스턴스 펼침/접기</p>
          </div>
        </div>
      )}
    </div>
  );
}
