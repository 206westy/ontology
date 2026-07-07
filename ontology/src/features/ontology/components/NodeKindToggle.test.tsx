import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  NodeKindToggle,
  NODE_KIND_LABELS,
  NODE_KIND_QUESTION,
  NODE_KIND_DESCRIPTIONS,
  NODE_KIND_SUMMARY,
} from './NodeKindToggle';

// PRD-L M4: 클래스/인스턴스 확정을 단일 어포던스로 수렴. 라벨·전환 콜백·compact 검증.
describe('NodeKindToggle', () => {
  it('클래스 판정 시 클래스 라벨과 평문 질문·설명을 보여준다(전체 모드)', () => {
    render(<NodeKindToggle kind="class" />);

    expect(screen.getByText(NODE_KIND_LABELS.class)).toBeInTheDocument();
    expect(screen.getByText(NODE_KIND_QUESTION)).toBeInTheDocument();
    expect(screen.getByText(NODE_KIND_DESCRIPTIONS.class)).toBeInTheDocument();
  });

  it('인스턴스 판정 시 인스턴스 설명을 보여준다(전체 모드)', () => {
    render(<NodeKindToggle kind="instance" />);

    expect(screen.getByText(NODE_KIND_DESCRIPTIONS.instance)).toBeInTheDocument();
    expect(screen.queryByText(NODE_KIND_DESCRIPTIONS.class)).not.toBeInTheDocument();
  });

  it('전환 버튼은 반대 종류로 onToggle 을 호출한다', async () => {
    const user = userEvent.setup();
    const onToggle = vi.fn();
    render(<NodeKindToggle kind="class" onToggle={onToggle} />);

    // 버튼 라벨은 전환 대상(인스턴스)을 노출한다.
    await user.click(screen.getByRole('button', { name: new RegExp(NODE_KIND_LABELS.instance) }));

    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith('instance');
  });

  it('onToggle 이 없으면 전환 버튼을 렌더링하지 않는다(표시 전용)', () => {
    render(<NodeKindToggle kind="instance" />);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('compact 모드는 배지·버튼만 있고 평문 질문/설명을 생략한다', () => {
    render(<NodeKindToggle kind="instance" compact onToggle={() => {}} />);

    expect(screen.getByText(NODE_KIND_LABELS.instance)).toBeInTheDocument();
    expect(screen.queryByText(NODE_KIND_QUESTION)).not.toBeInTheDocument();
    expect(screen.queryByText(NODE_KIND_DESCRIPTIONS.instance)).not.toBeInTheDocument();
    // compact 에서도 전환 버튼은 항상 보인다(hover 전용 아님).
    expect(
      screen.getByRole('button', { name: new RegExp(NODE_KIND_LABELS.class) }),
    ).toBeInTheDocument();
  });

  it('disabled 면 전환 버튼이 비활성화된다', () => {
    render(<NodeKindToggle kind="class" onToggle={() => {}} disabled />);

    expect(screen.getByRole('button')).toBeDisabled();
  });

  it('배지 title 은 공통 요약 문구를 쓴다', () => {
    render(<NodeKindToggle kind="class" compact />);

    expect(
      screen.getByTitle(`${NODE_KIND_LABELS.class} — ${NODE_KIND_SUMMARY.class}`),
    ).toBeInTheDocument();
  });
});

// PRD-L M4: 3곳 수렴 — 마이크로카피는 단일 출처(NodeKindToggle)에서만 정의된다.
describe('클래스/인스턴스 문구 수렴', () => {
  it('마이크로카피 상수를 고정한다(카피 계약)', () => {
    expect(NODE_KIND_QUESTION).toBe('이건 종류(클래스)인가요, 실제 하나(인스턴스)인가요?');
    expect(NODE_KIND_DESCRIPTIONS.class).toBe('비슷한 것들을 대표하는 유형 — 예: 호랑이');
    expect(NODE_KIND_DESCRIPTIONS.instance).toBe('그 유형의 실제 한 개 — 예: 범이(우리집 호랑이)');
    expect(NODE_KIND_SUMMARY.class).toBe('개념의 종류·카테고리');
    expect(NODE_KIND_SUMMARY.instance).toBe('실제 사례 한 개');
  });

  it('세 사용처(빠른입력·AI 미리보기·RightPanel)가 NodeKindToggle 모듈을 공통으로 참조한다', () => {
    const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
    const newNode = read('./NewNodePopover.tsx');
    const rightPanel = read('./RightPanel.tsx');

    // 빠른입력 탭: 공통 상수 직접 사용. AI 미리보기: NodeKindToggle 컴포넌트 사용.
    expect(newNode).toContain("from './NodeKindToggle'");
    expect(newNode).toContain('NODE_KIND_QUESTION');
    expect(newNode).toContain('NODE_KIND_DESCRIPTIONS');
    expect(newNode).toContain('<NodeKindToggle');
    // RightPanel 배지: NodeKindToggle 컴포넌트 사용.
    expect(rightPanel).toContain("from './NodeKindToggle'");
    expect(rightPanel).toContain('<NodeKindToggle');
  });
});
