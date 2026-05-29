#!/usr/bin/env node
import * as fs from 'node:fs';
import * as path from 'node:path';
import { Command } from 'commander';
import { LoggerLevel } from '@larksuiteoapi/node-sdk';
import { convert, countMarkdownLines } from './converter.js';
import {
  GET_TITLES_NON_DOCUMENT_HINT,
  buildTitleTree,
  getTitles,
  serializeTitlesText,
  type GetTitlesFormat,
} from './get-titles.js';
import { setLogLevel } from './logger.js';
import { parseWikiUrl } from './url.js';
import { serializeYaml } from './whiteboard/yaml/serialize.js';
import type { SvgBackground, WbFormat, WbImageMode, AgentMode } from './types.js';

const program = new Command();
program.name('larkDocx2md').description('Download Lark/Feishu documents to markdown');

/**
 * 把 commander 解析出的 --agent 原值（undefined | true | string）与
 * LARK_DOCX2MD_AGENT 环境变量统一收敛为精确的 AgentMode | false。
 *
 * 优先级：显式 --agent > 环境变量 > 默认 false。
 * 非法取值返回错误信息字符串，由调用方决定如何上报。
 */
function resolveAgentMode (raw: boolean | string | undefined): { value: AgentMode | false; error?: string } {
  if (raw === undefined) {
    const env = process.env.LARK_DOCX2MD_AGENT;
    if (env === 'stdout' || env === 'local') return { value: env };
    if (env !== undefined && env !== '') {
      return { value: false, error: `Invalid LARK_DOCX2MD_AGENT="${env}", must be "stdout" or "local"` };
    }
    return { value: false };
  }
  // --agent 不带值：默认 stdout
  if (raw === true) return { value: 'stdout' };
  if (raw === 'stdout' || raw === 'local') return { value: raw };
  return { value: false, error: `Invalid --agent value "${raw}", must be "stdout" or "local"` };
}

function missingCredentialsMessage (agentEnabled: boolean): string {
  if (agentEnabled) {
    return 'Missing credentials: pass --app-id/--app-secret or configure credentials in the environment.';
  }
  return 'Missing credentials: pass --app-id/--app-secret or set LARK_DOCX2MD_APP_ID/LARK_DOCX2MD_APP_SECRET';
}

function resolveCommandUrl (positionalUrl: string | undefined, optionUrl: string | undefined): string {
  if (positionalUrl) {
    process.stderr.write(
      'Warning: passing the URL as a positional argument is deprecated and will be removed in the next version. Use --url <url> instead.\n',
    );
  }
  const url = optionUrl ?? positionalUrl;
  if (!url) {
    program.error('Missing document URL: pass --url <url>. The positional URL argument is deprecated and will be removed in the next version.');
  }
  return url!;
}

