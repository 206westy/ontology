// @vitest-environment node
//
// PRD-F P3-4: 추출 eval 게이트. 골든셋 위에서 라이브 parse 를 실행해
// entity/relation/category 점수 + calibration 을 산출하고, 임계 미달 시 실패한다.
// LLM 비용·지연 때문에 매 커밋이 아니라 RUN_EVAL=1 일 때만 동작(nightly CI).
// 결과는 docs/eval-results.md 에 누적 기록한다.
import { describe, it, expect } from 'vitest';
import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { runSingle } from '@/lib/llm/parse-pipeline';
import { parseRequestSchema } from '@/features/ontology/lib/schemas';
import {
  scoreExtraction,
  type ScoredSet,
} from '@/features/ontology/lib/metrics/extraction-score';
import { computeCalibration, type CalibrationSample } from '@/features/ontology/lib/metrics/calibration';
import { GOLDEN_CASES } from '../fixtures/golden';
import { normalizeName } from '@/features/ontology/lib/similarity';

// 시작 임계(점진 상향): PRD-F P3-4.
const RELATION_F1_MIN = 0.6;
const CATEGORY_ACC_MIN = 0.7;

const enabled = process.env.RUN_EVAL === '1';

function relKey(r: { source: string; target: string; type: string }): string {
  return `${normalizeName(r.source)}->${normalizeName(r.target)}::${normalizeName(r.type)}`;
}

describe.runIf(enabled)('추출 eval 게이트 (RUN_EVAL=1)', () => {
  it(
    '골든셋 라이브 parse 점수 + calibration, 임계 이상',
    { timeout: 300_000 },
    async () => {
      let relTP = 0;
      let relExpected = 0;
      let relActual = 0;
      let catMatched = 0;
      let catCorrect = 0;
      const calibration: CalibrationSample[] = [];

      for (const c of GOLDEN_CASES) {
        const ctx = parseRequestSchema.parse({ text: c.inputText });
        const result = await runSingle(ctx, false);

        const actual: ScoredSet = {
          entities: result.entities.map((e) => ({ name: e.name })),
          relations: result.relations.map((r) => ({
            source: r.source,
            target: r.target,
            type: r.type,
            category: r.category,
          })),
        };
        const score = scoreExtraction(c.expected, actual);
        relTP += score.relations.truePositives;
        relExpected += score.relations.expected;
        relActual += score.relations.actual;
        catMatched += score.category.matched;
        catCorrect += score.category.correct;

        // calibration: actual 관계별 confidence vs 정답여부.
        const expectedKeys = new Set(c.expected.relations.map(relKey));
        for (const r of result.relations) {
          calibration.push({
            confidence: r.confidence,
            correct: expectedKeys.has(relKey(r)),
          });
        }
      }

      const precision = relActual === 0 ? 0 : relTP / relActual;
      const recall = relExpected === 0 ? 0 : relTP / relExpected;
      const relF1 =
        precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
      const catAcc = catMatched === 0 ? null : catCorrect / catMatched;
      const cal = computeCalibration(calibration);

      const line = `| ${new Date().toISOString()} | ${GOLDEN_CASES.length} | ${relF1.toFixed(3)} | ${catAcc === null ? 'n/a' : catAcc.toFixed(3)} | ${cal.ece.toFixed(3)} | ${cal.overconfidentBins.length} |`;
      try {
        appendFileSync(join(process.cwd(), 'docs', 'eval-results.md'), `\n${line}`);
      } catch {
        // 기록 실패는 게이트에 영향 없음.
      }

      // 게이트: 임계 미달 시 실패(빌드 실패).
      expect(relF1).toBeGreaterThanOrEqual(RELATION_F1_MIN);
      if (catAcc !== null) expect(catAcc).toBeGreaterThanOrEqual(CATEGORY_ACC_MIN);
    },
  );
});

// RUN_EVAL 미설정 시 스위트가 통째로 스킵됨을 문서화하는 no-op(러너가 파일을 수집해도 비용 0).
describe.runIf(!enabled)('추출 eval (비활성)', () => {
  it('RUN_EVAL=1 이 아니면 라이브 eval 을 건너뛴다', () => {
    expect(enabled).toBe(false);
  });
});
