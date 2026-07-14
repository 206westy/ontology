-- PRD-PF-A M2: 스코프 소급(가산 + 백필). classes.partition_id 백필 선례와 동일 3단계.
-- 이 단계는 컬럼을 NULL 허용 + DEFAULT(기본 온톨로지)로 추가하고 기존 행을 백필한다.
-- NOT NULL 강화와 전역 UNIQUE 재정렬은 M4(코드 배포 후)에서 수행 → 무중단.
--
-- 코어 14테이블: ontology_id (단일 전역 그래프이므로 전량 기본 온톨로지 2222.. 로 귀속).
-- 특수 3테이블(patterns/term_glossary/relation_glossary): 재사용 공유 자산이라 ontology 1:1 이 아님
--   → workspace_id(nullable, NULL=공용 라이브러리)만 부여. 온톨로지 스코프 강제하지 않음(§열린결정).

-- ── 코어 14: ontology_id 가산(DEFAULT=기본 온톨로지) ──
ALTER TABLE classes            ADD COLUMN IF NOT EXISTS ontology_id uuid DEFAULT '22222222-2222-2222-2222-222222222222' REFERENCES ontologies(id) ON DELETE CASCADE;
ALTER TABLE properties         ADD COLUMN IF NOT EXISTS ontology_id uuid DEFAULT '22222222-2222-2222-2222-222222222222' REFERENCES ontologies(id) ON DELETE CASCADE;
ALTER TABLE instances          ADD COLUMN IF NOT EXISTS ontology_id uuid DEFAULT '22222222-2222-2222-2222-222222222222' REFERENCES ontologies(id) ON DELETE CASCADE;
ALTER TABLE instance_values    ADD COLUMN IF NOT EXISTS ontology_id uuid DEFAULT '22222222-2222-2222-2222-222222222222' REFERENCES ontologies(id) ON DELETE CASCADE;
ALTER TABLE relation_types     ADD COLUMN IF NOT EXISTS ontology_id uuid DEFAULT '22222222-2222-2222-2222-222222222222' REFERENCES ontologies(id) ON DELETE CASCADE;
ALTER TABLE edges              ADD COLUMN IF NOT EXISTS ontology_id uuid DEFAULT '22222222-2222-2222-2222-222222222222' REFERENCES ontologies(id) ON DELETE CASCADE;
ALTER TABLE constraints        ADD COLUMN IF NOT EXISTS ontology_id uuid DEFAULT '22222222-2222-2222-2222-222222222222' REFERENCES ontologies(id) ON DELETE CASCADE;
ALTER TABLE validation_results ADD COLUMN IF NOT EXISTS ontology_id uuid DEFAULT '22222222-2222-2222-2222-222222222222' REFERENCES ontologies(id) ON DELETE CASCADE;
ALTER TABLE partitions         ADD COLUMN IF NOT EXISTS ontology_id uuid DEFAULT '22222222-2222-2222-2222-222222222222' REFERENCES ontologies(id) ON DELETE CASCADE;
ALTER TABLE attributions       ADD COLUMN IF NOT EXISTS ontology_id uuid DEFAULT '22222222-2222-2222-2222-222222222222' REFERENCES ontologies(id) ON DELETE CASCADE;
ALTER TABLE commits            ADD COLUMN IF NOT EXISTS ontology_id uuid DEFAULT '22222222-2222-2222-2222-222222222222' REFERENCES ontologies(id) ON DELETE CASCADE;
ALTER TABLE commit_details     ADD COLUMN IF NOT EXISTS ontology_id uuid DEFAULT '22222222-2222-2222-2222-222222222222' REFERENCES ontologies(id) ON DELETE CASCADE;
ALTER TABLE branches           ADD COLUMN IF NOT EXISTS ontology_id uuid DEFAULT '22222222-2222-2222-2222-222222222222' REFERENCES ontologies(id) ON DELETE CASCADE;
ALTER TABLE merge_requests     ADD COLUMN IF NOT EXISTS ontology_id uuid DEFAULT '22222222-2222-2222-2222-222222222222' REFERENCES ontologies(id) ON DELETE CASCADE;

