// PRD-PF-G: ECharts 트리셰이킹 코어. 필요한 차트/컴포넌트/렌더러만 등록 → 번들 최소화.
// 이 모듈을 import 하는 컴포넌트는 next/dynamic(ssr:false)로 지연 로딩 → 메인 캔버스 번들 영향 0.
import * as echarts from 'echarts/core';
import { LineChart, BarChart } from 'echarts/charts';
import {
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkPointComponent,
  MarkAreaComponent,
  LegendComponent,
  DataZoomComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

echarts.use([
  LineChart,
  BarChart,
  GridComponent,
  TooltipComponent,
  MarkLineComponent,
  MarkPointComponent,
  MarkAreaComponent,
  LegendComponent,
  DataZoomComponent,
  CanvasRenderer,
]);

export { echarts };
