import { describe, it, expect } from 'vitest';
import { findWriteClauseViolation } from '@/lib/neo4j/read-only';

// H4 regression: write clauses must be blocked in code, not just by prompt text.
describe('findWriteClauseViolation (text2cypher read-only guard)', () => {
  it('allows read-only queries', () => {
    expect(
      findWriteClauseViolation('MATCH (n:Class) RETURN n LIMIT 10'),
    ).toBeNull();
    expect(
      findWriteClauseViolation('MATCH (a)-[r]->(b) RETURN a, type(r), b'),
    ).toBeNull();
  });

  it.each([
    'CREATE (n:Class {name: "x"})',
    'MATCH (n) DETACH DELETE n',
    'MATCH (n) SET n.name = "x"',
    'MERGE (n:Class {name: "x"})',
    'MATCH (n) REMOVE n.name',
    'DROP INDEX ON :Class(name)',
    'LOAD CSV FROM "file:///x.csv" AS row CREATE (n)',
  ])('blocks write query: %s', (query) => {
    expect(findWriteClauseViolation(query)).not.toBeNull();
  });
});
