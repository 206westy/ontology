// `@/foo` → <cwd>/src/foo(.ts|.tsx|/index.ts …) 로 해석하는 resolve 훅.
// register-alias.mjs 가 module.register 로 로드한다(별도 스레드에서 동작).
import { pathToFileURL } from 'node:url';
import { resolve as pathResolve } from 'node:path';
import { existsSync } from 'node:fs';

const SRC = pathResolve(process.cwd(), 'src');
const EXTS = ['', '.ts', '.tsx', '.mjs', '.js', '/index.ts', '/index.tsx'];

export async function resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('@/')) {
    const base = pathResolve(SRC, specifier.slice(2));
    for (const ext of EXTS) {
      if (existsSync(base + ext)) {
        return { url: pathToFileURL(base + ext).href, shortCircuit: true };
      }
    }
  }
  return nextResolve(specifier, context);
}
