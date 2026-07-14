// PRD-PF-E: 도메인 템플릿 라이브러리(결정론 코어). 충분성 진단·함수 추천이 모두 여기 의존한다.
// 1차 범위: SPC / FDC / 정비 / 출하판정(공정 우선). 커버 못하는 유형은 추천 대신 '수동 안내'.

export type ProblemType = 'spc' | 'fdc' | 'shipment' | 'maintenance' | 'unknown';

export interface RequiredColumn {
  role: string; // 의미역(예: 측정값)
  synonyms: string[]; // 컬럼명 매칭 키워드(한/영)
  why: string; // 왜 필요한가
  howToGet: string; // 어디서 얻나
}

export interface FunctionTemplate {
  id: string;
  name: string;
  description: string;
  outputKind: 'pass_fail' | 'score' | 'recommend';
  /** 자연어 규칙 시드(function-draft 로 AST 초안화). */
  ruleSeed: string;
}

export interface DomainTemplate {
  type: ProblemType;
  label: string;
  keywords: string[]; // 문제 서술 → 유형 분류(결정론)
  requiredColumns: RequiredColumn[];
  functionTemplates: FunctionTemplate[];
}

export const DOMAIN_TEMPLATES: DomainTemplate[] = [
  {
    type: 'spc',
    label: 'SPC 이상탐지(통계적 공정관리)',
    keywords: ['spc', '관리도', '공정관리', '이상탐지', '이상 탐지', '관리한계', '규격', '불량률', '산포'],
    requiredColumns: [
      { role: '측정값', synonyms: ['measure', 'value', 'measurement', '측정', '값', 'cd', 'thickness', '두께'], why: '관리도의 관측치', howToGet: '설비 계측 로그' },
      { role: '측정시각', synonyms: ['time', 'timestamp', 'date', '시각', '시간', '일시'], why: '시계열 관리도 축', howToGet: '설비 로그의 timestamp 컬럼' },
      { role: '설비ID', synonyms: ['equipment', 'eqp', 'tool', 'machine', '설비', '장비'], why: '설비별 분리 관리', howToGet: '설비 마스터/로그' },
      { role: '규격상한', synonyms: ['usl', 'upper', '상한', 'max spec'], why: '규격 이탈 판정', howToGet: '품질기준서(스펙)' },
      { role: '규격하한', synonyms: ['lsl', 'lower', '하한', 'min spec'], why: '규격 이탈 판정', howToGet: '품질기준서(스펙)' },
    ],
    functionTemplates: [
      { id: 'spc_spec_limit', name: '규격 이탈 판정', description: '측정값이 규격상·하한을 벗어나면 불량', outputKind: 'pass_fail', ruleSeed: '측정값이 규격상한보다 크거나 규격하한보다 작으면 불량' },
      { id: 'spc_3sigma', name: '3σ 관리한계', description: '평균 ± 3σ 이탈 시 이상(Western Electric 룰 계열)', outputKind: 'pass_fail', ruleSeed: '측정값이 평균 + 3*표준편차보다 크거나 평균 - 3*표준편차보다 작으면 이상' },
    ],
  },
  {
    type: 'fdc',
    label: 'FDC 설비 파라미터 이탈 감시',
    keywords: ['fdc', '설비 파라미터', '파라미터 이탈', '고장', 'fault', '설비 감시', '트레이스'],
    requiredColumns: [
      { role: '파라미터값', synonyms: ['param', 'parameter', 'sensor', '센서', '파라미터', 'value'], why: '감시 대상 파라미터', howToGet: '설비 센서 트레이스' },
      { role: '측정시각', synonyms: ['time', 'timestamp', '시각', '시간'], why: '트레이스 시계열', howToGet: '설비 트레이스 로그' },
      { role: '설비ID', synonyms: ['equipment', 'eqp', 'tool', '설비', '장비'], why: '설비 단위 감시', howToGet: '설비 마스터' },
      { role: '기준상한', synonyms: ['upper', 'ucl', '상한', 'limit'], why: '이탈 기준', howToGet: '설비 파라미터 기준서' },
    ],
    functionTemplates: [
      { id: 'fdc_deviation', name: '파라미터 이탈 감시', description: '파라미터값이 기준상한을 초과하면 경보', outputKind: 'pass_fail', ruleSeed: '파라미터값이 기준상한보다 크면 경보' },
    ],
  },
  {
    type: 'shipment',
    label: '출하 판정',
    keywords: ['출하', '출하판정', '합격', '판정', '검사', '불합격', 'shipment', 'disposition'],
    requiredColumns: [
      { role: '검사값', synonyms: ['value', 'result', '검사', '측정', '값'], why: '판정 기준값', howToGet: '검사 결과' },
      { role: '기준값', synonyms: ['spec', 'criteria', 'threshold', '기준', '규격'], why: '합격 임계', howToGet: '품질기준서' },
      { role: '제품ID', synonyms: ['product', 'lot', 'wafer', '제품', '로트', '웨이퍼'], why: '판정 대상 식별', howToGet: '생산 이력' },
    ],
    functionTemplates: [
      { id: 'ship_threshold', name: '임계 판정', description: '검사값이 기준값 이하면 통과', outputKind: 'pass_fail', ruleSeed: '검사값이 기준값보다 작거나 같으면 통과, 아니면 불통과' },
    ],
  },
  {
    type: 'maintenance',
    label: '정비 의사결정',
    keywords: ['정비', '예방정비', '보전', '고장', '수명', 'maintenance', 'pm', '교체'],
    requiredColumns: [
      { role: '가동시간', synonyms: ['runtime', 'hours', '가동', '누적', '시간'], why: '수명 판단', howToGet: '설비 가동 로그' },
      { role: '정비주기', synonyms: ['interval', 'cycle', '주기', 'pm'], why: '정비 기준', howToGet: '정비 표준' },
      { role: '설비ID', synonyms: ['equipment', 'eqp', '설비', '장비'], why: '설비 단위', howToGet: '설비 마스터' },
    ],
    functionTemplates: [
      { id: 'pm_due', name: '정비 도래 판정', description: '가동시간이 정비주기를 초과하면 정비 필요', outputKind: 'pass_fail', ruleSeed: '가동시간이 정비주기보다 크거나 같으면 정비 필요' },
    ],
  },
];

/** 문제 서술(제목+목표+결정질문)로 유형 분류(결정론 키워드). 미매칭 시 unknown. */
export function classifyProblemType(text: string): ProblemType {
  const lower = text.toLowerCase();
  let best: { type: ProblemType; hits: number } = { type: 'unknown', hits: 0 };
  for (const t of DOMAIN_TEMPLATES) {
    const hits = t.keywords.filter((k) => lower.includes(k.toLowerCase())).length;
    if (hits > best.hits) best = { type: t.type, hits };
  }
  return best.type;
}

export function getTemplate(type: ProblemType): DomainTemplate | undefined {
  return DOMAIN_TEMPLATES.find((t) => t.type === type);
}
