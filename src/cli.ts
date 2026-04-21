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
  .description('Download a wiki document to markdown')
  .option('--app-id <id>', 'Feishu app ID (or read from LARK_DOCX2MD_APP_ID)')
  .option('--app-secret <secret>', 'Feishu app secret (or read from LARK_DOCX2MD_APP_SECRET)')
  .option('-o, --output <dir>', 'Output directory (or LARK_DOCX2MD_OUTPUT)')
  .option('--agent', 'Enable agent mode: ERROR log level, and AI prompt output (or LARK_DOCX2MD_AGENT=true)')
  .option('--wb-format <format>', 'Whiteboard output format: "base64", "inline-svg", "svg", or "yaml" (or LARK_DOCX2MD_WB_FORMAT)')
  .option('--wb-bg <style>', 'Whiteboard SVG background: "none", "dot", or a color like "#fff" (or LARK_DOCX2MD_WB_BG)')
  .option('--wb-image-mode <mode>', 'Whiteboard image mode: "online", "base64", or "local" (or LARK_DOCX2MD_WB_IMAGE_MODE)')
  .option('--image-mode <mode>', 'Image handling mode: "local" or "online" (or LARK_DOCX2MD_IMAGE_MODE)')
  .argument('<url>', 'Feishu wiki document URL: https://*.feishu.cn/wiki/*')
  .action(async (url: string, opts: { appId?: string; appSecret?: string; output?: string; agent?: boolean; imageMode?: string; wbImageMode?: string; wbBg?: SvgBackground; wbFormat?: string }) => {
    // ─── 环境变量默认值（直接指定 > 环境变量 > 内置默认值）────────────────
    opts.appId = opts.appId ?? process.env.LARK_DOCX2MD_APP_ID;
    opts.appSecret = opts.appSecret ?? process.env.LARK_DOCX2MD_APP_SECRET;
    opts.output = opts.output ?? process.env.LARK_DOCX2MD_OUTPUT ?? './larkDocx2mdOutput';
    opts.agent = opts.agent ?? (process.env.LARK_DOCX2MD_AGENT === 'true');
    opts.imageMode = opts.imageMode ?? process.env.LARK_DOCX2MD_IMAGE_MODE ?? 'local';
    opts.wbFormat = opts.wbFormat ?? process.env.LARK_DOCX2MD_WB_FORMAT;
    opts.wbBg = opts.wbBg ?? process.env.LARK_DOCX2MD_WB_BG ?? 'none';
    opts.wbImageMode = opts.wbImageMode ?? process.env.LARK_DOCX2MD_WB_IMAGE_MODE ?? 'local';

    // 设置 wb-format 默认值（依赖 agent 状态）
    if (!opts.wbFormat) {
      opts.wbFormat = opts.agent ? 'yaml' : 'svg';
    }

    if (opts.agent) {
      setLogLevel(LoggerLevel.error);
      opts.imageMode = 'online';
      opts.wbImageMode = 'online';
      // agent 模式下画板仅支持内嵌形式
      if (!['inline-svg', 'yaml'].includes(opts.wbFormat)) {
        program.error(`Agent mode only supports "inline-svg" or "yaml" for --wb-format`);
      }
      opts.wbImageMode = 'online';
    }

    if (opts.imageMode && !['local', 'online'].includes(opts.imageMode)) {
      program.error(`Invalid --image-mode "${opts.imageMode}", must be "local" or "online"`);
    }
    if (!['base64', 'inline-svg', 'svg', 'yaml'].includes(opts.wbFormat)) {
      program.error(`Invalid --wb-format "${opts.wbFormat}", must be "base64", "inline-svg", "svg", or "yaml"`);
    }
    // yaml 格式 图片仅支持 online
    if (opts.wbFormat === 'yaml') {
      opts.wbImageMode = 'online';
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
      agent: opts.agent,
    });

    if (opts.agent) {
      process.stdout.write(result.markdown);
    }
  });

program.parse();
