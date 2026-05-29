import type * as lark from '@larksuiteoapi/node-sdk';

// ─── Lark API Types ──────────────────────────────────────────────────────────

export type DocxBlock = NonNullable<NonNullable<
  Awaited<ReturnType<lark.Client['docx']['v1']['documentBlock']['list']>>['data']
>['items']>[number];

export type WhiteboardNode = NonNullable<NonNullable<
  Awaited<ReturnType<lark.Client['board']['v1']['whiteboardNode']['list']>>['data']
>['nodes']>[number];

export type TextBody = NonNullable<DocxBlock['text']>;
export type TextElement = TextBody['elements'][number];

export interface DocInfo {
  documentId: string;
  title: string;
}

// ─── Converter Options & Result ──────────────────────────────────────────────

export type ImageMode = 'local' | 'online';

/** 画板中图片的输出格式 */
export type WbImageMode = 'online' | 'base64' | 'local';

/** 画板输出格式 */
export type WbFormat = 'base64' | 'inline-svg' | 'svg' | 'yaml';

/** 画板 SVG 背景样式：'none' | '#xxx' 颜色值 | 'dot' 点阵 */
export type SvgBackground = 'none' | 'dot' | (string & {});

/**
 * Agent 模式：
 * - `'stdout'`：图片/画板全部走在线 URL，markdown 输出到 stdout
 * - `'local'`：图片/画板中的图片/markdown 均落盘，stdout 输出引导 AI 读取的提示词
 * - `false` / 省略：禁用 agent 模式
 */
export type AgentMode = 'stdout' | 'local';

export interface ConvertOptions {
  appId: string;
  appSecret: string;
  url: string;
  output: string;
  imageMode: ImageMode;
  wbImageMode: WbImageMode;
  wbBg: SvgBackground;
  wbFormat: WbFormat;
  /** Agent 模式，详见 {@link AgentMode}。 */
  agent?: AgentMode | false;
  /** 按标题过滤：仅转换匹配标题及其下级内容（单一标题，同名时取首个） */
  filterTitle?: string;
  /** 按 heading 块 id 过滤：最精确，避开一切同名歧义 */
  filterTitleBlockId?: string;
  /** 未指定标题过滤时，允许输出的最大 markdown 行数 */
  maxOutputLines?: number;
}

export interface ConvertResult {
  markdown: string;
  docToken: string;
  filePath?: string;
}
