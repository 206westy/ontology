-- PRD-L M6 (L7): 관계 어휘집 — 사후 정합 전용·자생 성장.
-- 규율: 추출 프롬프트에 재주입 금지(사후 정합에서만 참조). 원본 표현(term) 보존,
-- 정규화 핸들은 덧셈(normalized_term·layer·meaning·similar_to). 애매하면 새 항목이 기본값.
CREATE TABLE relation_glossary (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- 원본 관계 이름(AI가 뽑은 그대로 — 절대 덮어쓰지 않음)
  term text NOT NULL,
  -- 중복 판정용 정규화 키(소문자·트림)
  normalized_term text NOT NULL UNIQUE,
  layer text NOT NULL DEFAULT 'semantic' CHECK (layer IN ('semantic', 'kinetic')),
  -- 뜻풀이(있으면 — 전략 생성기의 참고 지식)
  meaning text NOT NULL DEFAULT '',
  -- 사후 정합: 임베딩 유사 항목 후보 링크(자동 병합 아님 — 후보 제시만)
  similar_to uuid REFERENCES relation_glossary(id) ON DELETE SET NULL,
  -- 같은 관계 이름이 재등장한 횟수(대표어 선정 근거)
  occurrence_count integer NOT NULL DEFAULT 1,
  source_ref text,
  -- 사후 유사도 대조용(생성 실패 시 NULL 허용 — 우아한 강등)
  embedding vector(1536),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_relation_glossary_layer ON relation_glossary(layer);

-- RLS 락다운 정책과 정합(deny-all, 앱은 service-role 경유)
ALTER TABLE relation_glossary ENABLE ROW LEVEL SECURITY;
