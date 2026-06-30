import { DEFAULT_AUTHED_REDIRECT } from '../constants';

/**
 * 오픈 리다이렉트 방지: 콜백의 `next` 파라미터는 같은 출처의 상대 경로만 허용한다.
 * - 절대 URL(`https://evil.com`)이나 프로토콜-상대(`//evil.com`)를 거부하고
 *   안전한 기본 경로로 떨어뜨린다.
 */
export function safeNextPath(next: string | null | undefined): string {
  if (!next) return DEFAULT_AUTHED_REDIRECT;
  // 단일 슬래시로 시작하고, `//` 또는 `/\` 형태(프로토콜-상대)가 아니어야 한다.
  if (!next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) {
    return DEFAULT_AUTHED_REDIRECT;
  }
  return next;
}
