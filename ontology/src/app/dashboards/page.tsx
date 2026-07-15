import { redirect } from 'next/navigation';

// PRD-PF 시퀀스 전용화: 대시보드는 문제 시퀀스의 보드 스테이지(/problems/[id]/board)로만 동작.
export default function DashboardsStandaloneRedirect() {
  redirect('/platform');
}
