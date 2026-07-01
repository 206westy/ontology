// M1: LLM 모델 ID 를 한 곳에서 env 로 관리한다(미설정 시 기본값 폴백).
// 모델 교체/장애 시 코드 수정·재배포 없이 환경변수만 바꾸면 된다.
//
// M2: 재시도 횟수도 env 화한다. AI SDK 의 maxRetries 는 지수 백오프를 내장하므로
// 값만 올리면 네트워크 블립에 탄력적으로 대응한다(상한을 둬 폭주 방지).

export const LLM_MODELS = {
  primary: process.env.LLM_MODEL_PRIMARY ?? 'gpt-5.4',
  mini: process.env.LLM_MODEL_MINI ?? 'gpt-5.4-mini',
} as const;

const DEFAULT_MAX_RETRIES = 3;
const MAX_RETRIES_CAP = 5;

function resolveMaxRetries(): number {
  const raw = process.env.LLM_MAX_RETRIES;
  if (raw == null) return DEFAULT_MAX_RETRIES;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return DEFAULT_MAX_RETRIES;
  return Math.min(Math.floor(n), MAX_RETRIES_CAP);
}

export const LLM_MAX_RETRIES = resolveMaxRetries();
