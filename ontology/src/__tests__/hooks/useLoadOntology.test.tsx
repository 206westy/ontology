import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';

// C2 regression: instance property values must be loaded from the server,
// not hardcoded to [] (which silently dropped them on every reload).
vi.mock('@/features/ontology/api', () => ({
  classesApi: { list: vi.fn().mockResolvedValue([]) },
  instancesApi: { list: vi.fn().mockResolvedValue([]) },
  propertiesApi: { list: vi.fn().mockResolvedValue([]) },
  edgesApi: { list: vi.fn().mockResolvedValue([]) },
  relationTypesApi: { list: vi.fn().mockResolvedValue([]) },
  instanceValuesApi: {
    list: vi.fn().mockResolvedValue([
      { id: 'iv-1', instanceId: 'inst-1', propertyId: 'prop-1', value: '25' },
    ]),
  },
  partitionsApi: { list: vi.fn().mockResolvedValue([]) },
}));

import { useLoadOntology } from '@/features/ontology/hooks/useLoadOntology';
import { useOntologyStore } from '@/features/ontology/hooks/useOntologyStore';

function makeWrapper() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return function Wrapper({ children }: React.PropsWithChildren) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  };
}

describe('useLoadOntology', () => {
  beforeEach(() => {
    useOntologyStore.getState().clearOntology();
  });

  it('loads instance values from the server instead of dropping them', async () => {
    const { result } = renderHook(() => useLoadOntology(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.current.allLoaded).toBe(true));
    await waitFor(() =>
      expect(useOntologyStore.getState().instanceValues).toHaveLength(1),
    );

    expect(useOntologyStore.getState().instanceValues[0]).toMatchObject({
      instanceId: 'inst-1',
      propertyId: 'prop-1',
      value: '25',
    });
  });
});
