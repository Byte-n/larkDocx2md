import * as lark from '@larksuiteoapi/node-sdk';
import { LoggerLevel } from '@larksuiteoapi/node-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DocInfo, DocxBlock, WhiteboardNode } from './types.js';

export function createClient (appId: string, appSecret: string, loggerLevel: LoggerLevel = LoggerLevel.warn) {
  const client = new lark.Client({ appId, appSecret, loggerLevel });

  async function call<T> (name: string, fn: () => Promise<{ code?: number; msg?: string; data?: T }>): Promise<T> {
    let res;
    try {
      res = await fn();
    } catch (e: any) {
      const error = e.response?.data?.error;
      const code = e.response?.data?.code;
      const msg = e.response?.data?.msg;
      if (error) {
        throw new Error(`${name} failed: [${code}] ${msg}: \n${JSON.stringify(error, null, 2)}`);
      }
      throw e;
    }
    if (res.code !== 0) {
      throw new Error(`${name} failed: [${res.code}] ${res.msg}`);
    }
    return res.data!;
  }

  async function getWikiNodeInfo (token: string) {
    const data = await call('getWikiNodeInfo', () =>
      client.wiki.v2.space.getNode({ params: { token } }),
    );
    return data.node!;
  }

  async function getDocxDocument (docToken: string): Promise<DocInfo> {
    const data = await call('getDocxDocument', () =>
      client.docx.v1.document.get({ path: { document_id: docToken } }),
    );
    const doc = data.document!;
    return { documentId: doc.document_id!, title: doc.title! };
  }

  async function getDocxBlocks (docToken: string): Promise<DocxBlock[]> {
    const blocks: DocxBlock[] = [];
    let pageToken: string | undefined;
    for (; ;) {
      const data = await call('getDocxBlocks', () =>
        client.docx.v1.documentBlock.list({
          path: { document_id: docToken },
          params: { page_size: 500, document_revision_id: -1, page_token: pageToken },
        }),
      );
      if (data.items) blocks.push(...data.items);
      if (!data.has_more) break;
      pageToken = data.page_token;
    }
    return blocks;
  }

  /**
   *
   * @param fileTokens 一次最多可传递 5 个素材的 token
   * @return {Record<string, string>} Record<token, downloadLink>
   */
  async function batchGetTmpDownloadUrl (fileTokens: string[]): Promise<Record<string, string>> {
    const data = await call('batchGetTmpDownloadUrl', () =>
      client.drive.v1.media.batchGetTmpDownloadUrl({ params: { file_tokens: fileTokens } }),
    );
    const list = data.tmp_download_urls ?? [];
    const result: Record<string, string> = {};
    for (const { file_token, tmp_download_url } of list) {
      result[file_token] = tmp_download_url;
    }
    return result;
  }

  async function downloadImage (imgToken: string, outDir: string): Promise<string> {
    try {
      const resp = await client.drive.v1.media.download({ path: { file_token: imgToken } });
      fs.mkdirSync(outDir, { recursive: true });
      const ext = (resp.headers?.['content-type'] as string)?.includes('png') ? '.png' : '.jpg';
      const filename = path.join(outDir, `${imgToken}${ext}`);
      await resp.writeFile(filename);
      return filename;
    } catch (error: any) {
      if ([400, 401, 403].includes(error.status)) {
        throw new Error(`下载图片[${imgToken}]异常, 检查是否有接口 https://open.feishu.cn/document/server-docs/docs/drive-v1/media/download 的权限。`);
      }
      throw error;
    }
  }

  async function getWhiteboardNodes (whiteboardId: string): Promise<WhiteboardNode[]> {
    const data = await call('getWhiteboardNodes', () =>
      client.board.v1.whiteboardNode.list({ path: { whiteboard_id: whiteboardId } }),
    );
    return data.nodes ?? [];
  }

  async function downloadWhiteboardAsImage (whiteboardId: string, outDir: string): Promise<any> {
    const resp = await client.board.v1.whiteboard.downloadAsImage({
        path: {
          whiteboard_id: whiteboardId,
        },
      },
    );
    fs.mkdirSync(outDir, { recursive: true });
    const ext = (resp.headers?.['content-type'] as string)?.includes('png') ? '.png' : '.jpg';
    const filename = path.join(outDir, `${whiteboardId}${ext}`);
    await resp.writeFile(filename);
    return filename;
  }

  // ─── Sheet APIs ─────────────────────────────────────────────────────────────

  async function getSpreadsheetInfo (token: string): Promise<{ title: string; url?: string }> {
    const data = await call('getSpreadsheetInfo', () =>
      client.sheets.v3.spreadsheet.get({ path: { spreadsheet_token: token } }),
    );
    const spreadsheet = (data as any).spreadsheet ?? data;
    return { title: spreadsheet.title ?? '', url: spreadsheet.url };
  }

  async function listSheets (token: string): Promise<any[]> {
    const data = await call('listSheets', () =>
      client.sheets.v3.spreadsheetSheet.query({ path: { spreadsheet_token: token } }),
    );
    return (data as any).sheets ?? [];
  }

  async function getSheetMeta (token: string, sheetId: string): Promise<any> {
    const data = await call('getSheetMeta', () =>
      client.sheets.v3.spreadsheetSheet.get({
        path: { spreadsheet_token: token, sheet_id: sheetId },
      }),
    );
    return (data as any).sheet ?? data;
  }

  async function readSheetValues (
    token: string,
    range: string,
  ): Promise<any[][]> {
    // 使用 client.request 走 SDK 通用请求通道，确保自动附加 tenant_access_token 鉴权头
    const resp: any = await (client as any).request({
      url: `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${token}/values/${encodeURIComponent(range)}`,
      method: 'GET',
      params: {
        valueRenderOption: 'UnformattedValue',
        dateTimeRenderOption: 'FormattedString',
      },
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
    if (resp?.code !== 0) {
      throw new Error(`readSheetValues failed: [${resp?.code}] ${resp?.msg}`);
    }
    return resp.data?.valueRange?.values ?? [];
  }

  return {
    getWikiNodeInfo, getDocxDocument, getDocxBlocks, downloadImage, batchGetTmpDownloadUrl, getWhiteboardNodes,
    downloadWhiteboardAsImage, getSpreadsheetInfo, listSheets, getSheetMeta, readSheetValues,
  };
}

export type LarkClient = ReturnType<typeof createClient>;
