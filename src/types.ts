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

export interface ConvertOptions {
  appId: string;
  appSecret: string;
  url: string;
  output: string;
  imageMode: ImageMode;
  wbImageMode: WbImageMode;
  wbBg: SvgBackground;
  wbFormat: WbFormat;
  agent?: boolean;
}

export interface ConvertResult {
  markdown: string;
  docToken: string;
  filePath?: string;
}
