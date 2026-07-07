'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOntologyStore } from './useOntologyStore';
import { classesApi, propertiesApi, instancesApi, edgesApi, relationTypesApi, instanceValuesApi, batchApi } from '../api';
import type { BatchOperation } from '../lib/schemas';
import { toast } from 'sonner';

/**
 * Subscribes to Zustand pendingChanges and syncs writes to the API.
 * Optimistic UI pattern: Zustand updates immediately, API calls fire in background.
 * On failure, logs error but does not roll back (user can undo via zundo).
 */
export function useApiSync() {
  const qc = useQueryClient();
  const syncedRef = useRef(new Set<string>());
  // 진행형(패턴) 생성은 노드·엣지를 여러 setTimeout 배치로 나눠 추가하므로 store 구독이
  // 배치마다 여러 번 발화한다. 각 발화를 await 없이 쏘면 relation_type 배치와 edge 배치가
  // DB에서 경쟁해 edges_relation_type_id_fkey(엣지가 아직 없는 관계타입 참조) 500이 난다.
  // → 동기화 호출을 단일 큐로 직렬화해 enqueue 순서 = commit 순서를 보장한다.
  const syncQueueRef = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    const unsub = useOntologyStore.subscribe(
      (state, prevState) => {
        const newChanges = state.pendingChanges.filter(
          (c) => !syncedRef.current.has(c.id),
        );

        for (const change of newChanges) {
          syncedRef.current.add(change.id);
        }

        // PRD-J M2: 브랜치 모드에서는 엔티티 API 동기화를 중단한다(main 작업본 보호).
        // 변경은 pendingChanges → 브랜치 커밋으로만 기록되고, 병합(M3)에서 main 에 반영된다.
        // synced 마킹은 위에서 이미 했으므로 main 복귀 후에도 재전송되지 않는다.
        if (state.currentBranch) {
          return;
        }

        if (newChanges.length > 0) {
          // 이전 동기화가 끝난(=커밋된) 뒤 다음 배치를 보낸다(FK 경쟁 방지).
          syncQueueRef.current = syncQueueRef.current
            .then(() => syncChangesInOrder(newChanges, state))
            .catch(() => {
              // Individual errors are already handled inside syncChangesInOrder
            });
        }

        // Keep the set from growing unbounded
        if (syncedRef.current.size > 500) {
          const activeIds = new Set(state.pendingChanges.map((c) => c.id));
          syncedRef.current = activeIds;
        }
      },
    );

    return unsub;
  }, []);

  // Invalidate queries when changes are cleared (committed)
  useEffect(() => {
    const unsub = useOntologyStore.subscribe(
      (state, prevState) => {
        if (prevState.pendingChanges.length > 0 && state.pendingChanges.length === 0) {
          // 커밋은 엔티티 내용을 바꾸지 않고 commits/commit_details 만 기록한다.
          // 스토어가 이미 동일 UUID 로 권위 데이터를 들고 있으므로 엔티티 목록 전체를
          // 다시 시드니에서 받아오는 것은 낭비 → 갱신이 실제로 필요한 커밋 히스토리만 무효화.
          qc.invalidateQueries({ queryKey: ['commits'] });
          syncedRef.current.clear();
        }
      },
    );
    return unsub;
  }, [qc]);
}

// Tables that must be synced before dependent tables
const SYNC_PRIORITY: Record<string, number> = {
  classes: 0,
  relation_types: 0,
  properties: 1,
  instances: 1,
  edges: 2,
  instance_values: 2,
};

type PendingChange = { id: string; operation: string; targetTable: string; targetId: string; targetName: string };

async function syncChangesInOrder(
  changes: PendingChange[],
  state: ReturnType<typeof useOntologyStore.getState>,
) {
  // ADD 는 단일 batch 요청으로 합쳐 시드니 왕복을 N→1 로 줄인다.
  // (batch 라우트가 테이블별 multi-row insert·생성 순서·어트리뷰션을 처리)
  // MOD/DEL 은 기존 per-entity 라우트 그대로(우선순위 웨이브).
  const adds = changes.filter((c) => c.operation === 'ADD');
  const mutations = changes.filter((c) => c.operation !== 'ADD');

  if (adds.length > 0) {
    const operations = adds
      .map((c) => buildAddOperation(c, state))
      .filter((op): op is BatchOperation => op !== null);
    if (operations.length > 0) {
      try {
        await batchApi.execute({ operations });
      } catch (err) {
        console.error('[API Sync] Batch ADD failed:', err);
        toast.error('동기화 실패', {
          description: `${adds.length}건 생성 저장에 실패했습니다.`,
        });
      }
    }
  }

  if (mutations.length === 0) return;

  // Group mutations by priority
  const groups = new Map<number, PendingChange[]>();
  for (const change of mutations) {
    const p = SYNC_PRIORITY[change.targetTable] ?? 2;
    const group = groups.get(p) ?? [];
    group.push(change);
    groups.set(p, group);
  }

  // Process each priority group sequentially; within a group, fire in parallel
  const priorities = [...groups.keys()].sort((a, b) => a - b);
  for (const p of priorities) {
    const group = groups.get(p)!;
    await Promise.allSettled(
      group.map((change) =>
        syncChange(change, state).catch((err) => {
          console.error(`[API Sync] Failed to sync ${change.operation} ${change.targetTable}/${change.targetId}:`, err);
          toast.error('동기화 실패', {
            description: `${change.targetName} ${change.operation} 저장에 실패했습니다.`,
          });
        }),
      ),
    );
  }
}

