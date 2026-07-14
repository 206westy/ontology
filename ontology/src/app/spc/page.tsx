import SpcWorkbench from '@/features/spc/components/SpcWorkbench';

// PRD-PF-F: SPC/FDC 워크벤치(모듈 토글·판정 함수 저작·판정 실행). 관리도 시각화·근거 카드는 PRD-PF-G(보드)에서.
export default function SpcPage() {
  return (
    <div className="h-screen w-screen overflow-auto bg-background">
      <SpcWorkbench />
    </div>
  );
}
