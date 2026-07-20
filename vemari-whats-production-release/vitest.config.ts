import { defineConfig } from 'vitest/config';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  resolve: {
    alias: {
      '@vemari/contracts': fileURLToPath(
        new URL('./apps/backend/src/shared/contracts/index.ts', import.meta.url),
      ),
      '@vemari/meta': fileURLToPath(
        new URL('./apps/backend/src/shared/whatsapp/index.ts', import.meta.url),
      ),
    },
  },
  test: { include: ['apps/**/*.test.ts', 'apps/**/*.test.tsx', 'tests/**/*.test.ts'] },
});
