import * as fs from 'node:fs';
import * as path from 'node:path';
import type { LarkClient } from '../client.js';
import type { ConvertOptions, WbImageMode } from '../types.js';
import { whiteboardNodesToSvg } from '../whiteboard/index.js';
import { whiteboardNodesToYaml } from '../whiteboard/yaml/index.js';
import { filterNodes } from '../whiteboard/utils.js';
import { cellToMd, expandMerges, trimTrailingEmpty, columnIndexToLetter } from '../sheet/index.js';
import type { ResolvedSheet } from '../sheet/index.js';
import { createLogger } from '../logger.js';
import type { MdBlockNode } from './types.js';

const logger = createLogger('transformer');

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export type DocSourceType = 'docx' | 'sheet';

export class MdTransformer {
  constructor (
    private client: LarkClient,
    private opts: ConvertOptions,
    private sourceType: DocSourceType = 'docx',
  ) {}

  async transform (ast: MdBlockNode): Promise<void> {
    // 1. Collect tokens
    const { imageTokens, whiteboardTokens, sheetRefs } = collectTokens(ast);

    // 2. Resolve images
    const imageMap = await this.resolveImages(imageTokens);

    // 3. Resolve whiteboards
    const whiteboardMap = await this.resolveWhiteboards(whiteboardTokens);

    // 4. Resolve sheets
    const sheetMap = await this.resolveSheets(sheetRefs);

    // 5. Replace in AST
    replaceInAst(ast, imageMap, whiteboardMap, sheetMap);
  }

  // ─── Image Resolution ──────────────────────────────────────────────────────

  private async resolveImages (tokens: string[]): Promise<Map<string, string>> {
    const map = new Map<string, string>();
    const uniqueTokens = [...new Set(tokens)];
    if (uniqueTokens.length === 0) return map;

    if (this.opts.imageMode === 'online' || this.opts.agent === 'stdout') {
      for (let i = 0; i < uniqueTokens.length; i += 5) {
        const batch = uniqueTokens.slice(i, i + 5);
        const urlMap = await this.client.batchGetTmpDownloadUrl(batch);
        for (const token of batch) {
          const url = urlMap[token];
          if (url) {
            map.set(token, url);
            logger.info('Resolved image URL:', token);
          }
        }
      }
    } else {
      // local
      const imgDir = path.join(this.opts.output, 'static');
      for (const token of uniqueTokens) {
        let localPath = await this.client.downloadImage(token, imgDir);
        localPath = path.relative(this.opts.output, localPath);
        map.set(token, localPath);
        logger.info('Downloaded image:', localPath);
      }
    }
    return map;
  }

  // ─── Whiteboard Resolution ─────────────────────────────────────────────────

  private async resolveWhiteboards (tokens: string[]): Promise<Map<string, MdBlockNode>> {
    const map = new Map<string, MdBlockNode>();
    for (const token of tokens) {
      try {
        logger.info('Fetching whiteboard nodes:', token);
        const wbNodes = await this.client.getWhiteboardNodes(token);
        logger.info(`Whiteboard ${token}: ${wbNodes.length} nodes`);

        let node: MdBlockNode;
        if (this.opts.wbFormat === 'yaml') {
          node = await this.processWhiteboardYaml(token, wbNodes);
        } else {
          node = await this.processWhiteboardSvg(token, wbNodes);
        }
        map.set(token, node);
      } catch (e: any) {
        logger.warn(`Failed to render whiteboard ${token}:`, e.message);
      }
    }
    return map;
  }

  private async processWhiteboardSvg (
    token: string,
    wbNodes: import('../types.js').WhiteboardNode[],
  ): Promise<MdBlockNode> {
    const effectiveNodes = this.opts.wbFormat === 'inline-svg'
      ? filterNodes(wbNodes, n => n.type !== 'paint' && n.type !== 'svg')
      : wbNodes;

    let svgContent = whiteboardNodesToSvg(effectiveNodes, this.opts.wbBg);

    // Resolve images inside SVG
    const imgTokens = effectiveNodes
      .filter(n => n.type === 'image' && n.image?.token)
      .map(n => n.image!.token!);
    if (imgTokens.length > 0) {
      svgContent = await this.resolveSvgImages(svgContent, imgTokens);
    }

    if (this.opts.wbFormat === 'base64') {
      return {
        type: 'image',
        alt: `画板-${token}`,
        src: `data:image/svg+xml;base64,${Buffer.from(svgContent).toString('base64')}`,
      };
    } else if (this.opts.wbFormat === 'svg') {
      const svgDir = path.join(this.opts.output, 'static');
      fs.mkdirSync(svgDir, { recursive: true });
      const svgPath = path.join(svgDir, `${token}.svg`);
      fs.writeFileSync(svgPath, svgContent);
      const relPath = path.relative(this.opts.output, svgPath);
      logger.info('Generated whiteboard SVG:', relPath);
      return {
        type: 'image',
        alt: `画板-${token}`,
        src: relPath,
      };
    } else {
      // inline-svg
      return {
        type: 'html',
        content: svgContent,
      };
    }
  }

