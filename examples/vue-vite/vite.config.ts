import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// Minimal Vite config for the Vue example. `@formflowjs/vue` is consumed as a
// workspace dependency; its built `dist/` is resolved through package `exports`.
export default defineConfig({
  plugins: [vue()],
});
