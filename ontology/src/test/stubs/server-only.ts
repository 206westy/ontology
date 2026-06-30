// vitest 환경에는 Next.js 컴파일러가 없어 `server-only`/`'use server'` 변환이
// 일어나지 않는다. 클라이언트 테스트가 server action 모듈 그래프를 import 만 해도
// 실제 `server-only` 패키지가 throw 하므로, 테스트에서는 이 빈 모듈로 alias 한다.
export {};
