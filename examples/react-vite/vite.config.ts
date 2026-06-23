import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Minimal Vite config for the React example. The FormFlow packages are consumed
// as workspace dependencies (built `dist/` is resolved via their `exports`), so
// no extra aliasing is required.
export default defineConfig({
  plugins: [react()],
});
