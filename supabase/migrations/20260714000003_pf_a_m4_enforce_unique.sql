-- PRD-PF-A M4: 제약 강화 + 전역 UNIQUE 재정렬 + 계보 FK + 드리프트 트리거.
-- 전제: M2 백필 완료 + NULL 0건 검증. DEFAULT('22222222..')는 유지 —
-- 아직 소급 안 된 라우트가 기본 온톨로지로 안전 폴백(무중단). 격리는 앱계층 가드가 강제.

-- (1) 14 코어: ontology_id NOT NULL 강화
ALTER TABLE classes            ALTER COLUMN ontology_id SET NOT NULL;
ALTER TABLE properties         ALTER COLUMN ontology_id SET NOT NULL;
ALTER TABLE instances          ALTER COLUMN ontology_id SET NOT NULL;
ALTER TABLE instance_values    ALTER COLUMN ontology_id SET NOT NULL;
ALTER TABLE relation_types     ALTER COLUMN ontology_id SET NOT NULL;
ALTER TABLE edges              ALTER COLUMN ontology_id SET NOT NULL;
ALTER TABLE constraints        ALTER COLUMN ontology_id SET NOT NULL;
ALTER TABLE validation_results ALTER COLUMN ontology_id SET NOT NULL;
ALTER TABLE partitions         ALTER COLUMN ontology_id SET NOT NULL;
ALTER TABLE attributions       ALTER COLUMN ontology_id SET NOT NULL;
ALTER TABLE commits            ALTER COLUMN ontology_id SET NOT NULL;
ALTER TABLE commit_details     ALTER COLUMN ontology_id SET NOT NULL;
ALTER TABLE branches           ALTER COLUMN ontology_id SET NOT NULL;
ALTER TABLE merge_requests     ALTER COLUMN ontology_id SET NOT NULL;

-- (2) 전역 UNIQUE(name) → (ontology_id, name): 서로 다른 온톨로지가 같은 이름('main' 등) 허용
ALTER TABLE partitions     DROP CONSTRAINT uq_partition_name;
ALTER TABLE partitions     ADD CONSTRAINT uq_partition_name_per_ontology UNIQUE (ontology_id, name);
ALTER TABLE branches       DROP CONSTRAINT uq_branch_name;
ALTER TABLE branches       ADD CONSTRAINT uq_branch_name_per_ontology UNIQUE (ontology_id, name);
ALTER TABLE relation_types DROP CONSTRAINT relation_types_name_key;
ALTER TABLE relation_types ADD CONSTRAINT uq_relation_type_name_per_ontology UNIQUE (ontology_id, name);

-- (3) ontologies.default_branch_id FK 배선(순환 회피 위해 M1 에서 컬럼만, 여기서 FK)
ALTER TABLE ontologies
  ADD CONSTRAINT fk_ontologies_default_branch
  FOREIGN KEY (default_branch_id) REFERENCES branches(id) ON DELETE SET NULL;

-- (4) 드리프트 방지 트리거(R1): class 의 ontology_id 는 소속 구획의 ontology_id 와 일치해야 함.
--    기본 온톨로지 경로(구획 00..001=기본 온톨로지)는 항상 일치 → 스튜디오 무영향.
CREATE OR REPLACE FUNCTION check_class_ontology_partition_match() RETURNS trigger AS $$
DECLARE part_onto uuid;
BEGIN
  SELECT ontology_id INTO part_onto FROM partitions WHERE id = NEW.partition_id;
  IF part_onto IS NOT NULL AND part_onto <> NEW.ontology_id THEN
    RAISE EXCEPTION 'classes.ontology_id(%) must match its partition''s ontology_id(%)',
      NEW.ontology_id, part_onto;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_class_ontology_partition_match ON classes;
CREATE TRIGGER trg_class_ontology_partition_match
  BEFORE INSERT OR UPDATE ON classes
  FOR EACH ROW EXECUTE FUNCTION check_class_ontology_partition_match();
