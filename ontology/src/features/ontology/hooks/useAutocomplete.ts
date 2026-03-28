'use client';

import { useState, useCallback, useRef } from 'react';
import { useOntologyStore } from './useOntologyStore';
import { buildSchemaContext, type SchemaContext } from '../lib/schema-context';

export interface ClassSuggestion {
  name: string;
  description: string;
  reason: string;
}

export interface PropertySuggestion {
  name: string;
  dataType: 'string' | 'integer' | 'float' | 'boolean' | 'date' | 'enum';
  isRequired: boolean;
  reason: string;
}

export interface RelationSuggestion {
  name: string;
  description: string;
  reason: string;
}

type SuggestionType = 'class' | 'property' | 'relation';

interface AutocompleteState<T> {
  suggestions: T[];
  isLoading: boolean;
  error: string | null;
}

const DEBOUNCE_MS = 500;

function getStoreSnapshot() {
  const s = useOntologyStore.getState();
  return {
    classes: s.classes,
    instances: s.instances,
    properties: s.properties,
    relationTypes: s.relationTypes,
    edges: s.edges,
  };
}

async function fetchSuggestions(
  type: SuggestionType,
  context: SchemaContext,
  currentInput: string,
  extra?: Record<string, string>,
  signal?: AbortSignal,
) {
  const res = await fetch('/api/llm/autocomplete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ type, context, currentInput, extra }),
    signal,
  });

  if (!res.ok) {
    const data = await res.json();
    throw new Error(data.error ?? 'Autocomplete request failed');
  }

  return res.json();
}

export function useClassAutocomplete() {
  const [state, setState] = useState<AutocompleteState<ClassSuggestion>>({
    suggestions: [],
    isLoading: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(
    (currentInput: string, parentClassName?: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();

      debounceRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
          const snapshot = getStoreSnapshot();
          const context = buildSchemaContext(snapshot);
          const extra: Record<string, string> = {};
          if (parentClassName) extra.parentClassName = parentClassName;

          const data = await fetchSuggestions(
            'class',
            context,
            currentInput,
            extra,
            controller.signal,
          );

          if (!controller.signal.aborted) {
            setState({
              suggestions: data.suggestions ?? [],
              isLoading: false,
              error: null,
            });
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          }));
        }
      }, DEBOUNCE_MS);
    },
    [],
  );

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    setState({ suggestions: [], isLoading: false, error: null });
  }, []);

  return { ...state, trigger, clear };
}

export function usePropertyAutocomplete() {
  const [state, setState] = useState<AutocompleteState<PropertySuggestion>>({
    suggestions: [],
    isLoading: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(
    (
      currentInput: string,
      className: string,
      classDescription?: string,
      existingProperties?: string[],
    ) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();

      debounceRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
          const snapshot = getStoreSnapshot();
          const context = buildSchemaContext(snapshot);
          const extra: Record<string, string> = {
            className,
          };
          if (classDescription) extra.classDescription = classDescription;
          if (existingProperties?.length) {
            extra.existingProperties = existingProperties.join(', ');
          }

          const data = await fetchSuggestions(
            'property',
            context,
            currentInput,
            extra,
            controller.signal,
          );

          if (!controller.signal.aborted) {
            setState({
              suggestions: data.suggestions ?? [],
              isLoading: false,
              error: null,
            });
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          }));
        }
      }, DEBOUNCE_MS);
    },
    [],
  );

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    setState({ suggestions: [], isLoading: false, error: null });
  }, []);

  return { ...state, trigger, clear };
}

export function useRelationAutocomplete() {
  const [state, setState] = useState<AutocompleteState<RelationSuggestion>>({
    suggestions: [],
    isLoading: false,
    error: null,
  });
  const abortRef = useRef<AbortController | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const trigger = useCallback(
    (currentInput: string, sourceName: string, targetName: string) => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (abortRef.current) abortRef.current.abort();

      debounceRef.current = setTimeout(async () => {
        const controller = new AbortController();
        abortRef.current = controller;
        setState((prev) => ({ ...prev, isLoading: true, error: null }));

        try {
          const snapshot = getStoreSnapshot();
          const context = buildSchemaContext(snapshot);
          const extra: Record<string, string> = {
            sourceName,
            targetName,
          };

          const data = await fetchSuggestions(
            'relation',
            context,
            currentInput,
            extra,
            controller.signal,
          );

          if (!controller.signal.aborted) {
            setState({
              suggestions: data.suggestions ?? [],
              isLoading: false,
              error: null,
            });
          }
        } catch (err) {
          if ((err as Error).name === 'AbortError') return;
          setState((prev) => ({
            ...prev,
            isLoading: false,
            error: err instanceof Error ? err.message : 'Unknown error',
          }));
        }
      }, DEBOUNCE_MS);
    },
    [],
  );

  const clear = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (abortRef.current) abortRef.current.abort();
    setState({ suggestions: [], isLoading: false, error: null });
  }, []);

  return { ...state, trigger, clear };
}

/** Local fuzzy match against existing items */
export function fuzzyMatch<T extends { name: string }>(
  items: T[],
  query: string,
  limit = 5,
): T[] {
  if (!query.trim()) return [];
  const lower = query.toLowerCase();
  return items
    .filter((item) => item.name.toLowerCase().includes(lower))
    .slice(0, limit);
}
