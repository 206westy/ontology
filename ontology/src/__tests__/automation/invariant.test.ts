import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// PRD-PF-I 최상위 불변식: 자동화는 승인선을 넘지 않는다.
// automation_runs / 트리거 실행은 action_items 를 사람 개입 없이 confirmed 로 만들지 못한다(코드 리뷰 + 정적 계약).
const RUN_ROUTE = join(process.cwd(), 'src/app/api/triggers/[id]/run/route.ts');

describe('자동화 자율확정 금지 계약', () => {
  const src = readFileSync(RUN_ROUTE, 'utf8');

  it('트리거 실행이 만드는 제안은 pending 뿐(confirmed 로 설정하지 않음)', () => {
    expect(src).toMatch(/status:\s*'pending'/);
    // action_items 를 confirmed/dismissed 로 직접 전이시키는 코드가 없어야 한다.
    expect(src).not.toMatch(/status:\s*'confirmed'/);
    expect(src).not.toMatch(/status:\s*'dismissed'/);
  });

  it('제안 생성은 결정함수 호출(위임) 경로에서만', () => {
    expect(src).toMatch(/functions\/\$\{trigger\.targetFunctionId\}\/evaluate/);
  });
});
