import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Browser + node safe. The core never imports a framework and must stay
  // RSC/SSR-safe (no top-level window/document access).
  platform: 'neutral',
  target: 'es2021',
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});
