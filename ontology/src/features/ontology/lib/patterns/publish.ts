import { maskIdentifiers, hasMaskableIdentifiers } from '../identifier-mask';
import { buildPublishLicenseWarning, hasUnverifiedLicense } from './license';
import { buildSeedPreview } from './seed';
import type {
  Pattern,
  PatternRole,
  PatternRelationType,
  PatternTraversalTemplate,
} from './types';

// PRD-BM-D01 (M2-1): 발행 전 프리뷰 로직(순수).
// 기구현 거버넌스 자산 재사용: 식별자 마스킹(identifier-mask) + 라이선스 경고(license).
// + 발행 시 산정하는 헬스 점수(computePatternHealth) — 큐레이션 신뢰 신호.

// 헬스 가중치(합 100): 역할 다양성 + 구조 연결성 + CQ 커버리지 + 라이선스 확인.
const W_ROLES = 25;
const W_CONNECTED = 25;
const W_CQ = 30;
const W_LICENSE = 20;

/** 패턴 헬스 0~100. 발행 시 저장돼 카탈로그 큐레이션(임계·정렬)에 쓰인다. */
export function computePatternHealth(pattern: Pattern): number {
  const roleCount = new Set(pattern.roles.map((r) => r.name)).size;
  const preview = buildSeedPreview(pattern);

  const rolesScore = Math.min(roleCount / 3, 1) * W_ROLES;
  const connectedScore = roleCount >= 2 && preview.relationCount >= 1 ? W_CONNECTED : 0;
  const cqScore = Math.min(pattern.competencyQuestions.length / 3, 1) * W_CQ;
  const licenseScore = hasUnverifiedLicense(pattern) ? 0 : W_LICENSE;

  return Math.round(rolesScore + connectedScore + cqScore + licenseScore);
}

export interface PublishPreview {
  maskedRoles: PatternRole[];
  maskedRelationTypes: PatternRelationType[];
  maskedCompetencyQuestions: string[];
  maskedTraversalTemplates: PatternTraversalTemplate[];
  licenseWarning: string | null;
  hasMaskedIdentifiers: boolean;
  health: number;
}

/** 발행 프리뷰: 민감 식별자 마스킹된 번들 + 라이선스 경고 + 헬스. HITL 컨펌 카드가 이걸 보여준다. */
export function buildPublishPreview(pattern: Pattern): PublishPreview {
  // 역할 이름과 관계의 role 참조를 같은 함수로 마스킹 → 마스킹 후에도 정합 유지.
  const maskedRoles = pattern.roles.map((r) => ({
    ...r,
    name: maskIdentifiers(r.name),
    description: maskIdentifiers(r.description),
  }));
  const maskedRelationTypes = pattern.relationTypes.map((rt) => ({
    ...rt,
    name: maskIdentifiers(rt.name),
    sourceRole: maskIdentifiers(rt.sourceRole),
    targetRole: maskIdentifiers(rt.targetRole),
  }));
  const maskedCompetencyQuestions = pattern.competencyQuestions.map((cq) => maskIdentifiers(cq));
  // traversalTemplates 의 cq/path 도 원본 식별자를 담을 수 있어 반드시 함께 마스킹한다.
  const maskedTraversalTemplates = pattern.traversalTemplates.map((t) => ({
    ...t,
    cq: maskIdentifiers(t.cq),
    path: maskIdentifiers(t.path),
  }));

  const hasMaskedIdentifiers =
    pattern.roles.some(
      (r) => hasMaskableIdentifiers(r.name) || hasMaskableIdentifiers(r.description),
    ) ||
    pattern.relationTypes.some(
      (rt) =>
        hasMaskableIdentifiers(rt.name) ||
        hasMaskableIdentifiers(rt.sourceRole) ||
        hasMaskableIdentifiers(rt.targetRole),
    ) ||
    pattern.competencyQuestions.some((cq) => hasMaskableIdentifiers(cq)) ||
    pattern.traversalTemplates.some(
      (t) => hasMaskableIdentifiers(t.cq) || hasMaskableIdentifiers(t.path),
    );

  const licenseWarning = buildPublishLicenseWarning([
    { name: pattern.nameKo || pattern.name, license: pattern.license },
  ]);

  return {
    maskedRoles,
    maskedRelationTypes,
    maskedCompetencyQuestions,
    maskedTraversalTemplates,
    licenseWarning,
    hasMaskedIdentifiers,
    health: computePatternHealth(pattern),
  };
}
