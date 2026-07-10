import { describe, expect, it, vi, afterEach } from 'vitest';
import { act, render } from '@testing-library/react';

import SplashScreen from '../SplashScreen';

// 로그인 지연 개선: floor/cap/ready 분기와 onComplete 1회 호출 보장을 잠근다.
// EXIT_FADE_MS(400) 는 컴포넌트 내부 상수 — 페이드 종료 후 onComplete 가 불린다.
const FADE_MS = 400;

function advance(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

describe('SplashScreen 타이밍', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('ready 가 floor 이전에 와도 floor 까지 대기한 뒤 종료한다', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(
      <SplashScreen
        minDisplayMs={600}
        maxDisplayMs={2500}
        ready
        onComplete={onComplete}
      />,
    );

    // floor(600) 이전 — 아직 종료/콜백 없음
    advance(300);
    expect(onComplete).not.toHaveBeenCalled();

    // floor 통과 → visible=false, effect 가 페이드 setTimeout 을 등록(act 플러시)
    advance(400);
    // 이제 페이드(400) 경과 → onComplete
    advance(FADE_MS + 60);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('ready 가 오지 않아도 cap 에서 강제 종료한다', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(
      <SplashScreen
        minDisplayMs={600}
        maxDisplayMs={2500}
        ready={false}
        onComplete={onComplete}
      />,
    );

    // cap(2500) 이전 — 종료 안 됨
    advance(2400);
    expect(onComplete).not.toHaveBeenCalled();

    // cap 통과 → visible=false, effect 가 페이드 setTimeout 등록
    advance(200);
    // 페이드 경과 → 종료
    advance(FADE_MS + 60);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('종료 이후 타이머가 더 흘러도 onComplete 는 1회만 호출된다', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    render(
      <SplashScreen
        minDisplayMs={600}
        maxDisplayMs={2500}
        ready
        onComplete={onComplete}
      />,
    );

    advance(660); // floor 통과 → visible=false, 페이드 setTimeout 등록
    advance(FADE_MS + 60); // 페이드 경과 → onComplete
    expect(onComplete).toHaveBeenCalledTimes(1);

    // 인터벌이 정리됐으므로 추가 경과에도 재호출 없음
    advance(5000);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