-- ── 백필(모든 기존 행 → 기본 온톨로지). ADD..DEFAULT 로 이미 채워지나 재실행/기존NULL 안전 보강 ──
UPDATE classes            SET ontology_id = '22222222-2222-2222-2222-222222222222' WHERE ontology_id IS NULL;
UPDATE properties         SET ontology_id = '22222222-2222-2222-2222-222222222222' WHERE ontology_id IS NULL;
UPDATE instances          SET ontology_id = '22222222-2222-2222-2222-222222222222' WHERE ontology_id IS NULL;
UPDATE instance_values    SET ontology_id = '22222222-2222-2222-2222-222222222222' WHERE ontology_id IS NULL;
UPDATE relation_types     SET ontology_id = '22222222-2222-2222-2222-222222222222' WHERE ontology_id IS NULL;
UPDATE edges              SET ontology_id = '22222222-2222-2222-2222-222222222222' WHERE ontology_id IS NULL;
UPDATE constraints        SET ontology_id = '22222222-2222-2222-2222-222222222222' WHERE ontology_id IS NULL;
UPDATE validation_results SET ontology_id = '22222222-2222-2222-2222-222222222222' WHERE ontology_id IS NULL;
UPDATE partitions         SET ontology_id = '22222222-2222-2222-2222-222222222222' WHERE ontology_id IS NULL;
UPDATE attributions       SET ontology_id = '22222222-2222-2222-2222-222222222222' WHERE ontology_id IS NULL;
UPDATE commits            SET ontology_id = '22222222-2222-2222-2222-222222222222' WHERE ontology_id IS NULL;
UPDATE commit_details     SET ontology_id = '22222222-2222-2222-2222-222222222222' WHERE ontology_id IS NULL;
UPDATE branches           SET ontology_id = '22222222-2222-2222-2222-222222222222' WHERE ontology_id IS NULL;
UPDATE merge_requests     SET ontology_id = '22222222-2222-2222-2222-222222222222' WHERE ontology_id IS NULL;

-- ── 인덱스(스코프 필터 hot path) ──
CREATE INDEX IF NOT EXISTS idx_classes_ontology            ON classes            (ontology_id);
CREATE INDEX IF NOT EXISTS idx_properties_ontology         ON properties         (ontology_id);
CREATE INDEX IF NOT EXISTS idx_instances_ontology          ON instances          (ontology_id);
CREATE INDEX IF NOT EXISTS idx_instance_values_ontology    ON instance_values    (ontology_id);
CREATE INDEX IF NOT EXISTS idx_relation_types_ontology     ON relation_types     (ontology_id);
CREATE INDEX IF NOT EXISTS idx_edges_ontology              ON edges              (ontology_id);
CREATE INDEX IF NOT EXISTS idx_constraints_ontology        ON constraints        (ontology_id);
CREATE INDEX IF NOT EXISTS idx_validation_results_ontology ON validation_results (ontology_id);
CREATE INDEX IF NOT EXISTS idx_partitions_ontology         ON partitions         (ontology_id);
CREATE INDEX IF NOT EXISTS idx_attributions_ontology       ON attributions       (ontology_id);
CREATE INDEX IF NOT EXISTS idx_commits_ontology            ON commits            (ontology_id);
CREATE INDEX IF NOT EXISTS idx_commit_details_ontology     ON commit_details     (ontology_id);
CREATE INDEX IF NOT EXISTS idx_branches_ontology           ON branches           (ontology_id);
CREATE INDEX IF NOT EXISTS idx_merge_requests_ontology     ON merge_requests     (ontology_id);

-- ── 특수 3: workspace_id(nullable, NULL=공용 라이브러리). 온톨로지 1:1 강제 안 함 ──
ALTER TABLE patterns          ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE term_glossary     ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
ALTER TABLE relation_glossary ADD COLUMN IF NOT EXISTS workspace_id uuid REFERENCES workspaces(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_patterns_workspace          ON patterns          (workspace_id);
CREATE INDEX IF NOT EXISTS idx_term_glossary_workspace     ON term_glossary     (workspace_id);
CREATE INDEX IF NOT EXISTS idx_relation_glossary_workspace ON relation_glossary (workspace_id);
