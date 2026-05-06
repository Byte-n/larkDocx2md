#!/usr/bin/env node
import { Command } from 'commander';
import { LoggerLevel } from '@larksuiteoapi/node-sdk';
import { convert } from './converter.js';
import { setLogLevel } from './logger.js';
import type { SvgBackground, WbFormat, WbImageMode } from './types.js';

const program = new Command();
program.name('larkDocx2md').description('Download Lark/Feishu documents to markdown');

program
  .command('download')
  .alias('dl')
  .description('Download a wiki document to markdown')
  .option('--app-id <id>', 'Feishu app ID (or read from LARK_DOCX2MD_APP_ID)')
  .option('--app-secret <secret>', 'Feishu app secret (or read from LARK_DOCX2MD_APP_SECRET)')
  .option('-o, --output <dir>', 'Output directory (or LARK_DOCX2MD_OUTPUT)')
  .option('--agent [mode]', 'Enable agent mode: ERROR log level, and AI-oriented stdout. Pass "local" to save markdown/images/whiteboards to disk and print a read-file prompt (or LARK_DOCX2MD_AGENT=true|local)')
  .option('--wb-format <format>', 'Whiteboard output format: "base64", "inline-svg", "svg", or "yaml" (or LARK_DOCX2MD_WB_FORMAT)')
  .option('--wb-bg <style>', 'Whiteboard SVG background: "none", "dot", or a color like "#fff" (or LARK_DOCX2MD_WB_BG)')
  .option('--wb-image-mode <mode>', 'Whiteboard image mode: "online", "base64", or "local" (or LARK_DOCX2MD_WB_IMAGE_MODE)')
  .option('--image-mode <mode>', 'Image handling mode: "local" or "online" (or LARK_DOCX2MD_IMAGE_MODE)')
  .option('--filter-title <title>', 'Only convert the section matching this heading title')
  .argument('<url>', 'Feishu wiki document URL: https://*.feishu.cn/wiki/*')
  .action(async (url: string, opts: { appId?: string; appSecret?: string; output?: string; agent?: boolean | string; imageMode?: string; wbImageMode?: string; wbBg?: SvgBackground; wbFormat?: string; filterTitle?: string }) => {
    // ─── 环境变量默认值（直接指定 > 环境变量 > 内置默认值）────────────────
    opts.appId = opts.appId ?? process.env.LARK_DOCX2MD_APP_ID;
    opts.appSecret = opts.appSecret ?? process.env.LARK_DOCX2MD_APP_SECRET;
    opts.output = opts.output ?? process.env.LARK_DOCX2MD_OUTPUT ?? './larkDocx2mdOutput';
    // 解析 --agent：可能为 undefined | true | 'local' | 其他字符串
    if (opts.agent === undefined) {
      const envAgent = process.env.LARK_DOCX2MD_AGENT;
      if (envAgent === 'true') opts.agent = true;
      else if (envAgent === 'local') opts.agent = 'local';
      else opts.agent = false;
    } else if (typeof opts.agent === 'string' && opts.agent !== 'local') {
      program.error(`Invalid --agent value "${opts.agent}", only "local" is supported (or omit the value)`);
    }
    const agentEnabled = opts.agent === true || opts.agent === 'local';
    const agentLocal = opts.agent === 'local';

    opts.imageMode = opts.imageMode ?? process.env.LARK_DOCX2MD_IMAGE_MODE ?? 'local';
    opts.wbFormat = opts.wbFormat ?? process.env.LARK_DOCX2MD_WB_FORMAT;
    opts.wbBg = opts.wbBg ?? process.env.LARK_DOCX2MD_WB_BG ?? 'none';
    opts.wbImageMode = opts.wbImageMode ?? process.env.LARK_DOCX2MD_WB_IMAGE_MODE ?? 'local';

    // 设置 wb-format 默认值：--agent local 默认 inline-svg（兼容本地画板图片），--agent（在线）默认 yaml，其余 svg
    if (!opts.wbFormat) {
      opts.wbFormat = agentEnabled ? 'yaml' : 'svg';
    }

    if (agentEnabled) {
      setLogLevel(LoggerLevel.error);
      if (agentLocal) {
        // --agent local：图片/画板图片均落盘
        opts.imageMode = 'local';
        opts.wbImageMode = 'local';
      } else {
        // --agent（在线）：一律在线，且画板仅支持内嵌形式
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

    const appId = opts.appId!;
    const appSecret = opts.appSecret!;
    if (!appId || !appSecret) {
      program.error('Missing credentials: pass --app-id/--app-secret or set LARK_DOCX2MD_APP_ID/LARK_DOCX2MD_APP_SECRET');
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
      agent: agentLocal ? 'local' : (opts.agent === true),
      filterTitle: opts.filterTitle?.trim(),
    });

    if (agentLocal) {
      // 本地模式：输出引导 AI 读取文件的提示词（绝对路径）
      process.stdout.write(
        `**The Feishu document has been downloaded to the following absolute path:**\n\n` +
        `\`${result.filePath}\`\n\n` +
        `**Read this file to access the full markdown content.**\n`,
      );
    } else if (opts.agent === true) {
      process.stdout.write(result.markdown);
    }
  });

program.parse();
