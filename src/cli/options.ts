import type { AgentMode, ImageMode, SvgBackground, WbFormat, WbImageMode } from '../lib/types.js';
import type { GetTitlesFormat } from '../lib/get-titles.js';

export interface DownloadRawOptions {
  url?: string;
  appId?: string;
  appSecret?: string;
  output?: string;
  agent?: boolean | string;
  imageMode?: string;
  wbImageMode?: string;
  wbBg?: SvgBackground;
  wbFormat?: string;
  filterTitle?: string;
  filterTitleBlockId?: string;
  maxOutputLines?: string;
}

export interface GetTitlesRawOptions {
  url?: string;
  appId?: string;
  appSecret?: string;
  output?: string;
  maxLevel?: string;
  format?: string;
  agent?: boolean | string;
}

export interface ResolvedDownloadOptions {
  appId?: string;
  appSecret?: string;
  output: string;
  agent: AgentMode | false;
  imageMode: ImageMode;
  wbImageMode: WbImageMode;
  wbBg: SvgBackground;
  wbFormat: WbFormat;
  filterTitle?: string;
  filterTitleBlockId?: string;
  maxOutputLines?: number;
}

export interface ResolvedGetTitlesOptions {
  appId?: string;
  appSecret?: string;
  output: string;
  agent: AgentMode | false;
  maxLevel: number;
  format: GetTitlesFormat;
}

export interface UrlResolution {
  url?: string;
  warning?: string;
  error?: string;
}

type Env = NodeJS.ProcessEnv;

const DEFAULT_OUTPUT = './larkDocx2mdOutput';

export function resolveCommandUrl (positionalUrl: string | undefined, optionUrl: string | undefined): UrlResolution {
  const url = optionUrl ?? positionalUrl;
  if (!url) {
    return {
      error: 'Missing document URL: pass --url <url>. The positional URL argument is deprecated and will be removed in the next version.',
    };
  }
  if (positionalUrl) {
    return {
      url,
      warning: 'Warning: passing the URL as a positional argument is deprecated and will be removed in the next version. Use --url <url> instead.\n',
    };
  }
  return { url };
}

export function resolveAgentMode (
  raw: boolean | string | undefined,
  envAgent: string | undefined,
): { value: AgentMode | false; error?: string } {
  if (raw === undefined) {
    if (envAgent === 'stdout' || envAgent === 'local') return { value: envAgent };
    if (envAgent !== undefined && envAgent !== '') {
      return { value: false, error: `Invalid LARK_DOCX2MD_AGENT="${envAgent}", must be "stdout" or "local"` };
    }
    return { value: false };
  }

  if (raw === true) return { value: 'stdout' };
  if (raw === 'stdout' || raw === 'local') return { value: raw };
  return { value: false, error: `Invalid --agent value "${raw}", must be "stdout" or "local"` };
}

export function missingCredentialsMessage (agentEnabled: boolean): string {
  if (agentEnabled) {
    return 'Missing credentials: pass --app-id/--app-secret or configure credentials in the environment.';
  }
  return 'Missing credentials: pass --app-id/--app-secret or set LARK_DOCX2MD_APP_ID/LARK_DOCX2MD_APP_SECRET';
}

