declare global {
  var __CLI_VERSION__: string | undefined;
}

export const CLI_VERSION: string = globalThis.__CLI_VERSION__ ?? process.env.npm_package_version ?? 'unknown';
