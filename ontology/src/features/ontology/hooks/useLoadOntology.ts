'use client';

import { useEffect, useRef } from 'react';
import { useClasses } from './useClasses';
import { useAllInstances } from './useInstances';
import { useAllProperties } from './useProperties';
import { useEdges } from './useEdges';
import { useRelationTypes } from './useRelationTypes';
import { useAxioms } from './useAxioms';
import { useOntologyStore } from './useOntologyStore';
import type {
  OntologyClass,
  OntologyInstance,
  OntologyProperty,
  RelationType,
  OntologyEdge,
  OntologyAxiom,
} from '../lib/types';

export function useLoadOntology() {
  const loadOntology = useOntologyStore((s) => s.loadOntology);

  const classesQuery = useClasses();
  const instancesQuery = useAllInstances();
  const propertiesQuery = useAllProperties();
  const edgesQuery = useEdges();
  const relationTypesQuery = useRelationTypes();
  const axiomsQuery = useAxioms();

  const allLoaded =
    classesQuery.isSuccess &&
    instancesQuery.isSuccess &&
    propertiesQuery.isSuccess &&
    edgesQuery.isSuccess &&
    relationTypesQuery.isSuccess &&
    axiomsQuery.isSuccess;

  const isLoading =
    classesQuery.isLoading ||
    instancesQuery.isLoading ||
    propertiesQuery.isLoading ||
    edgesQuery.isLoading ||
    relationTypesQuery.isLoading ||
    axiomsQuery.isLoading;

  const isError =
    classesQuery.isError ||
    instancesQuery.isError ||
    propertiesQuery.isError ||
    edgesQuery.isError ||
    relationTypesQuery.isError ||
    axiomsQuery.isError;

  const initialLoadDone = useRef(false);

  useEffect(() => {
    if (!allLoaded) return;
    // Only load from DB on initial mount — not on every refetch
    // This prevents overwriting local Zustand state with stale DB data
    if (initialLoadDone.current) return;
    initialLoadDone.current = true;

    loadOntology({
      classes: (classesQuery.data as OntologyClass[]) ?? [],
      instances: (instancesQuery.data as OntologyInstance[]) ?? [],
      properties: (propertiesQuery.data as OntologyProperty[]) ?? [],
      relationTypes: (relationTypesQuery.data as RelationType[]) ?? [],
      edges: (edgesQuery.data as OntologyEdge[]) ?? [],
      axioms: (axiomsQuery.data as OntologyAxiom[]) ?? [],
      instanceValues: [],
    });
  }, [
    allLoaded,
    classesQuery.data,
    instancesQuery.data,
    propertiesQuery.data,
    edgesQuery.data,
    relationTypesQuery.data,
    axiomsQuery.data,
    loadOntology,
  ]);

  return { isLoading, isError, allLoaded };
}
