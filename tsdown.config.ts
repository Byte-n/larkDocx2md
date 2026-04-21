import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/cli.ts', 'src/converter.ts'],
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  dts: true,
})