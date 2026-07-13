-- PRD-N M5 (Steward 잔여): 발행 스냅샷 버전 태그 + 구획별 변경 요약.
-- 발행(push) 시점에 커밋에 시맨틱 버전 태그와 구획별 변경 요약을 남겨 발행 이력을 구분한다.
-- nullable — 기존 행/발행 파이프라인에 무영향(부가 정보).
ALTER TABLE commits ADD COLUMN IF NOT EXISTS version_tag text;
ALTER TABLE commits ADD COLUMN IF NOT EXISTS change_summary jsonb;
