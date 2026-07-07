// `@/` 경로 별칭을 src/ 로 해석하는 ESM resolve 훅 등록.
// tsconfig paths(@/* → src/*)를 Node 런타임에 재현 — --experimental-strip-types 로
// TS 소스를 그대로 import 하는 CLI 스크립트에서 앱 코드(cypher-builder 등)를 재사용하기 위함.
// 사용: node --experimental-strip-types --import ./scripts/register-alias.mjs <script>
import { register } from 'node:module';

register('./alias-resolve.mjs', import.meta.url);
