import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Thin adapter: never bundle the engine or the framework.
  external: ['@formflowjs/core', 'vue'],
  // Browser + node safe; the adapter must stay SSR/Nuxt-safe (no top-level
  // window/document access).
  platform: 'neutral',
  target: 'es2021',
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
});
