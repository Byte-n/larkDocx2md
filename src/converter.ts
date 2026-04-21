import * as fs from 'node:fs';
import * as path from 'node:path';
import { LoggerLevel } from '@larksuiteoapi/node-sdk';
import { createClient } from './client.js';
import { Parser } from './md-ast/parser.js';
import { registerBuiltinParsers } from './md-ast/parsers/index.js';
import { MdSerializer, registerBuiltinSerializers } from './md-ast/serializer.js';
import { MdTransformer } from './md-ast/transformer.js';
import { createLogger } from './logger.js';
import type { ConvertOptions, ConvertResult } from './types.js';

const logger = createLogger('converter');

// ─── URL Parsing ─────────────────────────────────────────────────────────────

export function parseWikiUrl (url: string): { docType: string; docToken: string } {
  const m = url.match(/^https:\/\/[\w.-]+\/(docs|docx|wiki)\/([a-zA-Z0-9]+)/);
  if (!m) throw new Error('Invalid feishu document URL');
  return { docType: m[1]!, docToken: m[2]! };
}

// ─── Core Convert ────────────────────────────────────────────────────────────

export async function convert (opts: ConvertOptions): Promise<ConvertResult> {
  const { docType, docToken: rawToken } = parseWikiUrl(opts.url);
  logger.info('Captured document token:', rawToken);

  const sdkLoggerLevel = opts.agent ? LoggerLevel.error : LoggerLevel.warn;
  const client = createClient(opts.appId, opts.appSecret, sdkLoggerLevel);

  // 1. 解析文档 token
  let docToken = rawToken;
  if (docType === 'wiki') {
    const node = await client.getWikiNodeInfo(docToken);
    docToken = node.obj_token!;
    logger.info('Resolved docx token:', docToken);
  }

  // 2. 获取文档内容
  const doc = await client.getDocxDocument(docToken);
  const blocks = await client.getDocxBlocks(docToken);
  logger.info(`Fetched ${blocks.length} blocks`);

  // 3. 解析为 AST
  const parser = new Parser();
  registerBuiltinParsers(parser);
  const ast = parser.parse(doc, blocks);

  // 4. 异步后处理
  const transformer = new MdTransformer(client, opts);
  await transformer.transform(ast);

  // 5. 序列化为 markdown
  const serializer = new MdSerializer();
  registerBuiltinSerializers(serializer);
  const markdown = serializer.serialize(ast);

  // 6. 输出
  let filePath: string | undefined;
  if (!opts.agent) {
    fs.mkdirSync(opts.output, { recursive: true });
    filePath = path.join(opts.output, `${docToken}.md`);
    fs.writeFileSync(filePath, markdown);
    logger.info('Downloaded markdown file to', filePath);
  }

  return { markdown, docToken, filePath };
}
