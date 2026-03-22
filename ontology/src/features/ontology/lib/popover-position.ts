const MARGIN = 12;

interface Position {
  x: number;
  y: number;
}

interface Size {
  w: number;
  h: number;
}

export function calcPopoverPosition(
  triggerPos: Position,
  popoverSize: Size,
): { left: number; top: number } {
  const vw = typeof window !== 'undefined' ? window.innerWidth : 1920;
  const vh = typeof window !== 'undefined' ? window.innerHeight : 1080;

  let left = triggerPos.x + MARGIN;
  let top = triggerPos.y + MARGIN;

  // Flip horizontally if overflowing right
  if (left + popoverSize.w > vw - MARGIN) {
    left = triggerPos.x - popoverSize.w - MARGIN;
  }
  // If still overflowing left, clamp to margin
  if (left < MARGIN) {
    left = MARGIN;
  }

  // Flip vertically if overflowing bottom
  if (top + popoverSize.h > vh - MARGIN) {
    top = triggerPos.y - popoverSize.h - MARGIN;
  }
  // If still overflowing top, clamp to margin
  if (top < MARGIN) {
    top = MARGIN;
  }

  return { left, top };
}
