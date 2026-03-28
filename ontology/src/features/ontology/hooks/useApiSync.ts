'use client';

import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useOntologyStore } from './useOntologyStore';
import { classesApi, propertiesApi, instancesApi, edgesApi, relationTypesApi, axiomsApi, instanceValuesApi } from '../api';
import { toast } from 'sonner';

/**
 * Subscribes to Zustand pendingChanges and syncs writes to the API.
 * Optimistic UI pattern: Zustand updates immediately, API calls fire in background.
 * On failure, logs error but does not roll back (user can undo via zundo).
 */
export function useApiSync() {
  const qc = useQueryClient();
  const syncedRef = useRef(new Set<string>());

  useEffect(() => {
    const unsub = useOntologyStore.subscribe(
      (state, prevState) => {
        const newChanges = state.pendingChanges.filter(
          (c) => !syncedRef.current.has(c.id),
        );

        for (const change of newChanges) {
          syncedRef.current.add(change.id);
        }

        if (newChanges.length > 0) {
          syncChangesInOrder(newChanges, state).catch(() => {
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
          qc.invalidateQueries();
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
  axioms: 2,
};

type PendingChange = { id: string; operation: string; targetTable: string; targetId: string; targetName: string };

async function syncChangesInOrder(
  changes: PendingChange[],
  state: ReturnType<typeof useOntologyStore.getState>,
) {
  // Group by priority
  const groups = new Map<number, PendingChange[]>();
  for (const change of changes) {
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

async function syncChange(
  change: { operation: string; targetTable: string; targetId: string; targetName: string },
  state: ReturnType<typeof useOntologyStore.getState>,
) {
  const { operation, targetTable, targetId } = change;

  if (operation === 'ADD') {
    switch (targetTable) {
      case 'classes': {
        const cls = state.classes.find((c) => c.id === targetId);
        if (!cls) return;
        await classesApi.create({
          id: targetId,
          name: cls.name,
          parentId: cls.parentId,
          description: cls.description,
          color: cls.color,
          positionX: cls.positionX,
          positionY: cls.positionY,
        });
        break;
      }
      case 'instances': {
        const inst = state.instances.find((i) => i.id === targetId);
        if (!inst) return;
        await instancesApi.create({
          id: targetId,
          classId: inst.classId,
          name: inst.name,
        });
        break;
      }
      case 'properties': {
        const prop = state.properties.find((p) => p.id === targetId);
        if (!prop) return;
        await propertiesApi.create({
          id: targetId,
          classId: prop.classId,
          name: prop.name,
          dataType: prop.dataType,
          isRequired: prop.isRequired,
          enumValues: prop.enumValues,
          constraintRule: prop.constraintRule,
          sortOrder: prop.sortOrder,
        });
        break;
      }
      case 'edges': {
        const edge = state.edges.find((e) => e.id === targetId);
        if (!edge) return;
        await edgesApi.create({
          id: targetId,
          relationTypeId: edge.relationTypeId,
          sourceId: edge.sourceId,
          targetId: edge.targetId,
          sourceKind: edge.sourceKind,
          targetKind: edge.targetKind,
        });
        break;
      }
      case 'axioms': {
        const axiom = state.axioms.find((a) => a.id === targetId);
        if (!axiom) return;
        await axiomsApi.create({
          id: targetId,
          description: axiom.description,
          ruleLogic: axiom.ruleLogic ?? {},
          severity: axiom.severity as 'info' | 'warning' | 'error',
          classIds: axiom.classIds,
        });
        break;
      }
      case 'relation_types': {
        const rt = state.relationTypes.find((r) => r.id === targetId);
        if (!rt) return;
        await relationTypesApi.create({
          id: targetId,
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
      case 'axioms': {
        const axiom = state.axioms.find((a) => a.id === targetId);
        if (!axiom) return;
        await axiomsApi.update(targetId, {
          description: axiom.description,
          ruleLogic: axiom.ruleLogic ?? {},
          severity: axiom.severity as 'info' | 'warning' | 'error',
          classIds: axiom.classIds,
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
    switch (targetTable) {
      case 'classes': {
        await classesApi.delete(targetId);
        break;
      }
      case 'edges': {
        await edgesApi.delete(targetId);
        break;
      }
      case 'instances': {
        await instancesApi.delete(targetId);
        break;
      }
      case 'properties': {
        await propertiesApi.delete(targetId);
        break;
      }
      case 'axioms': {
        await axiomsApi.delete(targetId);
        break;
      }
      case 'relation_types': {
        await relationTypesApi.delete(targetId);
        break;
      }
    }
  }
}
