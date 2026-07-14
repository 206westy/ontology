'use client';

import { MarketplaceShell } from '@/features/marketplace/components/MarketplaceShell';

// PRD-BM-D01 (M1): 패턴 마켓플레이스 전용 페이지. 루트 layout 의 Providers(react-query 등) 상속.
export default function MarketplacePage() {
  return <MarketplaceShell />;
}