  private async processWhiteboardYaml (
    token: string,
    wbNodes: import('../types.js').WhiteboardNode[],
  ): Promise<MdBlockNode> {
    const { yaml: yamlContent, imageTokens } = whiteboardNodesToYaml(wbNodes);
    let resolvedYaml = yamlContent;

    let effectiveMode: WbImageMode = this.opts.wbImageMode;
    if (effectiveMode === 'base64') {
      logger.warn('YAML mode does not support base64 image embedding, falling back to online mode');
      effectiveMode = 'online';
    }

    if (imageTokens.length > 0) {
      resolvedYaml = await this.resolveYamlImages(resolvedYaml, imageTokens, effectiveMode);
    }

    return {
      type: 'codeBlock',
      lang: 'yaml',
      content: resolvedYaml,
    };
  }

  // ─── SVG Image Resolution ──────────────────────────────────────────────────

  private async resolveSvgImages (svgContent: string, imgTokens: string[]): Promise<string> {
    const mode: WbImageMode = this.opts.wbImageMode ?? 'online';
    if (mode === 'online') {
      for (let i = 0; i < imgTokens.length; i += 5) {
        const batch = imgTokens.slice(i, i + 5);
        const urlMap = await this.client.batchGetTmpDownloadUrl(batch);
        for (const token of batch) {
          const onlineUrl = urlMap[token];
          if (onlineUrl) {
            svgContent = svgContent.split(`href="${token}"`).join(`href="${onlineUrl}"`);
            logger.info('Replaced whiteboard image with online URL:', token);
          }
        }
      }
    } else {
      const imgDir = path.join(this.opts.output, 'static');
      for (const token of imgTokens) {
        const localPath = await this.client.downloadImage(token, imgDir);
        if (mode === 'base64') {
          const buf = fs.readFileSync(localPath);
          const ext = path.extname(localPath).slice(1);
          const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
          const dataUri = `data:${mime};base64,${buf.toString('base64')}`;
          svgContent = svgContent.split(`href="${token}"`).join(`href="${dataUri}"`);
          logger.info('Embedded whiteboard image as base64:', token);
        } else {
          const relPath = path.basename(localPath);
          svgContent = svgContent.split(`href="${token}"`).join(`href="${relPath}"`);
          logger.info('Replaced whiteboard image with local path:', relPath);
        }
      }
    }
    return svgContent;
  }

  // ─── YAML Image Resolution ─────────────────────────────────────────────────

  private async resolveYamlImages (
    yamlContent: string,
    imgTokens: string[],
    mode: 'online' | 'local',
  ): Promise<string> {
    if (mode === 'online') {
      for (let i = 0; i < imgTokens.length; i += 5) {
        const batch = imgTokens.slice(i, i + 5);
        const urlMap = await this.client.batchGetTmpDownloadUrl(batch);
        for (const token of batch) {
          const onlineUrl = urlMap[token];
          if (onlineUrl) {
            yamlContent = yamlContent.split(token).join(onlineUrl);
            logger.info('Replaced YAML image token with online URL:', token);
          }
        }
      }
    } else {
      const imgDir = path.join(this.opts.output, 'static');
      for (const token of imgTokens) {
        const localPath = await this.client.downloadImage(token, imgDir);
        const relPath = path.relative(this.opts.output, localPath);
        yamlContent = yamlContent.split(token).join(relPath);
        logger.info('Replaced YAML image token with local path:', relPath);
      }
    }
    return yamlContent;
  }

  // ─── Sheet Resolution ─────────────────────────────────────────────────────────

