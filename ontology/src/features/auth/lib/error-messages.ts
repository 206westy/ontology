/**
 * Supabase Auth 에러 → 한글 사용자 메시지 매핑.
 * - 전문용어(credentials/session/authentication) 배제 (UX 톤)
 * - 로그인 실패는 이메일/비번을 구분 노출하지 않음 (보안)
 */

interface AuthErrorLike {
  code?: string;
  message?: string;
  status?: number;
}

const CODE_MESSAGES: Record<string, string> = {
  invalid_credentials: '이메일 또는 비밀번호가 올바르지 않습니다',
  email_not_confirmed: '이메일 인증을 먼저 완료해주세요',
  user_already_exists: '이미 가입된 이메일입니다',
  email_exists: '이미 가입된 이메일입니다',
  weak_password: '비밀번호가 너무 단순합니다. 더 복잡하게 입력해주세요',
  over_email_send_rate_limit: '요청이 많습니다. 잠시 후 다시 시도해주세요',
  over_request_rate_limit: '요청이 많습니다. 잠시 후 다시 시도해주세요',
  same_password: '이전과 다른 비밀번호를 입력해주세요',
  otp_expired: '링크가 만료되었습니다. 다시 요청해주세요',
};

const DEFAULT_MESSAGE = '잠시 후 다시 시도해주세요';

export function mapAuthError(error: AuthErrorLike | null | undefined): string {
  if (!error) return DEFAULT_MESSAGE;
  if (error.code && CODE_MESSAGES[error.code]) return CODE_MESSAGES[error.code];

  // 일부 응답은 code 없이 message만 온다 — 알려진 문구를 휴리스틱 매핑
  const msg = (error.message ?? '').toLowerCase();
  if (msg.includes('invalid login')) return CODE_MESSAGES.invalid_credentials;
  if (msg.includes('not confirmed')) return CODE_MESSAGES.email_not_confirmed;
  if (msg.includes('already registered')) return CODE_MESSAGES.user_already_exists;
  if (msg.includes('rate limit')) return CODE_MESSAGES.over_request_rate_limit;

  return DEFAULT_MESSAGE;
}
