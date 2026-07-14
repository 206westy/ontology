'use client';

import Link from 'next/link';
import { Construction, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Props {
  title: string;
  description: string;
  /** 준비된 기능이 이미 있으면 진입 링크(예: 결정함수는 스튜디오 툴바에 존재). */
  cta?: { label: string; href: string };
}

// PRD-PF-C M5: 미완 단계 자리 예약. 과대약속 금지 — "준비 중"을 명확히 표시.
export default function StagePlaceholder({ title, description, cta }: Props) {
  return (
    <div className="max-w-xl mx-auto w-full py-16 text-center space-y-4">
      <div className="flex justify-center">
        <div className="rounded-full bg-muted p-4">
          <Construction className="w-8 h-8 text-muted-foreground" />
        </div>
      </div>
      <div className="space-y-1.5">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
      </div>
      {cta && (
        <Button asChild variant="outline">
          <Link href={cta.href}>
            {cta.label} <ArrowRight className="w-4 h-4 ml-1.5" />
          </Link>
        </Button>
      )}
    </div>
  );
}
