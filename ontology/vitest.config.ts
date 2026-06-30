import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './vitest.setup.ts',
    exclude: ['e2e/**', 'node_modules/**'],
    env: {
      // 브라우저 Supabase 클라이언트 생성이 throw 하지 않도록 더미 값 주입.
      NEXT_PUBLIC_SUPABASE_URL: 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: 'test-anon-key',
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      // server action 모듈 그래프가 끌고 오는 server-only 를 테스트에서 무력화.
      'server-only': path.resolve(__dirname, './src/test/stubs/server-only.ts'),
    },
  },
})