// 스토어 엔티티 → batch create operation. 개별 ADD 라우트가 받던 필드와 동일.
function buildAddOperation(
  change: PendingChange,
  state: ReturnType<typeof useOntologyStore.getState>,
): BatchOperation | null {
  const { targetTable, targetId } = change;
  switch (targetTable) {
    case 'classes': {
      const cls = state.classes.find((c) => c.id === targetId);
      if (!cls) return null;
      return {
        type: 'class',
        action: 'create',
        id: targetId,
        data: {
          id: targetId,
          name: cls.name,
          parentId: cls.parentId,
          partitionId: cls.partitionId,
          description: cls.description,
          color: cls.color,
          positionX: cls.positionX,
          positionY: cls.positionY,
          sourceType: cls.sourceType ?? null,
          confidence: cls.confidence ?? null,
          evidence: cls.evidence ?? null,
        },
      };
    }
    case 'instances': {
      const inst = state.instances.find((i) => i.id === targetId);
      if (!inst) return null;
      return {
        type: 'instance',
        action: 'create',
        id: targetId,
        data: { id: targetId, classId: inst.classId, name: inst.name, description: inst.description },
      };
    }
    case 'properties': {
      const prop = state.properties.find((p) => p.id === targetId);
      if (!prop) return null;
      return {
        type: 'property',
        action: 'create',
        id: targetId,
        data: {
          id: targetId,
          classId: prop.classId,
          name: prop.name,
          dataType: prop.dataType,
          isRequired: prop.isRequired,
          enumValues: prop.enumValues,
          constraintRule: prop.constraintRule,
          sortOrder: prop.sortOrder,
        },
      };
    }
    case 'edges': {
      const edge = state.edges.find((e) => e.id === targetId);
      if (!edge) return null;
      return {
        type: 'edge',
        action: 'create',
        id: targetId,
        data: {
          id: targetId,
          relationTypeId: edge.relationTypeId,
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          sourceKind: edge.sourceKind,
          targetKind: edge.targetKind,
          isBridge: edge.isBridge ?? false,
          sourceType: edge.sourceType ?? null,
          confidence: edge.confidence ?? null,
          evidence: edge.evidence ?? null,
        },
      };
    }
    case 'relation_types': {
      const rt = state.relationTypes.find((r) => r.id === targetId);
      if (!rt) return null;
      return {
        type: 'relation_type',
        action: 'create',
        id: targetId,
        // PRD-L M2: layer 를 Supabase 까지 전파(조용한 유실 방지).
        data: { id: targetId, name: rt.name, description: rt.description, layer: rt.layer },
      };
    }
    case 'instance_values': {
      const iv = state.instanceValues.find((v) => v.id === targetId);
      if (!iv) return null;
      return {
        type: 'instance_value',
        action: 'create',
        id: targetId,
        data: { instanceId: iv.instanceId, propertyId: iv.propertyId, value: iv.value },
      };
    }
    default:
      return null;
  }
}

async function syncChange(
  change: { operation: string; targetTable: string; targetId: string; targetName: string },
  state: ReturnType<typeof useOntologyStore.getState>,
) {
  const { operation, targetTable, targetId } = change;
  // ADD 는 syncChangesInOrder 에서 batch 1요청으로 처리(여기 도달하지 않음). MOD/DEL 만 처리.

  if (operation === 'MOD') {
    switch (targetTable) {
      case 'classes': {
        const cls = state.classes.find((c) => c.id === targetId);
        if (!cls) return;
        await classesApi.update(targetId, {
          name: cls.name,
          parentId: cls.parentId,
          description: cls.description,
          color: cls.color,
          positionX: cls.positionX,
          positionY: cls.positionY,
        });
        break;
      }
      case 'properties': {
        const prop = state.properties.find((p) => p.id === targetId);
        if (!prop) return;
        await propertiesApi.update(targetId, {
          name: prop.name,
          dataType: prop.dataType,
          isRequired: prop.isRequired,
          enumValues: prop.enumValues,
          sortOrder: prop.sortOrder,
        });
        break;
      }
      case 'instances': {
        const inst = state.instances.find((i) => i.id === targetId);
        if (!inst) return;
        await instancesApi.update(targetId, {
          name: inst.name,
          classId: inst.classId,
        });
        break;
      }
      case 'relation_types': {
        const rt = state.relationTypes.find((r) => r.id === targetId);
        if (!rt) return;
        await relationTypesApi.update(targetId, {
          name: rt.name,
          description: rt.description,
        });
        break;
      }
      case 'instance_values': {
        const iv = state.instanceValues.find((v) => v.id === targetId);
        if (!iv) return;
        await instanceValuesApi.upsert({
          instanceId: iv.instanceId,
          propertyId: iv.propertyId,
          value: iv.value,
        });
        break;
      }
    }
  }

  if (operation === 'DEL') {
    // 이미 DB에 없는 항목(404)은 삭제 성공으로 간주 — 고아 데이터 초기화 시 에러 소음 방지.
    const ignoreNotFound = (err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (/not found|404/i.test(msg)) return;
      throw err;
    };
    switch (targetTable) {
      case 'classes': {
        await classesApi.delete(targetId).catch(ignoreNotFound);
        break;
      }
      case 'edges': {
        await edgesApi.delete(targetId).catch(ignoreNotFound);
        break;
      }
      case 'instances': {
        await instancesApi.delete(targetId).catch(ignoreNotFound);
        break;
      }
      case 'properties': {
        await propertiesApi.delete(targetId).catch(ignoreNotFound);
        break;
      }
      case 'relation_types': {
        await relationTypesApi.delete(targetId).catch(ignoreNotFound);
        break;
      }
    }
  }
}
