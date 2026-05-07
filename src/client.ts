import * as lark from '@larksuiteoapi/node-sdk';
import { LoggerLevel } from '@larksuiteoapi/node-sdk';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { DocInfo, DocxBlock, WhiteboardNode } from './types.js';

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const RATE_LIMIT_MAX_RETRIES = 3;
const RATE_LIMIT_RETRY_DELAY = 500;

export function createClient (appId: string, appSecret: string, loggerLevel: LoggerLevel = LoggerLevel.warn) {
  const client = new lark.Client({ appId, appSecret, loggerLevel });

  async function call<T> (name: string, fn: () => Promise<{ code?: number; msg?: string; data?: T }>): Promise<T> {
    for (let attempt = 0; attempt <= RATE_LIMIT_MAX_RETRIES; attempt++) {
      let res;
      try {
        res = await fn();
      } catch (e: any) {
        const code = e.response?.data?.code;
        const msg = e.response?.data?.msg;
        if (code === 99991400 && attempt < RATE_LIMIT_MAX_RETRIES) {
          await sleep(RATE_LIMIT_RETRY_DELAY * (attempt + 1));
          continue;
        }
        const error = e.response?.data?.error;
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
    throw new Error(`${name} failed: 频率限制重试次数已用尽`);
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

  /**
   * 分页获取文档所有块。
   * @param docToken
   * @param pageHandler 可选回调，每页 blocks 传入，返回 false 则提前终止分页。
   *                    不传时收集所有块后一次性返回。
   */
  async function getDocxBlocks (docToken: string, pageHandler?: (blocks: DocxBlock[]) => boolean): Promise<DocxBlock[]> {
    const allBlocks: DocxBlock[] = [];
    let pageToken: string | undefined;
    for (let i = 0; true ; i++) {
      if (i > 0) {
        // 单个应用调用频率上限为每秒 5 次
        await sleep(100);
      }
      const data = await call('getDocxBlocks', () =>
        client.docx.v1.documentBlock.list({
          path: { document_id: docToken },
          params: { page_size: 500, document_revision_id: -1, page_token: pageToken },
        }),
      );
      const items = (data.items ?? []) as DocxBlock[];
      if (pageHandler) {
        const shouldContinue = pageHandler(items);
        allBlocks.push(...items);
        if (!shouldContinue) break;
      } else {
        allBlocks.push(...items);
      }
      if (!data.has_more) break;
      pageToken = data.page_token;
    }
    return allBlocks;
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
      if (error.status === 401) {
        throw new Error(`下载图片[${imgToken}]异常, 检查是否有接口 https://open.feishu.cn/document/server-docs/docs/drive-v1/media/download 的权限`);
      }
      if (error.status === 403) {
        throw new Error(`下载图片[${imgToken}]异常, 应用的文档权限大于等于文档本身“谁可以创建副本、打印和下载”的权限`);
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
