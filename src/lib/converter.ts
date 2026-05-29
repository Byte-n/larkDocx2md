import * as fs from 'node:fs';
import * as path from 'node:path';
import { LoggerLevel } from '@larksuiteoapi/node-sdk';
import { createClient } from './client.js';
import { Parser } from '../md-ast/parser.js';
import { registerBuiltinParsers } from '../md-ast/parsers/index.js';
import { MdSerializer, registerBuiltinSerializers } from '../md-ast/serializer.js';
import { MdTransformer } from '../md-ast/transformer.js';
import { createLogger } from './logger.js';
import type { ConvertOptions, ConvertResult, DocxBlock } from './types.js';
import {
  createTitleFilter,
  createTitleBlockIdFilter,
  type TitleFilterResult,
} from './title-filter.js';
import { serializeTitlesText } from './get-titles.js';
import { parseWikiUrl } from './url.js';

// 保留 “parseWikiUrl from converter” 公开 API（供外部代码 / 测试向后兼容）
export { parseWikiUrl };

const logger = createLogger('converter');

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

  let ast: import('../md-ast/types.js').MdBlockNode;

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

  const serializer = createMarkdownSerializer();
  const sourceType = objType === 'sheet' ? 'sheet' : 'docx';

  // 先按当前 AST 做一次轻量 markdown 行数检查，避免纯文本大文档继续下载图片/画板/表格。
  assertOutputLineLimit({
    markdown: serializer.serialize(ast, { sourceType }),
    maxOutputLines: opts.maxOutputLines,
    hasTitleFilter: hasTitleFilter(opts),
    stage: 'initial markdown',
  });

  // 异步后处理
  const transformer = new MdTransformer(client, opts, objType === 'sheet' ? 'sheet' : 'docx');
  await transformer.transform(ast);

  // 序列化为 markdown
  const markdown = serializer.serialize(ast, { sourceType });

  assertOutputLineLimit({
    markdown,
    maxOutputLines: opts.maxOutputLines,
    hasTitleFilter: hasTitleFilter(opts),
    stage: 'final markdown',
  });

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

function createMarkdownSerializer (): MdSerializer {
  const serializer = new MdSerializer();
  registerBuiltinSerializers(serializer);
  return serializer;
}

function hasTitleFilter (opts: ConvertOptions): boolean {
  return Boolean(opts.filterTitle || opts.filterTitleBlockId);
}

export function countMarkdownLines (markdown: string): number {
  if (!markdown) return 0;
  return markdown.split('\n').length;
}

export function assertOutputLineLimit (params: {
  markdown: string;
  maxOutputLines?: number;
  hasTitleFilter: boolean;
  stage: string;
}): void {
  if (!params.maxOutputLines || params.hasTitleFilter) return;
  const lineCount = countMarkdownLines(params.markdown);
  if (lineCount <= params.maxOutputLines) return;

  throw new Error(
    `Markdown output has ${lineCount} lines after ${params.stage}, exceeding ${params.maxOutputLines}. ` +
    `Please narrow the document with a heading filter: run get-titles to find the heading, then retry dl with --filter-title-block-id.`,
  );
}

export function buildFilterErrorMessage (opts: ConvertOptions, result: TitleFilterResult, _url: string, _docToken: string): string {
  let target: string;
  if (opts.filterTitleBlockId) target = `block id "${opts.filterTitleBlockId}"`;
  else target = `"${opts.filterTitle}"`;

  let msg = `No heading matched ${target}. Please verify the heading text/id.`;

  if (result.availableHeadings.length > 0) {
    const text = serializeTitlesText(result.availableHeadings);
    msg += `\n\nFull title list of the document:\n\n${text}`;
  }
  return msg;
}
