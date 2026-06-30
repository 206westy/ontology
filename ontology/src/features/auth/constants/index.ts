/**
 * 인증 라우트/정책 상수.
 * 미들웨어 게이팅과 server action 리다이렉트가 공유한다.
 */

/** 비밀번호 최소 길이 (UX: 과도한 정책 대신 8자 최소만 강제) */
export const PASSWORD_MIN_LENGTH = 8;

/** 표시 이름 최대 길이 */
export const DISPLAY_NAME_MAX_LENGTH = 40;

/** 인증 폼 페이지 (미인증 상태에서 접근 허용) */
export const AUTH_PAGE_PREFIXES = [
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
] as const;

/** 인증 처리용 라우트 핸들러/에러 페이지 (항상 public) */
export const AUTH_PUBLIC_PREFIX = '/auth';

/** 로그인/회원가입 전용 페이지 — 인증된 사용자는 앱으로 되돌린다 */
export const REDIRECT_IF_AUTHED = ['/login', '/signup'] as const;

/** 로그인 후 기본 도착지 */
export const DEFAULT_AUTHED_REDIRECT = '/';

/** 미인증 시 도착지 */
export const SIGN_IN_PATH = '/login';

/** 이메일 확인 콜백 경로 */
export const EMAIL_CONFIRM_PATH = '/auth/confirm';

/** 비밀번호 재설정 완료 후 새 비번 입력 경로 */
export const RESET_PASSWORD_PATH = '/reset-password';

/** 링크 만료/오류 안내 경로 */
export const AUTH_ERROR_PATH = '/auth/auth-code-error';
