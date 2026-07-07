import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  /* config options here */
  transpilePackages: ['react-resizable-panels'],
  // PRD-Perf M2-3: barrel import 트리셰이킹 보장 — 초기 청크에서 미사용 심볼 배제.
  // (lucide-react·date-fns 는 Next 기본 최적화 목록에 이미 포함)
  experimental: {
    optimizePackageImports: ['es-toolkit', 'react-use'],
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    remotePatterns: [
      {
        hostname: '**',
      },
    ],
  },
};

export default nextConfig;
