#!/usr/bin/env node
import { Command } from 'commander';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { LoggerLevel } from '@larksuiteoapi/node-sdk';
import { createClient } from './client.js';
import { Parser } from './parser.js';
import { createLogger, setLogLevel } from './logger.js';

const logger = createLogger('cli');

function parseWikiUrl (url: string): { docType: string; docToken: string } {
  const m = url.match(/^https:\/\/[\w.-]+\/(docs|docx|wiki)\/([a-zA-Z0-9]+)/);
  if (!m) throw new Error('Invalid feishu document URL');
  return { docType: m[1]!, docToken: m[2]! };
}

const program = new Command();
program.name('larkDocx2md').description('Download Lark/Feishu documents to markdown');

program
  .command('download')
  .description('Download a wiki document to markdown')
  .option('--app-id <id>', 'Feishu app ID (or read from LARK_DOCX2MD_APP_ID)')
  .option('--app-secret <secret>', 'Feishu app secret (or read from LARK_DOCX2MD_APP_SECRET)')
  .option('-o, --output <dir>', 'Output directory', './larkDocx2mdOutput')
  .option('--agent', 'Enable agent mode: ERROR log level, and AI prompt output')
  .option('--image-mode <mode>', 'Image handling mode: "local" (download) or "online" (temp URL)', 'local')
  .argument('<url>', 'Feishu wiki document URL: https://*.feishu.cn/wiki/*')
  .action(async (url: string, opts: { appId?: string; appSecret?: string; output: string; agent?: boolean; imageMode: string }) => {
    if (opts.agent) {
      setLogLevel(LoggerLevel.error);
      opts.imageMode = 'online';
    } else if (opts.imageMode && !['local', 'online'].includes(opts.imageMode)) {
      program.error(`Invalid --image-mode "${opts.imageMode}", must be "local" or "online"`);
    }

    const { docType, docToken: rawToken } = parseWikiUrl(url);
    logger.info('Captured document token:', rawToken);

    const appId = opts.appId ?? process.env.LARK_DOCX2MD_APP_ID!;
    const appSecret = opts.appSecret ?? process.env.LARK_DOCX2MD_APP_SECRET!;
    if (!appId || !appSecret) {
      program.error('Missing credentials: pass --app-id/--app-secret or set LARK_DOCX2MD_APP_ID/LARK_DOCX2MD_APP_SECRET');
    }

    const sdkLoggerLevel = opts.agent ? LoggerLevel.error : LoggerLevel.warn;
    const client = createClient(appId, appSecret, sdkLoggerLevel);
    let docToken = rawToken;

    if (docType === 'wiki') {
      const node = await client.getWikiNodeInfo(docToken);
      docToken = node.obj_token!;
      logger.info('Resolved docx token:', docToken);
    }

    const doc = await client.getDocxDocument(docToken);
    const blocks = await client.getDocxBlocks(docToken);
    logger.info(`Fetched ${blocks.length} blocks`);

    const parser = new Parser();
    let markdown = parser.parseDocxContent(doc, blocks);

    if (opts.imageMode === 'online') {
      // batch: max 5 tokens per request
      for (let i = 0; i < parser.imgTokens.length; i += 5) {
        const batch = parser.imgTokens.slice(i, i + 5);
        const urlMap = await client.batchGetTmpDownloadUrl(batch);
        for (const token of batch) {
          const onlineUrl = urlMap[token];
          if (onlineUrl) {
            markdown = markdown.replace(`(${token})`, `(${onlineUrl})`);
            logger.info('Replaced image with online URL:', token);
          }
        }
      }
    } else {
      const imgDir = path.join(opts.output, 'static');
      for (const imgToken of parser.imgTokens) {
        let localPath = await client.downloadImage(imgToken, imgDir);
        localPath = path.relative(opts.output, localPath);
        markdown = markdown.replace(`(${imgToken})`, `(${localPath})`);
        logger.info('Downloaded image:', localPath);
      }
    }

    if (opts.agent) {
      process.stdout.write(markdown);
    } else {
      fs.mkdirSync(opts.output, { recursive: true });
      const mdPath = path.join(opts.output, `${docToken}.md`);
      fs.writeFileSync(mdPath, markdown);
      logger.info('Downloaded markdown file to', mdPath);
    }
  });

program.parse();
