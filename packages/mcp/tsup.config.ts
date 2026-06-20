import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  dts: true,
  clean: true,
  // CLI entry — published as the `qrawl-mcp` bin (run via npx)
  banner: { js: '#!/usr/bin/env node' },
})
