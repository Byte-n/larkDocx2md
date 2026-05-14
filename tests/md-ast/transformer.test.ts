import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { MdTransformer } from '../../src/md-ast/transformer.js';
import type { MdBlockNode } from '../../src/md-ast/types.js';
import type { ConvertOptions } from '../../src/types.js';
import type { LarkClient } from '../../src/client.js';

// ─── helpers ─────────────────────────────────────────────────────────────

function makeOpts (overrides: Partial<ConvertOptions> = {}): ConvertOptions {
  return {
    appId: 'x',
    appSecret: 'x',
    url: 'https://example.com/docx/TOK',
    output: '/tmp/not-used',
    imageMode: 'online',
    wbImageMode: 'online',
    wbBg: 'none',
    wbFormat: 'svg',
    ...overrides,
  };
}

/** 极简 mock client，按需覆盖单个方法 */
function mockClient (overrides: Partial<LarkClient> = {}): LarkClient {
  const base: any = {
    getWikiNodeInfo: vi.fn(),
    getDocxDocument: vi.fn(),
    getDocxBlocks: vi.fn(),
    batchGetTmpDownloadUrl: vi.fn().mockResolvedValue({}),
    downloadImage: vi.fn(),
    getWhiteboardNodes: vi.fn().mockResolvedValue([]),
    downloadWhiteboardAsImage: vi.fn(),
    getSpreadsheetInfo: vi.fn(),
    listSheets: vi.fn(),
    getSheetMeta: vi.fn(),
    readSheetValues: vi.fn(),
  };
  return { ...base, ...overrides } as LarkClient;
}

// ─── image resolution ────────────────────────────────────────────────────

describe('MdTransformer - image resolution (online)', () => {
  it('resolves image src via batchGetTmpDownloadUrl', async () => {
    const client = mockClient({
      batchGetTmpDownloadUrl: vi.fn().mockResolvedValue({
        TOK1: 'https://cdn/1.png',
        TOK2: 'https://cdn/2.png',
      }),
    } as any);
    const tr = new MdTransformer(client, makeOpts({ imageMode: 'online' }));

    const ast: MdBlockNode = {
      type: 'page',
      title: [],
      children: [
        { type: 'image', alt: 'a', src: 'TOK1' },
        { type: 'image', alt: 'b', src: 'TOK2' },
      ],
    };
    await tr.transform(ast);
    const images = (ast.type === 'page' ? ast.children : []) as any[];
    expect(images[0].src).toBe('https://cdn/1.png');
    expect(images[1].src).toBe('https://cdn/2.png');
  });

  it('deduplicates tokens and batches by 5', async () => {
    const batchFn = vi.fn().mockResolvedValue({});
    const client = mockClient({ batchGetTmpDownloadUrl: batchFn } as any);
    const tr = new MdTransformer(client, makeOpts({ imageMode: 'online' }));
    const tokens = Array.from({ length: 12 }, (_, i) => `T${i}`);
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [
        ...tokens.map(t => ({ type: 'image' as const, alt: '', src: t })),
        // 重复 token 不再触发额外调用
        { type: 'image', alt: '', src: 'T0' },
      ],
    };
    await tr.transform(ast);
    expect(batchFn).toHaveBeenCalledTimes(3); // 12 tokens / 5 = 3 batches (5,5,2)
  });

  it('agent=stdout forces online mode', async () => {
    const batchFn = vi.fn().mockResolvedValue({ T: 'https://cdn/t' });
    const client = mockClient({ batchGetTmpDownloadUrl: batchFn } as any);
    const tr = new MdTransformer(client, makeOpts({ imageMode: 'local', agent: 'stdout' }));
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'image', alt: '', src: 'T' }],
    };
    await tr.transform(ast);
    expect(batchFn).toHaveBeenCalled();
    const img = (ast as any).children[0];
    expect(img.src).toBe('https://cdn/t');
  });
});

