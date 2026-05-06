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

export function parseWikiUrl (url: string): { docType: string; docToken: string; sheetId?: string } {
  const m = url.match(/^https:\/\/[\w.-]+\/(docs|docx|wiki|sheets)\/([a-zA-Z0-9]+)/);
  if (!m) throw new Error('Invalid feishu document URL');
  // 解析 ?sheet=XXX 查询参数（仅对 sheets 类型有意义）
  const sheetId = new URL(url).searchParams.get('sheet') ?? undefined;
  return { docType: m[1]!, docToken: m[2]!, sheetId };
}

// ─── Core Convert ────────────────────────────────────────────────────────────

export async function convert (opts: ConvertOptions): Promise<ConvertResult> {
  const { docType, docToken: rawToken, sheetId } = parseWikiUrl(opts.url);
  logger.info('Captured document token:', rawToken, sheetId ? `sheetId: ${sheetId}` : '');

  const sdkLoggerLevel = opts.agent ? LoggerLevel.error : LoggerLevel.warn;
  const client = createClient(opts.appId, opts.appSecret, sdkLoggerLevel);

  // 1. 解析文档 token 与类型
  let docToken = rawToken;
  let objType: string = docType; // 'docx' | 'docs' | 'sheet' | 'wiki'

  if (docType === 'wiki') {
    const node = await client.getWikiNodeInfo(docToken);
    docToken = node.obj_token!;
    objType = node.obj_type as string ?? 'docx';
    logger.info('Resolved wiki node:', objType, docToken);
  } else if (docType === 'sheets') {
    objType = 'sheet';
  }

  let ast: import('./md-ast/types.js').MdBlockNode;

  if (objType === 'sheet') {
    // 独立 sheet 流程：有 sheetId 时拼接为 token_sheetId 格式
    const info = await client.getSpreadsheetInfo(docToken);
    const sheetToken = sheetId ? `${docToken}_${sheetId}` : docToken;
    ast = {
      type: 'page',
      title: [{ type: 'text', content: info.title ?? '' }],
      children: [{ type: 'sheet', token: sheetToken }],
    };
  } else {
    // 原 docx 流程
    const doc = await client.getDocxDocument(docToken);
    const blocks = await client.getDocxBlocks(docToken);
    logger.info(`Fetched ${blocks.length} blocks`);

    const parser = new Parser();
    registerBuiltinParsers(parser);
    ast = parser.parse(doc, blocks);
  }

  // 异步后处理
  const transformer = new MdTransformer(client, opts, objType === 'sheet' ? 'sheet' : 'docx');
  await transformer.transform(ast);

  // 序列化为 markdown
  const serializer = new MdSerializer();
  registerBuiltinSerializers(serializer);
  const markdown = serializer.serialize(ast, { sourceType: objType === 'sheet' ? 'sheet' : 'docx' });

  // 输出：非 agent 模式、或 agent='local' 模式都需要落盘
  let filePath: string | undefined;
  if (!opts.agent || opts.agent === 'local') {
    fs.mkdirSync(opts.output, { recursive: true });
    filePath = path.resolve(opts.output, `${docToken}.md`);
    fs.writeFileSync(filePath, markdown);
    logger.info('Downloaded markdown file to', filePath);
  }

  return { markdown, docToken, filePath };
}
