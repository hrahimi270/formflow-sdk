import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [vue()],
  test: {
    name: 'vue',
    // jsdom (over happy-dom) for component tests: happy-dom has a known Vue
    // fragment-teardown bug (`removeFragment` → `nextSibling` of null) that
    // crashes @testing-library/vue's auto-cleanup of renderless components.
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
