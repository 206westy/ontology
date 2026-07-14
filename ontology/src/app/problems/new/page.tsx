import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import ProblemDefineForm from '@/features/problems/components/ProblemDefineForm';

// PRD-PF-C M1: 새 문제 정의 폼(진입 = 빈 캔버스가 아니라 문제정의).
export default function NewProblemPage() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto px-4 pt-6">
        <Link href="/problems" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="w-4 h-4" /> 문제 목록
        </Link>
        <h1 className="text-2xl font-semibold mt-3">새 문제 정의</h1>
      </div>
      <ProblemDefineForm />
    </div>
  );
}
