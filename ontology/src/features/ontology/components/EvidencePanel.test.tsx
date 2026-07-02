import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import EvidencePanel, { type EdgeEvidence } from './EvidencePanel';

// ScrollArea(radix)는 React 19 + jsdom 에서 무한 루프 소지가 있어 단순 div 로 대체.
vi.mock('@/components/ui/scroll-area', () => {
  const ScrollAreaMock = React.forwardRef(
    ({ className, children, ...props }: Record<string, unknown>, ref: React.Ref<HTMLDivElement>) => (
      <div ref={ref} className={className as string} {...props}>
        {children as React.ReactNode}
      </div>
    ),
  );
  ScrollAreaMock.displayName = 'ScrollArea';
  return { ScrollArea: ScrollAreaMock, ScrollBar: () => null };
});

describe('EvidencePanel', () => {
  it('renders node provenance: source-type label and evidence quote', () => {
    render(
      <EvidencePanel
        nodeName="펌프"
        nodeProvenance={{ sourceType: 'document', evidence: '펌프는 유체를 이송한다', confidence: 0.9 }}
        edgeEvidence={[]}
      />,
    );

    expect(screen.getByText('노드 출처')).toBeInTheDocument();
    expect(screen.getByText('문서')).toBeInTheDocument(); // document → 문서 라벨
    expect(screen.getByText(/펌프는 유체를 이송한다/)).toBeInTheDocument();
  });

  it('renders confidence as qualitative band, never a raw percentage', () => {
    const { container } = render(
      <EvidencePanel
        nodeName="펌프"
        nodeProvenance={{ sourceType: 'inferred', evidence: null, confidence: 0.92 }}
        edgeEvidence={[]}
      />,
    );

    expect(screen.getByText('신뢰도 높음')).toBeInTheDocument();
    // 원시 % 는 절대 노출하지 않는다.
    expect(container.textContent).not.toMatch(/%/);
    expect(container.textContent).not.toMatch(/92/);
  });

  it('renders relation provenance grouped separately', () => {
    const edges: EdgeEvidence[] = [
      {
        id: 'e1',
        relationName: '이송한다',
        direction: 'out',
        otherName: '유체',
        sourceType: 'web',
        evidence: '펌프가 유체를 이송',
        confidence: 0.7,
      },
    ];
    render(<EvidencePanel nodeName="펌프" nodeProvenance={null} edgeEvidence={edges} />);

    expect(screen.getByText('관계 출처')).toBeInTheDocument();
    expect(screen.getByText('이송한다')).toBeInTheDocument();
    expect(screen.getByText('유체')).toBeInTheDocument();
    expect(screen.getByText('웹')).toBeInTheDocument(); // web → 웹
    expect(screen.getByText('신뢰도 보통')).toBeInTheDocument();
  });

  it('shows empty state when no provenance is present', () => {
    render(
      <EvidencePanel
        nodeName="펌프"
        nodeProvenance={{ sourceType: null, evidence: null, confidence: null }}
        edgeEvidence={[
          { id: 'e1', relationName: 'r', direction: 'out', otherName: 'x', sourceType: null, evidence: null, confidence: null },
        ]}
      />,
    );

    expect(screen.getByText('근거 정보 없음')).toBeInTheDocument();
    expect(screen.queryByText('노드 출처')).not.toBeInTheDocument();
    expect(screen.queryByText('관계 출처')).not.toBeInTheDocument();
  });

  it("ignores placeholder evidence value 'existing'", () => {
    render(
      <EvidencePanel
        nodeName="펌프"
        nodeProvenance={{ sourceType: null, evidence: 'existing', confidence: null }}
        edgeEvidence={[]}
      />,
    );

    // sourceType 없음 + evidence 가 placeholder 뿐 → provenance 없음으로 간주.
    expect(screen.getByText('근거 정보 없음')).toBeInTheDocument();
  });
});
