-- PRD-PF-H M1: 구획 요약(Community Summaries) — 소비 표면(답변엔진)의 척추.
-- 커밋 시 변경 구획만 재요약(전량 재계산 금지). stale 플래그로 dirty-only 게이팅.
CREATE TABLE public.summaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ontology_id uuid NOT NULL REFERENCES public.ontologies(id) ON DELETE CASCADE,
  partition_id uuid NOT NULL REFERENCES public.partitions(id) ON DELETE CASCADE,
  commit_id uuid,
  summary text NOT NULL DEFAULT '',
  embedding vector(1536),
  stale boolean NOT NULL DEFAULT true,
  critic_health real,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_summary_partition UNIQUE (partition_id)
);
CREATE INDEX idx_summaries_ontology ON public.summaries(ontology_id);

ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
CREATE POLICY summaries_member ON public.summaries FOR ALL TO authenticated
  USING (public.user_has_ontology_access(ontology_id))
  WITH CHECK (public.user_has_ontology_access(ontology_id));
