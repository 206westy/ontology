import { useCallback, useEffect, useRef, useState } from 'react';

interface Offset {
  x: number;
  y: number;
}

interface UseDraggableResult {
  /** 드래그로 누적된 이동량. 기준 위치(left/top)에 더해서 사용한다. */
  offset: Offset;
  /** 드래그 핸들(헤더 등) 요소에 펼쳐 넣는다. onPointerDown 으로 드래그를 시작한다. */
  dragHandleProps: {
    onPointerDown: (e: React.PointerEvent) => void;
    style: { cursor: string; touchAction: 'none' };
  };
  isDragging: boolean;
  /** 팝오버가 새로 열릴 때 등 이동량을 초기화한다. */
  reset: () => void;
}

/**
 * 떠있는 패널(팝오버 등)을 포인터로 드래그해 옮길 수 있게 한다.
 * 기준 좌표는 호출부가 소유하고, 이 훅은 그 위에 더할 offset 만 관리한다.
 * 버튼/입력 등 인터랙티브 요소에서 시작한 드래그는 무시해 클릭을 방해하지 않는다.
 */
export function useDraggable(): UseDraggableResult {
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragState = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(
    null,
  );

  const reset = useCallback(() => setOffset({ x: 0, y: 0 }), []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      // 핸들 내부의 버튼/입력 등에서 시작한 경우는 드래그로 가로채지 않는다.
      if ((e.target as HTMLElement).closest('button, input, textarea, select, a, [role="tab"]')) {
        return;
      }
      if (e.button !== 0) return;
      dragState.current = {
        startX: e.clientX,
        startY: e.clientY,
        baseX: offset.x,
        baseY: offset.y,
      };
      setIsDragging(true);
    },
    [offset.x, offset.y],
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: PointerEvent) => {
      const s = dragState.current;
      if (!s) return;
      setOffset({ x: s.baseX + (e.clientX - s.startX), y: s.baseY + (e.clientY - s.startY) });
    };
    const handleUp = () => {
      dragState.current = null;
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    window.addEventListener('pointercancel', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
      window.removeEventListener('pointercancel', handleUp);
    };
  }, [isDragging]);

  return {
    offset,
    dragHandleProps: { onPointerDown, style: { cursor: 'grab', touchAction: 'none' } },
    isDragging,
    reset,
  };
}