describe('MdTransformer - image resolution (local)', () => {
  let tmpDir: string;
  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tr-'));
  });
  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('downloads images and rewrites src to relative path', async () => {
    const downloadImage = vi.fn().mockImplementation(async (token: string, outDir: string) => {
      fs.mkdirSync(outDir, { recursive: true });
      const p = path.join(outDir, `${token}.png`);
      fs.writeFileSync(p, 'fake');
      return p;
    });
    const client = mockClient({ downloadImage } as any);
    const tr = new MdTransformer(client, makeOpts({ imageMode: 'local', output: tmpDir }));

    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'image', alt: '', src: 'IMG1' }],
    };
    await tr.transform(ast);
    expect(downloadImage).toHaveBeenCalledWith('IMG1', path.join(tmpDir, 'static'));
    const img = (ast as any).children[0];
    expect(img.src).toBe(path.join('static', 'IMG1.png'));
  });
});

// ─── whiteboard resolution ──────────────────────────────────────────────

describe('MdTransformer - whiteboard SVG resolution', () => {
  let tmpDir: string;
  beforeEach(() => { tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-')); });
  afterEach(() => { fs.rmSync(tmpDir, { recursive: true, force: true }); });

  it('writes whiteboard SVG to static/ and replaces node with image', async () => {
    const client = mockClient({
      getWhiteboardNodes: vi.fn().mockResolvedValue([]),
    } as any);
    const tr = new MdTransformer(client, makeOpts({ wbFormat: 'svg', output: tmpDir }));

    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'whiteboard', token: 'WB1' }],
    };
    await tr.transform(ast);
    const replaced = (ast as any).children[0];
    expect(replaced.type).toBe('image');
    expect(replaced.src).toBe(path.join('static', 'WB1.svg'));
    // 文件真的写入了
    expect(fs.existsSync(path.join(tmpDir, 'static', 'WB1.svg'))).toBe(true);
  });

  it('base64 format inlines SVG as data URI', async () => {
    const client = mockClient() as any;
    const tr = new MdTransformer(client, makeOpts({ wbFormat: 'base64' }));
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'whiteboard', token: 'WB2' }],
    };
    await tr.transform(ast);
    const replaced = (ast as any).children[0];
    expect(replaced.type).toBe('image');
    expect(replaced.src).toMatch(/^data:image\/svg\+xml;base64,/);
  });

  it('inline-svg format converts node to html', async () => {
    const client = mockClient() as any;
    const tr = new MdTransformer(client, makeOpts({ wbFormat: 'inline-svg' }));
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'whiteboard', token: 'WB3' }],
    };
    await tr.transform(ast);
    const replaced = (ast as any).children[0];
    expect(replaced.type).toBe('html');
    expect(replaced.content).toContain('<svg');
  });

  it('gracefully handles whiteboard fetch errors', async () => {
    const client = mockClient({
      getWhiteboardNodes: vi.fn().mockRejectedValue(new Error('fail')),
    } as any);
    const tr = new MdTransformer(client, makeOpts({ wbFormat: 'svg' }));
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'whiteboard', token: 'WB4' }],
    };
    // 不应抛错
    await expect(tr.transform(ast)).resolves.toBeUndefined();
    // 失败时节点不被替换
    const node = (ast as any).children[0];
    expect(node.type).toBe('whiteboard');
  });
});