  private async resolveSheets (refs: SheetRef[]): Promise<Map<string, MdBlockNode>> {
    const map = new Map<string, MdBlockNode>();
    const uniqueRefs = refs.filter((r, i, arr) => arr.findIndex(x => x.raw === r.raw) === i);
    if (uniqueRefs.length === 0) return map;

    for (const { raw, spreadsheetToken, sheetId } of uniqueRefs) {
      if (!spreadsheetToken) continue;
      try {
      const info = await this.client.getSpreadsheetInfo(spreadsheetToken);
      const list = await this.client.listSheets(spreadsheetToken);
      const sheetsToProcess = this.sourceType === 'sheet' && !sheetId
        ? list
        : list.filter(s => s.sheet_id === sheetId);
      const resolved: ResolvedSheet[] = [];

      for (const s of sheetsToProcess) {
        if (s.hidden) continue;
        if (s.resource_type && s.resource_type !== 'sheet') {
          resolved.push({
            title: s.title ?? '', kind: 'bitable', rows: [],
            error: `非网格表(${s.resource_type})，已跳过`,
          });
          continue;
        }
        try {
          const meta = await this.client.getSheetMeta(spreadsheetToken, s.sheet_id!);
          const { row_count = 0, column_count = 0 } = meta.grid_properties ?? {};
          if (!row_count || !column_count) {
            resolved.push({ title: s.title ?? '', kind: 'grid', rows: [] });
            continue;
          }
          const endCol = columnIndexToLetter(column_count);
          const values = await this.client.readSheetValues(
            spreadsheetToken, `${s.sheet_id}!A1:${endCol}${row_count}`,
          );
          const flat = (values ?? []).map((row: any[]) => row.map(cellToMd));
          const expanded = expandMerges(flat, meta.merges ?? []);
          const trimmed = trimTrailingEmpty(expanded);
          resolved.push({ title: s.title ?? '', kind: 'grid', rows: trimmed });
        } catch (e: any) {
          resolved.push({
            title: s.title ?? '', kind: 'grid', rows: [],
            error: `读取失败：${e.message}`,
          });
        } finally {
          await sleep(300);
        }
      }
      map.set(raw, {
        type: 'sheetResolved',
        title: info.title ?? '',
        sheets: resolved,
      });
      } catch (e: any) {
        logger.warn(`Failed to resolve sheet ${raw}:`, e.message);
        map.set(raw, { type: 'sheetResolved', title: '', sheets: [] });
      }
    }
    return map;
  }
}

// ─── AST Traversal Utilities ─────────────────────────────────────────────────

interface SheetRef {
  /** 原始 token（SpreadsheetToken_SheetID），用于 AST 匹配 */
  raw: string;
  /** 电子表格 token */
  spreadsheetToken: string;
  /** 工作表 ID（可选） */
  sheetId?: string;
}

function collectTokens (node: MdBlockNode) {
  const imageTokens: string[] = [];
  const whiteboardTokens: string[] = [];
  const sheetRefs: SheetRef[] = [];
  traverseBlockAst(node, n => {
    switch (n.type) {
      case 'image':
        imageTokens.push(n.src);
        break;
      case 'whiteboard':
        whiteboardTokens.push(n.token);
        break;
      case 'sheet': {
        // token 格式为 SpreadsheetToken_SheetID，以最后一个下划线拆分
        const lastIdx = n.token.lastIndexOf('_');
        const spreadsheetToken = lastIdx > 0 ? n.token.slice(0, lastIdx) : n.token;
        const sheetId = lastIdx > 0 ? n.token.slice(lastIdx + 1) : undefined;
        sheetRefs.push({ raw: n.token, spreadsheetToken, sheetId });
        break;
      }
    }
  });
  return { imageTokens, whiteboardTokens, sheetRefs };
}

function replaceInAst (
  node: MdBlockNode,
  imageMap: Map<string, string>,
  whiteboardMap: Map<string, MdBlockNode>,
  sheetMap: Map<string, MdBlockNode>,
): void {
  if (node.type === 'image') {
    const newSrc = imageMap.get(node.src);
    if (newSrc) {
      (node as MdBlockNode & { src: string }).src = newSrc;
    }
    return;
  }

  if (!hasBlockChildren(node)) return;

  const children = node.children as MdBlockNode[];
  for (let i = 0; i < children.length; i++) {
    const child = children[i]!;
    if (child.type === 'whiteboard') {
      const replacement = whiteboardMap.get(child.token);
      if (replacement) {
        children[i] = replacement;
        continue;
      }
    }
    if (child.type === 'sheet') {
      const replacement = sheetMap.get(child.token);
      if (replacement) {
        children[i] = replacement;
        continue;
      }
    }
    if (child.type === 'image') {
      const newSrc = imageMap.get(child.src);
      if (newSrc) {
        (child as MdBlockNode & { src: string }).src = newSrc;
      }
    }
    replaceInAst(child, imageMap, whiteboardMap, sheetMap);
  }
}

function traverseBlockAst (node: MdBlockNode, visitor: (node: MdBlockNode) => void): void {
  visitor(node);
  if (!hasBlockChildren(node)) return;
  for (const child of (node.children as MdBlockNode[])) {
    traverseBlockAst(child, visitor);
  }
}

function hasBlockChildren (node: MdBlockNode): node is Extract<
  MdBlockNode,
  { type: 'page' | 'bullet' | 'ordered' | 'callout' | 'quote' | 'grid' }
> {
  return (
    node.type === 'page' ||
    node.type === 'bullet' ||
    node.type === 'ordered' ||
    node.type === 'callout' ||
    node.type === 'quote' ||
    node.type === 'grid'
  );
}
