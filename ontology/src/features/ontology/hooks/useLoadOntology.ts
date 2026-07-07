'use client';

import { useEffect, useRef } from 'react';
import { useClasses } from './useClasses';
import { useAllInstances } from './useInstances';
import { useAllProperties } from './useProperties';
import { useEdges } from './useEdges';
import { useRelationTypes } from './useRelationTypes';
import { useInstanceValues } from './useInstanceValues';
import { usePartitions } from './usePartitions';
import { useOntologyStore } from './useOntologyStore';
import { mergeInstancesDataWithoutHistory } from '../store';
import type {
  OntologyClass,
  OntologyInstance,
  OntologyProperty,
  RelationType,
  OntologyEdge,
  InstanceValue,
  Partition,
} from '../lib/types';

// PRD-Perf M3-3: 2단계 프로그레시브 로딩.
// 1단계(스키마: 클래스·속성·엣지·관계유형·구획)가 도착하면 즉시 렌더하고,
// 2단계(인스턴스·인스턴스값 — 데이터의 대부분)는 도착하는 대로 병합한다.
// 첫 페인트가 인스턴스 수와 디커플되며, 가장 느린 쿼리 하나가 전체를 막지 않는다.
export function useLoadOntology() {
  const loadOntology = useOntologyStore((s) => s.loadOntology);
  // PRD-J M2: 브랜치 체크아웃 중에는 main 데이터로 스토어를 덮어쓰면 안 된다.
  // (React Query 리페치가 브랜치 작업 상태를 main 으로 되돌리는 사고 방지)
  const currentBranch = useOntologyStore((s) => s.currentBranch);

  const classesQuery = useClasses();
  const instancesQuery = useAllInstances();
  const propertiesQuery = useAllProperties();
  const edgesQuery = useEdges();
  const relationTypesQuery = useRelationTypes();
  const instanceValuesQuery = useInstanceValues();
  const partitionsQuery = usePartitions();

  const schemaLoaded =
    classesQuery.isSuccess &&
    propertiesQuery.isSuccess &&
    edgesQuery.isSuccess &&
    relationTypesQuery.isSuccess &&
    partitionsQuery.isSuccess;

  const instancesLoaded = instancesQuery.isSuccess && instanceValuesQuery.isSuccess;

  const allLoaded = schemaLoaded && instancesLoaded;

  // 첫 페인트 게이트는 스키마만 본다 — 인스턴스는 도착하는 대로 나타난다.
  const isLoading =
    classesQuery.isLoading ||
    propertiesQuery.isLoading ||
    edgesQuery.isLoading ||
    relationTypesQuery.isLoading ||
    partitionsQuery.isLoading;

  const isError =
    classesQuery.isError ||
    instancesQuery.isError ||
    propertiesQuery.isError ||
    edgesQuery.isError ||
    relationTypesQuery.isError ||
    instanceValuesQuery.isError ||
    partitionsQuery.isError;

  const schemaUpdatedAt = schemaLoaded
    ? Math.max(
        classesQuery.dataUpdatedAt,
        propertiesQuery.dataUpdatedAt,
        edgesQuery.dataUpdatedAt,
        relationTypesQuery.dataUpdatedAt,
        partitionsQuery.dataUpdatedAt,
      )
    : 0;

  const instancesUpdatedAt = instancesLoaded
    ? Math.max(instancesQuery.dataUpdatedAt, instanceValuesQuery.dataUpdatedAt)
    : 0;

  const lastSchemaSyncedAt = useRef(0);
  const lastInstancesSyncedAt = useRef(0);

  // ── 1단계: 스키마 하이드레이션 (기존 loadOntology 의미론 그대로 — 전체 리셋) ──
  // 인스턴스 쿼리가 이미 끝나 있으면 함께 싣는다(기존과 동일한 원자적 로드).
  // 아직이면 빈 배열로 시작하고 2단계 병합이 채운다(최초 로드에서만 발생).
  useEffect(() => {
    if (!schemaLoaded || schemaUpdatedAt === 0) return;
    // PRD-J M2: 브랜치 모드에서는 main 로드를 중단(체크아웃 상태 보호).
    if (currentBranch) return;
    if (schemaUpdatedAt <= lastSchemaSyncedAt.current) return;
    lastSchemaSyncedAt.current = schemaUpdatedAt;

    loadOntology({
      classes: (classesQuery.data as OntologyClass[]) ?? [],
      instances: (instancesQuery.data as OntologyInstance[]) ?? [],
      properties: (propertiesQuery.data as OntologyProperty[]) ?? [],
      relationTypes: (relationTypesQuery.data as RelationType[]) ?? [],
      edges: (edgesQuery.data as OntologyEdge[]) ?? [],
      instanceValues: (instanceValuesQuery.data as InstanceValue[]) ?? [],
      partitions: (partitionsQuery.data as Partition[]) ?? [],
    });
  }, [
    schemaLoaded,
    schemaUpdatedAt,
    currentBranch,
    classesQuery.data,
    instancesQuery.data,
    propertiesQuery.data,
    edgesQuery.data,
    relationTypesQuery.data,
    instanceValuesQuery.data,
    partitionsQuery.data,
    loadOntology,
  ]);

  // ── 2단계: 인스턴스 병합 (리셋 없음·undo 스냅샷 없음·로컬 신규 항목 보존) ──
  useEffect(() => {
    if (!instancesLoaded || instancesUpdatedAt === 0) return;
    if (currentBranch) return;
    // 1단계가 아직 안 돌았으면 병합해도 곧 loadOntology 가 덮어쓴다 — 1단계 이후에만.
    if (lastSchemaSyncedAt.current === 0) return;
    if (instancesUpdatedAt <= lastInstancesSyncedAt.current) return;
    lastInstancesSyncedAt.current = instancesUpdatedAt;

    mergeInstancesDataWithoutHistory({
      instances: (instancesQuery.data as OntologyInstance[]) ?? [],
      instanceValues: (instanceValuesQuery.data as InstanceValue[]) ?? [],
    });
  }, [
    instancesLoaded,
    instancesUpdatedAt,
    currentBranch,
    instancesQuery.data,
    instanceValuesQuery.data,
  ]);

  return { isLoading, isError, allLoaded };
}
