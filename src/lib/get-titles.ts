import { LoggerLevel } from '@larksuiteoapi/node-sdk';
import { createClient } from './client.js';
import { createLogger } from './logger.js';
import { parseWikiUrl } from './url.js';
import { createHeadingCollector, type HeadingInfo } from './title-filter.js';
import type { AgentMode } from './types.js';

const logger = createLogger('get-titles');
export const GET_TITLES_NON_DOCUMENT_HINT = 'The input link is not a document. There is no need to call get-titles; call dl directly with the same URL.';

// ─── Options & Result ───────────────────────────────────────────────────────

export interface GetTitlesOptions {
  appId: string;
  appSecret: string;
  url: string;
  /** 仅影响 SDK 日志级别（与 dl 保持一致） */
  agent?: AgentMode | false;
}

export interface GetTitlesResult {
  url: string;
  docToken: string;
  titles: HeadingInfo[];
}

// ─── Core ───────────────────────────────────────────────────────────────────

/** 拉取 docx/wiki 文档中所有标题信息（扁平列表，不下载图片）。不支持电子表格。 */
export async function getTitles (opts: GetTitlesOptions): Promise<GetTitlesResult> {
  const { docType, docToken: rawToken } = parseWikiUrl(opts.url);
  if (docType === 'sheets') {
    throw new Error(GET_TITLES_NON_DOCUMENT_HINT);
  }

  const sdkLoggerLevel = opts.agent ? LoggerLevel.error : LoggerLevel.warn;
  const client = createClient(opts.appId, opts.appSecret, sdkLoggerLevel);

  let docToken = rawToken;
  if (docType === 'wiki') {
    const node = await client.getWikiNodeInfo(docToken);
    docToken = node.obj_token!;
    logger.info('Resolved wiki node:', node.obj_type, docToken);
    if (node.obj_type === 'sheet') {
      throw new Error(GET_TITLES_NON_DOCUMENT_HINT);
    }
  }

  const collector = createHeadingCollector();
  await client.getDocxBlocks(docToken, collector.pageHandler);
  const titles = collector.getHeadings();
  logger.info(`Collected ${titles.length} headings`);
  return { url: opts.url, docToken, titles };
}

// ─── Tree & Output Helpers ──────────────────────────────────────────────────

/** 标题树节点（buildTitleTree 输出）。 */
export interface TitleTreeNode extends HeadingInfo {
  children?: TitleTreeNode[];
}

export type GetTitlesFormat = 'yaml' | 'text';

export const TITLES_TEXT_FORMAT_COMMENT = `---
format: lark-docx2md.titles
line_format: <markdown_heading> [<blockId>] <title>
use_block_id_with: npx -y lark-docx2md@latest dl --filter-title-block-id "<blockId>" --url "<url>"
---

`;

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

/** 输出紧凑标题清单：用 markdown heading marker 表达层级，并把 blockId 放在标题旁。 */
export function serializeTitlesText (titles: HeadingInfo[]): string {
  if (titles.length === 0) return '';
  return titles
    .map(t => `${'#'.repeat(t.level)} [${t.blockId}] ${t.text}`)
    .join('\n') + '\n';
}

/** 输出面向用户/Agent 读取的完整 text 文档，文件开头包含格式说明。 */
export function serializeTitlesTextDocument (titles: HeadingInfo[]): string {
  return TITLES_TEXT_FORMAT_COMMENT + serializeTitlesText(titles);
}
