'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { partitionsApi, importExportApi } from '../api';
import { patternToImportPayload, buildSeedPreview } from '../lib/patterns/seed';
import { logPatternEvent, type PatternSource } from '../lib/patterns/events';
import { useOntologyStore } from './useOntologyStore';
import type { Pattern } from '../lib/patterns/types';
import type { ImportRequestInput } from '../lib/schemas';

// PRD-BM-D01 (M0-6): 패턴 → 새 구획 시딩 오케스트레이션.
// EmptyState.handleConfirmLoad(템플릿 시딩)와 동일 시퀀스:
//   구획 생성 → 변환(patternToImportPayload) → import(merge, partitionId) → 계측 → 구획 선택 → reload.
// 브랜치 모드에서는 main 엔티티 테이블 우회를 막기 위해 차단(격리 게이팅).

// 구획 색 팔레트(보라 램프) — EmptyState 와 동일 규칙.
const PARTITION_PALETTE = [
  '#4026c5',
  '#6c2bd4',
  '#8060d7',
  '#9746ce',
  '#a16ed4',
  '#ab5ec9',
  '#c680d0',
  '#b893d7',
];

export interface SeedPatternArgs {
  pattern: Pattern;
  /** cache=로컬 캐시, discovered=발견, shared=공유 카탈로그. */
  source: PatternSource;
}

export interface UsePatternSeedOptions {
  /** 시딩 성공 후 이동 경로(예: 마켓플레이스→스튜디오 '/'). 미지정 시 현재 페이지 reload. */
  redirectTo?: string;
}

export function usePatternSeed(options?: UsePatternSeedOptions) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ pattern, source }: SeedPatternArgs): Promise<{ id: string }> => {
      const store = useOntologyStore.getState();
      if (store.currentBranch) {
        throw new Error(
          '브랜치에서는 패턴을 시딩할 수 없습니다. main으로 돌아간 뒤 시도하세요.',
        );
      }

      const color = PARTITION_PALETTE[store.partitions.length % PARTITION_PALETTE.length];
      const name = pattern.nameKo?.trim() ? pattern.nameKo : pattern.name;

      // 1) 새 구획 생성
      // 필요한 필드만 좁혀 캐스팅(무검증 광역 캐스트 회피 — EmptyState 와 동일 관례).
      const created = (await partitionsApi.create({
        name,
        description: '',
        color,
      })) as { id: string };

      // 2) 패턴 번들 → 그래프 payload 결정적 변환 후 3) 새 구획에 merge 시딩
      const payload = patternToImportPayload(pattern, created.id);
      await importExportApi.importOntology({
        version: '1.0',
        // 결정적 변환기가 만든 구체 타입 → import 페이로드(Record<string,unknown>[])로 캐스팅.
        ontology: payload as unknown as ImportRequestInput['ontology'],
        strategy: 'merge',
        partitionId: created.id,
      });

      // 4) 계측(TTFG·활성화 델타). fire-and-forget.
      const preview = buildSeedPreview(pattern);
      logPatternEvent({
        eventType: 'pattern_seeded',
        patternId: pattern.id,
        patternSource: source,
        partitionId: created.id,
        props: {
          domain: pattern.domain,
          classCount: preview.classCount,
          relationCount: preview.relationCount,
        },
      });

      // 5) 리로드 후 새 구획에서 결과를 보게 선택을 미리 저장(workspace-persistence).
      store.selectPartition(created.id);
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['patterns'] });
      queryClient.invalidateQueries({ queryKey: ['partitions'] });
      // 선택 구획은 persist 되므로 이동/리로드 후 스튜디오가 그 구획을 연다.
      if (options?.redirectTo) {
        window.location.href = options.redirectTo;
      } else {
        window.location.reload();
      }
    },
  });
}