describe('MdTransformer - whiteboard YAML resolution', () => {
  it('renders whiteboard as yaml codeBlock', async () => {
    const client = mockClient({
      getWhiteboardNodes: vi.fn().mockResolvedValue([
        { id: 'n1', type: 'text_shape', x: 0, y: 0, width: 100, height: 40, text: { text: 'hi' } } as any,
      ]),
    } as any);
    const tr = new MdTransformer(client, makeOpts({ wbFormat: 'yaml' }));
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'whiteboard', token: 'WB_Y' }],
    };
    await tr.transform(ast);
    const replaced = (ast as any).children[0];
    expect(replaced.type).toBe('codeBlock');
    expect(replaced.lang).toBe('yaml');
    expect(replaced.content).toContain('hi');
  });

  it('yaml mode with wbImageMode=base64 falls back to online', async () => {
    const batchFn = vi.fn().mockResolvedValue({ IMG: 'https://cdn/img' });
    const client = mockClient({
      getWhiteboardNodes: vi.fn().mockResolvedValue([
        { id: 'i1', type: 'image', x: 0, y: 0, width: 50, height: 50, image: { token: 'IMG' } } as any,
      ]),
      batchGetTmpDownloadUrl: batchFn,
    } as any);
    const tr = new MdTransformer(client, makeOpts({ wbFormat: 'yaml', wbImageMode: 'base64' }));
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'whiteboard', token: 'WB_Y2' }],
    };
    await tr.transform(ast);
    // 回退到 online：调用了 batchGetTmpDownloadUrl
    expect(batchFn).toHaveBeenCalled();
    const replaced = (ast as any).children[0];
    expect(replaced.content).toContain('https://cdn/img');
  });
});

// ─── sheet resolution ───────────────────────────────────────────────────

