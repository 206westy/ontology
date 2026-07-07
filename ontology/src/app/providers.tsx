// In Next.js, this file would be called: app/providers.tsx
'use client';

// Since QueryClientProvider relies on useContext under the hood, we have to put 'use client' on top
import {
  isServer,
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { LazyMotion } from 'motion/react';
import { Toaster } from 'sonner';

// PRD-Perf(LazyMotion): 애니메이션 기능 번들(domAnimation)을 비동기 청크로 분리.
// 컴포넌트는 m.* 을 쓰므로 초기 번들에는 motion 코어(~5KB)만 남는다.
// strict: motion.* 잔존 사용을 개발 중 즉시 드러낸다(전부 m.* 으로 전환됨).
const loadMotionFeatures = () =>
  import('motion/react').then((mod) => mod.domAnimation);

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, we usually want to set some default staleTime
        // above 0 to avoid refetching immediately on the client
        staleTime: 60 * 1000,
        // PRD-Perf M0-2: 데이터 권위는 zustand 스토어 + useApiSync 명시 invalidate.
        // 포커스 복귀마다 전체 온톨로지(8쿼리)를 재요청할 이유가 없다.
        refetchOnWindowFocus: false,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined = undefined;

function getQueryClient() {
  if (isServer) {
    // Server: always make a new query client
    return makeQueryClient();
  } else {
    // Browser: make a new query client if we don't already have one
    // This is very important, so we don't re-make a new client if React
    // suspends during the initial render. This may not be needed if we
    // have a suspense boundary BELOW the creation of the query client
    if (!browserQueryClient) browserQueryClient = makeQueryClient();
    return browserQueryClient;
  }
}

export default function Providers({ children }: { children: React.ReactNode }) {
  // NOTE: Avoid useState when initializing the query client if you don't
  //       have a suspense boundary between this and the code that may
  //       suspend because React will throw away the client on the initial
  //       render if it suspends and there is no boundary
  const queryClient = getQueryClient();

  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <QueryClientProvider client={queryClient}>
        <LazyMotion features={loadMotionFeatures} strict>
          {children}
        </LazyMotion>
        <Toaster position="bottom-right" richColors closeButton />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
