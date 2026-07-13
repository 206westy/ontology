import { describe, it, expect } from 'vitest';
import {
  buildTraversalCypher,
  shapeEvidencePaths,
  collectProvenance,
  pathsToPromptText,
  MAX_DEPTH_CAP,
  DEFAULT_PATH_LIMIT,
} from './traverse';

describe('buildTraversalCypher', () => {
  it('스코프 지정 시 경로 전체 구획 가드레일을 넣고 partition 을 바인딩한다', () => {
    const { cypher, params } = buildTraversalCypher(['n1', 'n2'], { partition: 'P1' });
    expect(cypher).toContain('ALL(n IN nodes(p) WHERE n.partition = $partition)');
    expect(cypher).toContain('$entryIds');
    expect(cypher).toContain('LIMIT toInteger($limit)');
    expect(params.partition).toBe('P1');
    expect(params.entryIds).toEqual(['n1', 'n2']);
    // 실제 구획 값은 Cypher 문자열에 하드코딩되지 않는다(바인딩).
    expect(cypher).not.toContain("'P1'");
  });

  it('스코프 없으면 가드레일 생략(관리자 전체 탐색)', () => {
    const { cypher, params } = buildTraversalCypher(['n1']);
    expect(cypher).not.toContain('n.partition = $partition');
    expect(params.partition).toBeUndefined();
  });

  it('maxDepth 는 상한으로 클램프되어 패턴에 인라인된다', () => {
    const { cypher } = buildTraversalCypher(['n1'], { partition: 'P1', maxDepth: 99 });
    expect(cypher).toContain(`[r*1..${MAX_DEPTH_CAP}]`);
  });

  it('limit 미지정 시 기본 상한', () => {
    const { params } = buildTraversalCypher(['n1'], { partition: 'P1' });
    expect(params.limit).toBe(DEFAULT_PATH_LIMIT);
  });
});

describe('shapeEvidencePaths', () => {
  const rows = [
    {
      nodes: [
        { id: 'a', name: 'Chuck', partition: 'P1', src: 'session_doc', srcRef: 'doc1', conf: 0.9, description: '척' },
        { id: 'b', name: 'Pump', partition: 'P1', src: null, srcRef: null, conf: null, description: null },
      ],
      edges: [{ type: 'CONTROLS', bridge: false }],
    },
  ];

  it('중첩 결과를 타입화하고 partition 을 경로 첫 노드로 잡는다', () => {
    const paths = shapeEvidencePaths(rows);
    expect(paths).toHaveLength(1);
    expect(paths[0].partition).toBe('P1');
    expect(paths[0].nodes[0].sourceType).toBe('session_doc');
    expect(paths[0].nodes[0].confidence).toBe(0.9);
    expect(paths[0].edges[0].type).toBe('CONTROLS');
  });

  it('동일 노드 시퀀스 경로는 중복 제거', () => {
    expect(shapeEvidencePaths([...rows, ...rows])).toHaveLength(1);
  });

  it('빈 노드 경로는 버린다', () => {
    expect(shapeEvidencePaths([{ nodes: [], edges: [] }])).toHaveLength(0);
  });
});

describe('collectProvenance', () => {
  it('출처(src)나 근거(description) 있는 노드만 provenance 로', () => {
    const paths = shapeEvidencePaths([
      {
        nodes: [
          { id: 'a', name: 'Chuck', partition: 'P1', src: 'web', srcRef: 'http://x', conf: 0.8, description: null },
          { id: 'b', name: 'Pump', partition: 'P1', src: null, srcRef: null, conf: null, description: null },
        ],
        edges: [{ type: 'CONTROLS', bridge: false }],
      },
    ]);
    const prov = collectProvenance(paths);
    expect(prov).toHaveLength(1);
    expect(prov[0].nodeId).toBe('a');
    expect(prov[0].sourceType).toBe('web');
  });
});

describe('pathsToPromptText', () => {
  it('경로 없으면 명시적으로 표기', () => {
    expect(pathsToPromptText([])).toContain('no paths');
  });

  it('경로를 체인 텍스트로, bridge 는 표시', () => {
    const paths = shapeEvidencePaths([
      {
        nodes: [
          { id: 'a', name: 'Chuck', partition: 'P1', src: null, srcRef: null, conf: null, description: null },
          { id: 'b', name: 'Pump', partition: 'P1', src: null, srcRef: null, conf: null, description: null },
        ],
        edges: [{ type: 'CONTROLS', bridge: true }],
      },
    ]);
    const text = pathsToPromptText(paths);
    expect(text).toContain('Chuck');
    expect(text).toContain('Pump');
    expect(text).toContain('CONTROLS*bridge');
  });
});
