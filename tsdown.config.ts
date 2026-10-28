import { readFileSync } from 'node:fs'
import { defineConfig } from 'tsdown'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as { version: string }

export default defineConfig({
  entry: { cli: 'src/cli.ts', converter: 'src/lib/converter.ts' },
  format: ['esm'],
  outDir: 'dist',
  clean: true,
  dts: true,
  plugins: [
    {
      name: 'inject-cli-version',
      transform: {
        filter: { id: /[\\/]src[\\/]cli[\\/]version\.ts$/ },
        handler (code) {
          return code.replace('globalThis.__CLI_VERSION__', JSON.stringify(version));
        },
      },
    },
  ],
})
