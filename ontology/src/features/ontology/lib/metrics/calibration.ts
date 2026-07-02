// PRD-F P3-3: confidence calibration 측정. 관계 confidence 를 bin 으로 묶어
// 예측 confidence(평균) vs 실제 정답률(reliability)을 비교하고 ECE(expected
// calibration error)를 산출한다. 과신(confidence↑·정답률↓) 구간을 드러낸다.
// v6 북극성의 "confidence 보정도" 지표를 코드로 연결.

export interface CalibrationSample {
  confidence: number; // 0..1 예측 신뢰도
  correct: boolean; // 골든셋 대비 실제 정답 여부
}

export interface CalibrationBin {
  lower: number; // bin 하한(포함)
  upper: number; // bin 상한(마지막 bin만 포함, 나머지 미포함)
  count: number;
  avgConfidence: number; // bin 내 예측 confidence 평균
  accuracy: number; // bin 내 실제 정답률
  gap: number; // |avgConfidence - accuracy| (해당 bin 보정오차)
}

export interface CalibrationReport {
  bins: CalibrationBin[];
  ece: number; // Σ (n_bin/N) * |acc_bin - conf_bin|
  samples: number;
  // 과신 구간: avgConfidence 가 accuracy 보다 유의하게 높은 bin(gap>threshold).
  overconfidentBins: CalibrationBin[];
}

const DEFAULT_BINS = 10;
const OVERCONFIDENCE_GAP = 0.1;

// [0,1] 을 균등 bin 으로 나눠 reliability + ECE 계산.
export function computeCalibration(
  samples: CalibrationSample[],
  binCount: number = DEFAULT_BINS,
): CalibrationReport {
  const n = samples.length;
  const bins: CalibrationBin[] = [];

  for (let i = 0; i < binCount; i++) {
    const lower = i / binCount;
    const upper = (i + 1) / binCount;
    const inBin = samples.filter((s) => {
      const c = clamp01(s.confidence);
      return i === binCount - 1 ? c >= lower && c <= upper : c >= lower && c < upper;
    });
    const count = inBin.length;
    const avgConfidence =
      count === 0 ? 0 : inBin.reduce((a, s) => a + clamp01(s.confidence), 0) / count;
    const accuracy =
      count === 0 ? 0 : inBin.filter((s) => s.correct).length / count;
    bins.push({
      lower,
      upper,
      count,
      avgConfidence,
      accuracy,
      gap: Math.abs(avgConfidence - accuracy),
    });
  }

  const ece =
    n === 0 ? 0 : bins.reduce((acc, b) => acc + (b.count / n) * b.gap, 0);

  const overconfidentBins = bins.filter(
    (b) => b.count > 0 && b.avgConfidence - b.accuracy > OVERCONFIDENCE_GAP,
  );

  return { bins, ece, samples: n, overconfidentBins };
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}
