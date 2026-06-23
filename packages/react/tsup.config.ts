import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { defineConfig } from 'tsup';

const USE_CLIENT = '"use client";';

/**
 * Ensure every emitted JS bundle begins with a single `"use client"` directive.
 *
 * tsup applies the esbuild `banner` during the esbuild pass, but the subsequent
 * Rollup tree-shake/render step strips leading and module-level string
 * directives from the output — so the banner alone does not survive. This
 * post-build step re-prepends one canonical directive (and removes any stray
 * inner ones the bundler may have left) so the package is a proper React Client
 * Component for the Next.js App Router and other RSC consumers.
 */
async function prependUseClient(outDir: string, files: string[]): Promise<void> {
  await Promise.all(
    files.map(async (file) => {
      const path = join(outDir, file);
      let code: string;
      try {
        code = await readFile(path, 'utf8');
      } catch {
        return; // file for a format we didn't emit
      }
      // Drop any existing module-level "use client" directives, then prepend one.
      const stripped = code.replace(/^\s*(['"])use client\1;?\s*/gm, '');
      await writeFile(path, `${USE_CLIENT}\n${stripped}`, 'utf8');
    })
  );
}

export default defineConfig({
  entry: ['src/index.tsx'],
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // Thin adapter: never bundle the engine or the framework.
  external: ['@formflowjs/core', 'react', 'react-dom'],
  // Browser + node safe; the adapter must stay RSC/SSR-safe (no top-level
  // window/document access).
  platform: 'neutral',
  target: 'es2021',
  // Mark the whole bundle as a Client Component for the Next.js App Router and
  // other React Server Component consumers. (Re-asserted in onSuccess because
  // tree-shaking strips leading directives from the rendered output.)
  esbuildOptions(options) {
    options.banner = { js: USE_CLIENT };
  },
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.js' };
  },
  async onSuccess() {
    await prependUseClient('dist', ['index.js', 'index.cjs']);
  },
});
