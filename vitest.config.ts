import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  // esbuild transforms `.tsx` files via the automatic JSX runtime so test
  // files don't need an explicit `import React from "react"` (matches how
  // the production app is built by @vitejs/plugin-react).
  esbuild: {
    jsx: 'automatic',
  },
  test: {
    globals: false,
    environment: 'node',
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    testTimeout: 10000,
    // Component tests opt into jsdom via the `// @vitest-environment jsdom`
    // directive at the top of each `.test.tsx` file (see e.g.
    // tests/upgrades-applied-panel.test.tsx). The default stays node so the
    // existing server/storage tests don't pay the jsdom startup cost.
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared'),
      '@db': path.resolve(__dirname, './server/db.ts'),
    },
  },
});
