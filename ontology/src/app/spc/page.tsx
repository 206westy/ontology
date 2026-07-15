import { redirect } from 'next/navigation';

// PRD-PF 시퀀스 전용화: SPC/FDC 는 개별 기능이 아니라 문제 시퀀스의 스테이지다.
// 단독 진입은 진입점(/platform)으로 보낸다 → 문제해결 플랫폼에서 /problems/[id]/spc 로 동작.
export default function SpcStandaloneRedirect() {
  redirect('/platform');
}