export function resolveDownloadOptions (
  raw: DownloadRawOptions,
  env: Env = process.env,
): { value?: ResolvedDownloadOptions; error?: string } {
  const agentResolved = resolveAgentMode(raw.agent, env.LARK_DOCX2MD_AGENT);
  if (agentResolved.error) return { error: agentResolved.error };

  const agent = agentResolved.value;
  const agentLocal = agent === 'local';
  const agentStdout = agent === 'stdout';
  const agentEnabled = agentLocal || agentStdout;

  let imageMode = raw.imageMode ?? env.LARK_DOCX2MD_IMAGE_MODE ?? 'local';
  let wbFormat = raw.wbFormat ?? env.LARK_DOCX2MD_WB_FORMAT;
  const wbBg = raw.wbBg ?? env.LARK_DOCX2MD_WB_BG ?? 'none';
  let wbImageMode = raw.wbImageMode ?? env.LARK_DOCX2MD_WB_IMAGE_MODE ?? 'local';

  if (!wbFormat) {
    if (agentLocal) wbFormat = 'inline-svg';
    else if (agentStdout) wbFormat = 'yaml';
    else wbFormat = 'svg';
  }

  if (agentEnabled) {
    if (agentLocal) {
      imageMode = 'local';
      wbImageMode = 'local';
    } else {
      imageMode = 'online';
      wbImageMode = 'online';
    }
    if (!isAgentWbFormat(wbFormat)) {
      return { error: 'Agent mode only supports "inline-svg" or "yaml" for --wb-format' };
    }
  } else if (wbFormat === 'yaml') {
    wbImageMode = 'online';
  }

  if (!isImageMode(imageMode)) {
    return { error: `Invalid --image-mode "${imageMode}", must be "local" or "online"` };
  }
  if (!isWbFormat(wbFormat)) {
    return { error: `Invalid --wb-format "${wbFormat}", must be "base64", "inline-svg", "svg", or "yaml"` };
  }
  if (!isWbImageMode(wbImageMode)) {
    return { error: `Invalid --wb-image-mode "${wbImageMode}", must be "online", "base64", or "local"` };
  }
  if (raw.filterTitle && raw.filterTitleBlockId) {
    return { error: '--filter-title and --filter-title-block-id are mutually exclusive; choose one' };
  }

  const rawMaxOutputLines = raw.maxOutputLines ?? env.LARK_DOCX2MD_MAX_OUTPUT_LINES;
  const maxOutputLines = rawMaxOutputLines === undefined
    ? undefined
    : parsePositiveInteger(rawMaxOutputLines);
  if (maxOutputLines === null) {
    return {
      error: `Invalid --max-output-lines / LARK_DOCX2MD_MAX_OUTPUT_LINES "${rawMaxOutputLines}", must be a positive integer`,
    };
  }

  return {
    value: {
      appId: raw.appId ?? env.LARK_DOCX2MD_APP_ID,
      appSecret: raw.appSecret ?? env.LARK_DOCX2MD_APP_SECRET,
      output: raw.output ?? env.LARK_DOCX2MD_OUTPUT ?? DEFAULT_OUTPUT,
      agent,
      imageMode,
      wbImageMode,
      wbBg,
      wbFormat,
      filterTitle: raw.filterTitle?.trim(),
      filterTitleBlockId: raw.filterTitleBlockId?.trim(),
      maxOutputLines,
    },
  };
}

export function resolveGetTitlesOptions (
  raw: GetTitlesRawOptions,
  env: Env = process.env,
): { value?: ResolvedGetTitlesOptions; error?: string } {
  const agentResolved = resolveAgentMode(raw.agent, env.LARK_DOCX2MD_AGENT);
  if (agentResolved.error) return { error: agentResolved.error };

  const maxLevel = parsePositiveInteger(raw.maxLevel ?? '9');
  if (maxLevel === null || maxLevel > 9) {
    return { error: `Invalid --max-level "${raw.maxLevel}", must be an integer in [1, 9]` };
  }

  const format = raw.format ?? 'text';
  if (format !== 'text' && format !== 'yaml') {
    return { error: `Invalid --format "${format}", must be "text" or "yaml"` };
  }

  return {
    value: {
      appId: raw.appId ?? env.LARK_DOCX2MD_APP_ID,
      appSecret: raw.appSecret ?? env.LARK_DOCX2MD_APP_SECRET,
      output: raw.output ?? env.LARK_DOCX2MD_OUTPUT ?? DEFAULT_OUTPUT,
      agent: agentResolved.value,
      maxLevel,
      format,
    },
  };
}

function parsePositiveInteger (raw: string): number | null {
  const value = parseInt(raw, 10);
  if (!Number.isInteger(value) || value < 1 || `${value}` !== raw.trim()) return null;
  return value;
}

function isImageMode (value: string): value is ImageMode {
  return value === 'local' || value === 'online';
}

function isWbImageMode (value: string): value is WbImageMode {
  return value === 'online' || value === 'base64' || value === 'local';
}

function isWbFormat (value: string): value is WbFormat {
  return value === 'base64' || value === 'inline-svg' || value === 'svg' || value === 'yaml';
}

function isAgentWbFormat (value: string): value is 'inline-svg' | 'yaml' {
  return value === 'inline-svg' || value === 'yaml';
}
