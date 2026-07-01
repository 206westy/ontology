'use client';

import { useEffect, useRef } from 'react';
import { useClasses } from './useClasses';
import { useAllInstances } from './useInstances';
import { useAllProperties } from './useProperties';
import { useEdges } from './useEdges';
import { useRelationTypes } from './useRelationTypes';
import { useAxioms } from './useAxioms';
import { useInstanceValues } from './useInstanceValues';
import { usePartitions } from './usePartitions';
import { useOntologyStore } from './useOntologyStore';
import type {
  OntologyClass,
  OntologyInstance,
  OntologyProperty,
  RelationType,
  OntologyEdge,
  OntologyAxiom,
  InstanceValue,
  Partition,
} from '../lib/types';

export function useLoadOntology() {
  const loadOntology = useOntologyStore((s) => s.loadOntology);

  const classesQuery = useClasses();
  const instancesQuery = useAllInstances();
  const propertiesQuery = useAllProperties();
  const edgesQuery = useEdges();
  const relationTypesQuery = useRelationTypes();
  const axiomsQuery = useAxioms();
  const instanceValuesQuery = useInstanceValues();
  const partitionsQuery = usePartitions();

  const allLoaded =
    classesQuery.isSuccess &&
    instancesQuery.isSuccess &&
    propertiesQuery.isSuccess &&
    edgesQuery.isSuccess &&
    relationTypesQuery.isSuccess &&
    axiomsQuery.isSuccess &&
    instanceValuesQuery.isSuccess &&
    partitionsQuery.isSuccess;

  const isLoading =
    classesQuery.isLoading ||
    instancesQuery.isLoading ||
    propertiesQuery.isLoading ||
    edgesQuery.isLoading ||
    relationTypesQuery.isLoading ||
    axiomsQuery.isLoading ||
    instanceValuesQuery.isLoading ||
    partitionsQuery.isLoading;

  const isError =
    classesQuery.isError ||
    instancesQuery.isError ||
    propertiesQuery.isError ||
    edgesQuery.isError ||
    relationTypesQuery.isError ||
    axiomsQuery.isError ||
    instanceValuesQuery.isError ||
    partitionsQuery.isError;

  // Track the latest dataUpdatedAt across all queries to detect fresh data
  const latestUpdatedAt = allLoaded
    ? Math.max(
        classesQuery.dataUpdatedAt,
        instancesQuery.dataUpdatedAt,
        propertiesQuery.dataUpdatedAt,
        edgesQuery.dataUpdatedAt,
        relationTypesQuery.dataUpdatedAt,
        axiomsQuery.dataUpdatedAt,
        instanceValuesQuery.dataUpdatedAt,
        partitionsQuery.dataUpdatedAt,
      )
    : 0;

  const lastSyncedAt = useRef(0);

  useEffect(() => {
    if (!allLoaded || latestUpdatedAt === 0) return;
    // Only sync to Zustand when React Query data is newer than the last sync
    if (latestUpdatedAt <= lastSyncedAt.current) return;
    lastSyncedAt.current = latestUpdatedAt;

    loadOntology({
      classes: (classesQuery.data as OntologyClass[]) ?? [],
      instances: (instancesQuery.data as OntologyInstance[]) ?? [],
      properties: (propertiesQuery.data as OntologyProperty[]) ?? [],
      relationTypes: (relationTypesQuery.data as RelationType[]) ?? [],
      edges: (edgesQuery.data as OntologyEdge[]) ?? [],
      axioms: (axiomsQuery.data as OntologyAxiom[]) ?? [],
      instanceValues: (instanceValuesQuery.data as InstanceValue[]) ?? [],
      partitions: (partitionsQuery.data as Partition[]) ?? [],
    });
  }, [
    allLoaded,
    latestUpdatedAt,
    classesQuery.data,
    instancesQuery.data,
    propertiesQuery.data,
    edgesQuery.data,
    relationTypesQuery.data,
    axiomsQuery.data,
    instanceValuesQuery.data,
    partitionsQuery.data,
    loadOntology,
  ]);

  return { isLoading, isError, allLoaded };
}
