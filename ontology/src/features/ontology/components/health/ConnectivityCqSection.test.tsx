import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ConnectivityCqSection from './ConnectivityCqSection';
import { analyzeConnectivity } from '../../lib/validate/connectivity';
import {
  evaluateCompetencyQuestions,
  buildGraphPathChecker,
  type CqGraphEdge,
} from '../../lib/validate/cq';
import type { PatternTraversalTemplate } from '../../lib/patterns/types';

const TEMPLATES: PatternTraversalTemplate[] = [
  { cq: '증상 X의 원인은?', path: '(:Symptom)-[:indicates]->(:FailureMode)-[:caused_by]->(:Cause)' },
  { cq: '원인 Y의 조치는?', path: '(:Cause)-[:resolved_by]->(:Action)' },
];
const CQS = TEMPLATES.map((t) => t.cq);

describe('ConnectivityCqSection (H7 검수 표시)', () => {
  it('분리된 그래프는 "N개로 분리" 경고를 보여준다', () => {
    const connectivity = analyzeConnectivity(
      [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      [
        { sourceId: 'a', targetId: 'b' },
        { sourceId: 'c', targetId: 'd' },
      ],
    );
    render(<ConnectivityCqSection connectivity={connectivity} cq={null} />);
    expect(screen.getByTestId('connectivity-warning')).toHaveTextContent('2개로 분리');
  });

  it('단일 연결 그래프는 성공 상태를 보여준다', () => {
    const connectivity = analyzeConnectivity(
      [{ id: 'a' }, { id: 'b' }],
      [{ sourceId: 'a', targetId: 'b' }],
    );
    render(<ConnectivityCqSection connectivity={connectivity} cq={null} />);
    expect(screen.getByText(/단일 연결 그래프입니다/)).toBeInTheDocument();
  });

  it('전부 답 경로가 있으면 "CQ 2/2"를 표시한다', () => {
    const edges: CqGraphEdge[] = [
      { sourceId: 's', targetId: 'f', relationName: 'indicates' },
      { sourceId: 'f', targetId: 'c', relationName: 'caused_by' },
      { sourceId: 'c', targetId: 'a', relationName: 'resolved_by' },
    ];
    const cq = evaluateCompetencyQuestions(CQS, TEMPLATES, buildGraphPathChecker(edges));
    const connectivity = analyzeConnectivity([{ id: 's' }], edges);
    render(<ConnectivityCqSection connectivity={connectivity} cq={cq} />);
    expect(screen.getByTestId('cq-pass-rate')).toHaveTextContent('CQ 2/2');
  });

  it('답 경로 없는 CQ 가 있으면 통과율이 내려간다', () => {
    const edges: CqGraphEdge[] = [
      { sourceId: 's', targetId: 'f', relationName: 'indicates' },
      { sourceId: 'f', targetId: 'c', relationName: 'caused_by' },
      // resolved_by 없음 → 2번째 CQ 실패.
    ];
    const cq = evaluateCompetencyQuestions(CQS, TEMPLATES, buildGraphPathChecker(edges));
    const connectivity = analyzeConnectivity([{ id: 's' }], edges);
    render(<ConnectivityCqSection connectivity={connectivity} cq={cq} />);
    expect(screen.getByTestId('cq-pass-rate')).toHaveTextContent('CQ 1/2');
    expect(screen.getByText('원인 Y의 조치는?')).toBeInTheDocument();
  });
});
