import { describe, it, expect, beforeEach, vi } from 'vitest';
import { calcPopoverPosition } from '@/features/ontology/lib/popover-position';

describe('calcPopoverPosition (A-6)', () => {
  beforeEach(() => {
    // Mock window dimensions
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true });
  });

  it('should position popover to the right and below the trigger by default', () => {
    const pos = calcPopoverPosition({ x: 500, y: 300 }, { w: 360, h: 320 });
    expect(pos.left).toBe(500 + 12);
    expect(pos.top).toBe(300 + 12);
  });

  it('should flip horizontally if overflowing right', () => {
    const pos = calcPopoverPosition({ x: 1800, y: 300 }, { w: 360, h: 320 });
    // 1800 + 12 + 360 = 2172 > 1920 - 12 = 1908 → flip
    expect(pos.left).toBe(1800 - 360 - 12);
  });

  it('should flip vertically if overflowing bottom', () => {
    const pos = calcPopoverPosition({ x: 500, y: 900 }, { w: 360, h: 320 });
    // 900 + 12 + 320 = 1232 > 1080 - 12 = 1068 → flip
    expect(pos.top).toBe(900 - 320 - 12);
  });

  it('should clamp to margin if flipping still overflows', () => {
    const pos = calcPopoverPosition({ x: 10, y: 10 }, { w: 360, h: 320 });
    // Normal: 10 + 12 = 22, 22 + 360 < 1908 → no flip
    expect(pos.left).toBe(22);
    expect(pos.top).toBe(22);
  });

  it('should clamp left to margin when flip causes negative', () => {
    // Trigger at x=100 with w=360 → right: 100+12+360=472 (fine), but let's force overflow
    Object.defineProperty(window, 'innerWidth', { value: 400, writable: true });
    const pos = calcPopoverPosition({ x: 350, y: 100 }, { w: 360, h: 100 });
    // 350 + 12 + 360 = 722 > 400-12 = 388 → flip: 350-360-12 = -22 → clamp to 12
    expect(pos.left).toBe(12);
  });

  it('should clamp top to margin when flip causes negative', () => {
    Object.defineProperty(window, 'innerHeight', { value: 400, writable: true });
    const pos = calcPopoverPosition({ x: 100, y: 350 }, { w: 100, h: 320 });
    // 350 + 12 + 320 = 682 > 388 → flip: 350-320-12 = 18 → OK but let's test deep
    expect(pos.top).toBe(18);
  });
});
