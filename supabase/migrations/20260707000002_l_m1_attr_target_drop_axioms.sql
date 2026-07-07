-- PRD-L M1 후속: attributions.target_table 에서 'axioms' 제거(테이블 삭제 반영).
DELETE FROM attributions WHERE target_table = 'axioms';

ALTER TABLE attributions DROP CONSTRAINT IF EXISTS chk_attr_target_table;

ALTER TABLE attributions ADD CONSTRAINT chk_attr_target_table CHECK (
  target_table IN ('classes', 'instances', 'properties', 'edges', 'relation_types', 'constraints')
);
