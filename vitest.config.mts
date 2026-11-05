import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { include: ['src/**/*.test.ts'], testTimeout: 20000, hookTimeout: 60000, setupFiles: ['./vitest.setup.mts'] },
});