describe('MdTransformer - sheet resolution', () => {
  it('resolves sheet by reading values and expanding merges', async () => {
    const getSpreadsheetInfo = vi.fn().mockResolvedValue({ title: 'My Sheet' });
    const listSheets = vi.fn().mockResolvedValue([
      { sheet_id: 'SID', title: 'Sheet1', resource_type: 'sheet', hidden: false },
    ]);
    const getSheetMeta = vi.fn().mockResolvedValue({
      grid_properties: { row_count: 2, column_count: 2 },
      merges: [],
    });
    const readSheetValues = vi.fn().mockResolvedValue([
      ['A', 'B'],
      ['1', '2'],
    ]);
    const client = mockClient({
      getSpreadsheetInfo, listSheets, getSheetMeta, readSheetValues,
    } as any);
    const tr = new MdTransformer(client, makeOpts());
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'sheet', token: 'TOK_SID' }],
    };
    await tr.transform(ast);
    const resolved = (ast as any).children[0];
    expect(resolved.type).toBe('sheetResolved');
    expect(resolved.title).toBe('My Sheet');
    expect(resolved.sheets).toHaveLength(1);
    expect(resolved.sheets[0].rows).toEqual([['A', 'B'], ['1', '2']]);
  });

  it('marks non-sheet resource types (bitable) as skipped', async () => {
    const client = mockClient({
      getSpreadsheetInfo: vi.fn().mockResolvedValue({ title: '' }),
      listSheets: vi.fn().mockResolvedValue([
        { sheet_id: 'SID', title: 'Bi', resource_type: 'bitable' },
      ]),
    } as any);
    const tr = new MdTransformer(client, makeOpts());
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'sheet', token: 'TOK_SID' }],
    };
    await tr.transform(ast);
    const resolved = (ast as any).children[0];
    expect(resolved.sheets[0].error).toContain('非网格表(bitable)');
  });

  it('marks empty grid as no rows', async () => {
    const client = mockClient({
      getSpreadsheetInfo: vi.fn().mockResolvedValue({ title: '' }),
      listSheets: vi.fn().mockResolvedValue([
        { sheet_id: 'SID', resource_type: 'sheet' },
      ]),
      getSheetMeta: vi.fn().mockResolvedValue({
        grid_properties: { row_count: 0, column_count: 0 },
      }),
    } as any);
    const tr = new MdTransformer(client, makeOpts());
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'sheet', token: 'TOK_SID' }],
    };
    await tr.transform(ast);
    const resolved = (ast as any).children[0];
    expect(resolved.sheets[0].rows).toEqual([]);
  });

  it('captures readSheetValues errors per-sheet', async () => {
    const client = mockClient({
      getSpreadsheetInfo: vi.fn().mockResolvedValue({ title: '' }),
      listSheets: vi.fn().mockResolvedValue([
        { sheet_id: 'SID', resource_type: 'sheet' },
      ]),
      getSheetMeta: vi.fn().mockResolvedValue({
        grid_properties: { row_count: 1, column_count: 1 },
      }),
      readSheetValues: vi.fn().mockRejectedValue(new Error('no perm')),
    } as any);
    const tr = new MdTransformer(client, makeOpts());
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'sheet', token: 'TOK_SID' }],
    };
    await tr.transform(ast);
    const resolved = (ast as any).children[0];
    expect(resolved.sheets[0].error).toContain('读取失败');
  });

  it('skips hidden sheets', async () => {
    const getSheetMeta = vi.fn();
    const client = mockClient({
      getSpreadsheetInfo: vi.fn().mockResolvedValue({ title: '' }),
      listSheets: vi.fn().mockResolvedValue([
        { sheet_id: 'SID', hidden: true },
      ]),
      getSheetMeta,
    } as any);
    const tr = new MdTransformer(client, makeOpts());
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'sheet', token: 'TOK_SID' }],
    };
    await tr.transform(ast);
    expect(getSheetMeta).not.toHaveBeenCalled();
  });

  it('catches top-level sheet failure and yields empty sheetResolved', async () => {
    const client = mockClient({
      getSpreadsheetInfo: vi.fn().mockRejectedValue(new Error('boom')),
    } as any);
    const tr = new MdTransformer(client, makeOpts());
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'sheet', token: 'TOK_SID' }],
    };
    await expect(tr.transform(ast)).resolves.toBeUndefined();
    const resolved = (ast as any).children[0];
    expect(resolved.type).toBe('sheetResolved');
    expect(resolved.sheets).toEqual([]);
  });

  it('sheet source type includes all non-hidden sheets when sheetId omitted', async () => {
    const getSheetMeta = vi.fn().mockResolvedValue({
      grid_properties: { row_count: 1, column_count: 1 },
    });
    const readSheetValues = vi.fn().mockResolvedValue([['x']]);
    const client = mockClient({
      getSpreadsheetInfo: vi.fn().mockResolvedValue({ title: 'S' }),
      listSheets: vi.fn().mockResolvedValue([
        { sheet_id: 's1', title: 'A', resource_type: 'sheet' },
        { sheet_id: 's2', title: 'B', resource_type: 'sheet' },
      ]),
      getSheetMeta,
      readSheetValues,
    } as any);
    const tr = new MdTransformer(client, makeOpts(), 'sheet');
    // token 没有下划线 → sheetId undefined，sheet 模式下处理所有
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'sheet', token: 'ONLYTOK' }],
    };
    await tr.transform(ast);
    const resolved = (ast as any).children[0];
    expect(resolved.sheets).toHaveLength(2);
  });
});

// ─── token collection / deep traversal ─────────────────────────────────

describe('MdTransformer - deep AST traversal', () => {
  it('finds tokens in nested containers (bullet > quote > image)', async () => {
    const batchFn = vi.fn().mockResolvedValue({ NESTED: 'https://cdn/nested' });
    const client = mockClient({ batchGetTmpDownloadUrl: batchFn } as any);
    const tr = new MdTransformer(client, makeOpts());

    const imageNode: any = { type: 'image', alt: '', src: 'NESTED' };
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{
        type: 'bullet',
        text: [],
        children: [{
          type: 'quote',
          children: [imageNode],
        }],
      }],
    };
    await tr.transform(ast);
    expect(imageNode.src).toBe('https://cdn/nested');
  });

  it('does nothing when AST has no image/whiteboard/sheet', async () => {
    const client = mockClient() as any;
    const tr = new MdTransformer(client, makeOpts());
    const ast: MdBlockNode = {
      type: 'page', title: [],
      children: [{ type: 'paragraph', children: [{ type: 'text', content: 'hi' }] }],
    };
    await tr.transform(ast);
    // batchGetTmpDownloadUrl 不应被调用
    expect(client.batchGetTmpDownloadUrl).not.toHaveBeenCalled();
  });
});
