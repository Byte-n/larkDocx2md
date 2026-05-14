/**
 * 飞书文档 URL 解析工具。独立模块，避免 converter / get-titles 之间的循环依赖。
 */

export interface ParsedFeishuUrl {
  /** 'docs' | 'docx' | 'wiki' | 'sheets' */
  docType: string;
  /** 文档/wiki 节点 token */
  docToken: string;
  /** ?sheet=XXX 查询参数（仅对 sheets 类型有意义） */
  sheetId?: string;
}

export function parseWikiUrl (url: string): ParsedFeishuUrl {
  const m = url.match(/^https:\/\/[\w.-]+\/(docs|docx|wiki|sheets)\/([a-zA-Z0-9]+)/);
  if (!m) throw new Error('Invalid feishu document URL');
  // 解析 ?sheet=XXX 查询参数（仅对 sheets 类型有意义）
  const sheetId = new URL(url).searchParams.get('sheet') ?? undefined;
  return { docType: m[1]!, docToken: m[2]!, sheetId };
}
