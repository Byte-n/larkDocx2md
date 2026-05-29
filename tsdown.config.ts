import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: { cli: 'src/cli.ts', converter: 'src/lib/converter.ts' },
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  dts: true,
})