program
  .command('download')
  .alias('dl')
  .description('Download a wiki document to markdown')
  .option('--url <url>', 'Feishu wiki/document URL')
  .option('--app-id <id>', 'Feishu app ID (or read from LARK_DOCX2MD_APP_ID)')
  .option('--app-secret <secret>', 'Feishu app secret (or read from LARK_DOCX2MD_APP_SECRET)')
  .option('-o, --output <dir>', 'Output directory (or LARK_DOCX2MD_OUTPUT)')
  .option('--agent [mode]', 'Enable agent mode: ERROR log level, and AI-oriented stdout. Modes: "stdout" (default, print markdown to stdout) or "local" (save markdown/images/whiteboards to disk and print a read-file prompt). Or LARK_DOCX2MD_AGENT=stdout|local')
  .option('--wb-format <format>', 'Whiteboard output format: "base64", "inline-svg", "svg", or "yaml" (or LARK_DOCX2MD_WB_FORMAT)')
  .option('--wb-bg <style>', 'Whiteboard SVG background: "none", "dot", or a color like "#fff" (or LARK_DOCX2MD_WB_BG)')
  .option('--wb-image-mode <mode>', 'Whiteboard image mode: "online", "base64", or "local" (or LARK_DOCX2MD_WB_IMAGE_MODE)')
  .option('--image-mode <mode>', 'Image handling mode: "local" or "online" (or LARK_DOCX2MD_IMAGE_MODE)')
  .option('--filter-title <title>', 'Only convert the section matching this heading title (single title, first match wins on duplicates)')
  .option('--filter-title-block-id <id>', 'Only convert the section whose heading block id matches (most precise; obtain from get-titles)')
  .option('--max-output-lines <n>', 'Maximum allowed markdown lines when no heading filter is specified; errors if exceeded (or LARK_DOCX2MD_MAX_OUTPUT_LINES)')
  .argument('[url]', 'Deprecated: Feishu wiki document URL. Use --url <url> instead.')
  .action(async (positionalUrl: string | undefined, opts: { url?: string; appId?: string; appSecret?: string; output?: string; agent?: boolean | string; imageMode?: string; wbImageMode?: string; wbBg?: SvgBackground; wbFormat?: string; filterTitle?: string; filterTitleBlockId?: string; maxOutputLines?: string }) => {
    const url = resolveCommandUrl(positionalUrl, opts.url);
    // ─── 环境变量默认值（直接指定 > 环境变量 > 内置默认值）────────────────
    opts.appId = opts.appId ?? process.env.LARK_DOCX2MD_APP_ID;
    opts.appSecret = opts.appSecret ?? process.env.LARK_DOCX2MD_APP_SECRET;
    opts.output = opts.output ?? process.env.LARK_DOCX2MD_OUTPUT ?? './larkDocx2mdOutput';
    // 解析 --agent：可能为 undefined | true | 'stdout' | 'local' | 其他字符串
    const agentResolved = resolveAgentMode(opts.agent);
    if (agentResolved.error) {
      program.error(agentResolved.error);
      return;
    }
    opts.agent = agentResolved.value;
    const agentEnabled = opts.agent === 'stdout' || opts.agent === 'local';
    const agentLocal = opts.agent === 'local';
    const agentStdout = opts.agent === 'stdout';

    opts.imageMode = opts.imageMode ?? process.env.LARK_DOCX2MD_IMAGE_MODE ?? 'local';
    opts.wbFormat = opts.wbFormat ?? process.env.LARK_DOCX2MD_WB_FORMAT;
    opts.wbBg = opts.wbBg ?? process.env.LARK_DOCX2MD_WB_BG ?? 'none';
    opts.wbImageMode = opts.wbImageMode ?? process.env.LARK_DOCX2MD_WB_IMAGE_MODE ?? 'local';
    opts.maxOutputLines = opts.maxOutputLines ?? process.env.LARK_DOCX2MD_MAX_OUTPUT_LINES;

    // 设置 wb-format 默认值：--agent local 默认 inline-svg（兼容本地画板图片），--agent stdout 默认 yaml，其余 svg
    if (!opts.wbFormat) {
      if (agentLocal) opts.wbFormat = 'inline-svg';
      else if (agentStdout) opts.wbFormat = 'yaml';
      else opts.wbFormat = 'svg';
    }

    if (agentEnabled) {
      setLogLevel(LoggerLevel.error);
      if (agentLocal) {
        // --agent local：图片/画板图片均落盘
        opts.imageMode = 'local';
        opts.wbImageMode = 'local';
      } else {
        // --agent stdout：一律在线，且画板仅支持内嵌形式
        opts.imageMode = 'online';
        opts.wbImageMode = 'online';
      }
      if (!['inline-svg', 'yaml'].includes(opts.wbFormat)) {
        program.error(`Agent mode only supports "inline-svg" or "yaml" for --wb-format`);
      }
    } else {
      // yaml 格式图片仅支持 online
      if (opts.wbFormat === 'yaml') {
        opts.wbImageMode = 'online';
      }
    }

    if (opts.imageMode && !['local', 'online'].includes(opts.imageMode)) {
      program.error(`Invalid --image-mode "${opts.imageMode}", must be "local" or "online"`);
    }
    if (!['base64', 'inline-svg', 'svg', 'yaml'].includes(opts.wbFormat)) {
      program.error(`Invalid --wb-format "${opts.wbFormat}", must be "base64", "inline-svg", "svg", or "yaml"`);
    }
    if (!['online', 'base64', 'local'].includes(opts.wbImageMode)) {
      program.error(`Invalid --wb-image-mode "${opts.wbImageMode}", must be "online", "base64", or "local"`);
    }
    if (opts.filterTitle && opts.filterTitleBlockId) {
      program.error('--filter-title and --filter-title-block-id are mutually exclusive; choose one');
    }
    let maxOutputLines: number | undefined;
    if (opts.maxOutputLines !== undefined) {
      maxOutputLines = parseInt(opts.maxOutputLines, 10);
      if (!Number.isInteger(maxOutputLines) || maxOutputLines < 1 || `${maxOutputLines}` !== opts.maxOutputLines.trim()) {
        program.error(`Invalid --max-output-lines / LARK_DOCX2MD_MAX_OUTPUT_LINES "${opts.maxOutputLines}", must be a positive integer`);
      }
    }

    const appId = opts.appId!;
    const appSecret = opts.appSecret!;
    if (!appId || !appSecret) {
      program.error(missingCredentialsMessage(agentEnabled));
    }

    const result = await convert({
      appId,
      appSecret,
      url,
      output: opts.output,
      imageMode: opts.imageMode as 'local' | 'online',
      wbImageMode: opts.wbImageMode as WbImageMode,
      wbBg: opts.wbBg,
      wbFormat: opts.wbFormat as WbFormat,
      agent: opts.agent as AgentMode | false,
      filterTitle: opts.filterTitle?.trim(),
      filterTitleBlockId: opts.filterTitleBlockId?.trim(),
      maxOutputLines,
    });

    if (agentLocal) {
      // 本地模式：输出引导 AI 读取文件的提示词（绝对路径）
      const lineCount = countMarkdownLines(result.markdown);
      process.stdout.write(
        `**The Feishu document has been downloaded to the following absolute path:**\n\n` +
        `\`${result.filePath}\`. file line count: ${lineCount}\n\n` +
        `**Read this file to access the full markdown content.**\n`,
      );
    } else if (agentStdout) {
      process.stdout.write(result.markdown);
    }
  });

