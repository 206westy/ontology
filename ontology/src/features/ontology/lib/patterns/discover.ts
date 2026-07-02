import type { PatternBundle } from './types';
import type {
  AdaptFn,
  DiscoverContext,
  OntologySource,
  RetrievedSeed,
  SynthesizeFn,
} from './discovery/provider';

// PRD-H (H2/M1): 발견 파이프라인 오케스트레이터 — retrieve › adapt › synthesize.
// deps 를 주입해 네트워크·LLM 없이 단위 테스트한다(실제 배선은 라우트에서).

export interface DiscoverDeps {
  sources: OntologySource[];
  adaptFn: AdaptFn;
  synthesizeFn: SynthesizeFn;
}

export interface DiscoverSource {
  repo: string | null;
  uri: string | null;
  label: string;
  license: string | null;
}

export interface DiscoverResult {
  bundle: PatternBundle;
  method: 'adapted' | 'synthesized';
  source: DiscoverSource | null;
}

async function retrieveBestSeed(
  ctx: DiscoverContext,
  sources: OntologySource[],
): Promise<RetrievedSeed | null> {
  const perSource = await Promise.all(
    sources.map((s) => s.search(ctx.domain, ctx.domainKo)),
  );
  const seeds = perSource.flat();
  if (seeds.length === 0) return null;
  return seeds.reduce((best, s) => (s.score > best.score ? s : best));
}

export async function discover(
  ctx: DiscoverContext,
  deps: DiscoverDeps,
): Promise<DiscoverResult> {
  const seed = await retrieveBestSeed(ctx, deps.sources);

  // 저장소에서 씨앗을 찾음 → 적응(carry 출처·라이선스).
  if (seed) {
    const bundle = await deps.adaptFn(seed, ctx);
    return {
      bundle,
      method: 'adapted',
      source: {
        repo: seed.repo,
        uri: seed.uri,
        label: seed.label,
        license: seed.license,
      },
    };
  }

  // 씨앗 없음 → 합성(출처 null).
  const bundle = await deps.synthesizeFn(ctx);
  return { bundle, method: 'synthesized', source: null };
}
