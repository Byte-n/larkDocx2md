import * as fs from 'node:fs';
import * as path from 'node:path';
import { LoggerLevel } from '@larksuiteoapi/node-sdk';
import { createClient } from './client.js';
import { Parser } from './md-ast/parser.js';
import { registerBuiltinParsers } from './md-ast/parsers/index.js';
import { MdSerializer, registerBuiltinSerializers } from './md-ast/serializer.js';
import { MdTransformer } from './md-ast/transformer.js';
import { createLogger } from './logger.js';
import type { ConvertOptions, ConvertResult, DocxBlock } from './types.js';
import {
  createTitleFilter,
  createTitleBlockIdFilter,
  createHeadingCollector,
  type HeadingInfo,
  type TitleFilterResult,
} from './title-filter.js';
import { serializeYaml } from './whiteboard/yaml/serialize.js';

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
    let blocks: DocxBlock[];
    const filter = createDocxFilter(opts);
    if (filter) {
      await client.getDocxBlocks(docToken, filter.pageHandler);
      const result = filter.getResult();
      if (!result.matched) {
        throw new Error(buildFilterErrorMessage(opts, result, opts.url, docToken));
      }
      blocks = result.blocks;
    } else {
      blocks = await client.getDocxBlocks(docToken);
    }
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

// ─── Filter Selection ───────────────────────────────────────────────────────

/** 优先级：filterTitleBlockId > filterTitle。返回 null 表示不过滤。 */
function createDocxFilter (opts: ConvertOptions): {
  pageHandler: (blocks: DocxBlock[]) => boolean;
  getResult: () => TitleFilterResult;
} | null {
  if (opts.filterTitleBlockId) return createTitleBlockIdFilter({ blockId: opts.filterTitleBlockId });
  if (opts.filterTitle) return createTitleFilter({ title: opts.filterTitle });
  return null;
}

function buildFilterErrorMessage (opts: ConvertOptions, result: TitleFilterResult, url: string, docToken: string): string {
  let target: string;
  if (opts.filterTitleBlockId) target = `block id "${opts.filterTitleBlockId}"`;
  else target = `"${opts.filterTitle}"`;
  let msg = `No heading matched ${target}. Please verify the heading text/id.`;
  if (result.availableHeadings.length > 0) {
    // 输出与 get-titles 同形的 yaml（含 blockId/index/level/text/path），
    // 使 AI 可直接据此重选 blockId，无需再调用 get-titles。
    const yaml = serializeYaml({ url, docToken, titles: result.availableHeadings });
    msg += `\n\nFull title list of the document (yaml, same shape as \`get-titles\`):\n\n${yaml}`;
  }
  return msg;
}

// ─── get-titles ────────────────────────────────────────────────────────────

export interface GetTitlesOptions {
  appId: string;
  appSecret: string;
  url: string;
  /** 仅影响 SDK 日志级别（与 dl 保持一致） */
  agent?: boolean | 'local';
}

export interface GetTitlesResult {
  url: string;
  docToken: string;
  titles: HeadingInfo[];
}

/** 拉取 docx/wiki 文档中所有标题信息（扁平列表，不下载图片）。 */
export async function getTitles (opts: GetTitlesOptions): Promise<GetTitlesResult> {
  const { docType, docToken: rawToken } = parseWikiUrl(opts.url);
  if (docType === 'sheets') {
    throw new Error('get-titles only supports docx/wiki documents, not spreadsheets');
  }

  const sdkLoggerLevel = opts.agent ? LoggerLevel.error : LoggerLevel.warn;
  const client = createClient(opts.appId, opts.appSecret, sdkLoggerLevel);

  let docToken = rawToken;
  if (docType === 'wiki') {
    const node = await client.getWikiNodeInfo(docToken);
    docToken = node.obj_token!;
    logger.info('Resolved wiki node:', node.obj_type, docToken);
  }

  const collector = createHeadingCollector();
  await client.getDocxBlocks(docToken, collector.pageHandler);
  const titles = collector.getHeadings();
  logger.info(`Collected ${titles.length} headings`);
  return { url: opts.url, docToken, titles };
}

/** 标题树节点（buildTitleTree 输出）。 */
export interface TitleTreeNode extends HeadingInfo {
  children?: TitleTreeNode[];
}

/** 按 level 栈式回溯将扁平标题列表转为树（容忍跳级标题）。 */
export function buildTitleTree (titles: HeadingInfo[]): TitleTreeNode[] {
  const roots: TitleTreeNode[] = [];
  const stack: TitleTreeNode[] = [];
  for (const t of titles) {
    const node: TitleTreeNode = { ...t };
    while (stack.length > 0 && stack[stack.length - 1]!.level >= node.level) stack.pop();
    if (stack.length === 0) {
      roots.push(node);
    } else {
      const parent = stack[stack.length - 1]!;
      (parent.children ??= []).push(node);
    }
    stack.push(node);
  }
  return roots;
}

/** 按级别以 markdown heading 风格输出人读文本（包含缩进）。 */
export function formatTitlesAsText (titles: HeadingInfo[]): string {
  return titles
    .map(t => `${'  '.repeat(Math.max(0, t.level - 1))}${'#'.repeat(t.level)} ${t.text}`)
    .join('\n');
}