program
  .command('get-titles')
  .description('Print all headings (level 1~9) of a wiki/docx document. Useful before --filter-title-block-id.')
  .option('--url <url>', 'Feishu wiki/docx URL')
  .option('--app-id <id>', 'Feishu app ID (or read from LARK_DOCX2MD_APP_ID)')
  .option('--app-secret <secret>', 'Feishu app secret (or read from LARK_DOCX2MD_APP_SECRET)')
  .option('-o, --output <dir>', 'Output directory used by --agent local (or LARK_DOCX2MD_OUTPUT)')
  .option('--max-level <n>', 'Only output headings whose level <= n (1~9)', '9')
  .option('--format <format>', 'Output format: "text" or "yaml"', 'text')
  .option('--agent [mode]', 'Enable agent mode: ERROR log level, AI-oriented stdout. Modes: "stdout" (default, print titles to stdout) or "local" (save titles to disk and print a read-file prompt). Or LARK_DOCX2MD_AGENT=stdout|local')
  .argument('[url]', 'Deprecated: Feishu wiki/docx URL. Use --url <url> instead.')
  .action(async (positionalUrl: string | undefined, opts: { url?: string; appId?: string; appSecret?: string; output?: string; maxLevel?: string; format?: string; agent?: boolean | string }) => {
    const url = resolveCommandUrl(positionalUrl, opts.url);
    opts.appId = opts.appId ?? process.env.LARK_DOCX2MD_APP_ID;
    opts.appSecret = opts.appSecret ?? process.env.LARK_DOCX2MD_APP_SECRET;
    opts.output = opts.output ?? process.env.LARK_DOCX2MD_OUTPUT ?? './larkDocx2mdOutput';
    const agentResolved = resolveAgentMode(opts.agent);
    if (agentResolved.error) {
      program.error(agentResolved.error);
      return;
    }
    opts.agent = agentResolved.value;
    const agentEnabled = opts.agent === 'stdout' || opts.agent === 'local';
    const agentLocal = opts.agent === 'local';
    if (agentEnabled) setLogLevel(LoggerLevel.error);

    const parsedUrl = parseWikiUrl(url);
    if (parsedUrl.docType === 'sheets') {
      throw new Error(GET_TITLES_NON_DOCUMENT_HINT);
    }

    const maxLevel = parseInt(opts.maxLevel ?? '9', 10);
    if (!Number.isInteger(maxLevel) || maxLevel < 1 || maxLevel > 9) {
      program.error(`Invalid --max-level "${opts.maxLevel}", must be an integer in [1, 9]`);
    }
    if (opts.format !== 'text' && opts.format !== 'yaml') {
      program.error(`Invalid --format "${opts.format}", must be "text" or "yaml"`);
    }
    const format = opts.format as GetTitlesFormat;

    const appId = opts.appId!;
    const appSecret = opts.appSecret!;
    if (!appId || !appSecret) {
      program.error(missingCredentialsMessage(agentEnabled));
    }

    const result = await getTitles({
      appId,
      appSecret,
      url,
      agent: opts.agent as AgentMode | false,
    });
    const filtered = result.titles.filter(t => t.level <= maxLevel);
    const content = format === 'yaml'
      ? serializeYaml({ url: result.url, docToken: result.docToken, titles: buildTitleTree(filtered) })
      : serializeTitlesText(filtered);

    if (agentLocal) {
      // 本地模式：落盘 + 输出引导 AI 读取文件的提示词（绝对路径）
      fs.mkdirSync(opts.output, { recursive: true });
      const ext = format === 'yaml' ? 'yaml' : 'md';
      const filePath = path.resolve(opts.output, `${result.docToken}.titles.${ext}`);
      fs.writeFileSync(filePath, content);
      const lineCount = countMarkdownLines(content);
      process.stdout.write(
        `**The Feishu document titles have been downloaded to the following absolute path:**\n\n` +
        `\`${filePath}\`. file line count: ${lineCount}\n\n` +
        `**Read this file to access the full titles list.**\n`,
      );
    } else {
      process.stdout.write(content);
    }
  });

program.parse();
