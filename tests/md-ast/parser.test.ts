import { describe, it, expect } from 'vitest';
import { Parser } from '../../src/md-ast/parser.js';
import { registerBuiltinParsers } from '../../src/md-ast/parsers/index.js';
import { MdSerializer, registerBuiltinSerializers } from '../../src/md-ast/serializer.js';
import type { DocxBlock, DocInfo } from '../../src/types.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

function textRun (content: string, style?: any) {
  return { text_run: { content, text_element_style: style } };
}

function b (partial: Partial<DocxBlock>): DocxBlock {
  return partial as unknown as DocxBlock;
}

function buildParser (): Parser {
  const p = new Parser();
  registerBuiltinParsers(p);
  return p;
}

const doc: DocInfo = { documentId: 'root', title: 'Doc' };

// ─── Tests ─────────────────────────────────────────────────────────────────

describe('Parser - end-to-end', () => {
  it('parses a simple document with heading + paragraph', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, page: { elements: [textRun('Title')] }, children: ['h1', 'p1'] }),
      b({ block_id: 'h1', block_type: 3, parent_id: 'root', heading1: { elements: [textRun('Hello')] } }),
      b({ block_id: 'p1', block_type: 2, parent_id: 'root', text: { elements: [textRun('World')] } }),
    ];
    const ast = buildParser().parse(doc, blocks);
    expect(ast.type).toBe('page');
    if (ast.type !== 'page') return;
    expect(ast.title).toEqual([{ type: 'text', content: 'Title' }]);
    expect(ast.children).toHaveLength(2);
    expect(ast.children[0]).toMatchObject({ type: 'heading', level: 1 });
    expect(ast.children[1]).toMatchObject({ type: 'paragraph' });
  });

  it('parses all heading levels 1~9', () => {
    const children = Array.from({ length: 9 }, (_, i) => `h${i + 1}`);
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children }),
      ...children.map((id, i) => {
        const level = i + 1;
        return b({
          block_id: id,
          block_type: level + 2,
          parent_id: 'root',
          [`heading${level}`]: { elements: [textRun(`H${level}`)] },
        } as any);
      }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    for (let i = 0; i < 9; i++) {
      const node = ast.children[i];
      expect(node).toMatchObject({ type: 'heading', level: i + 1 });
    }
  });

  it('parses inline styles (bold/italic/underline/strikethrough/inlineCode/link)', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['p'] }),
      b({
        block_id: 'p',
        block_type: 2,
        parent_id: 'root',
        text: {
          elements: [
            textRun('bold', { bold: true }),
            textRun('italic', { italic: true }),
            textRun('strike', { strikethrough: true }),
            textRun('under', { underline: true }),
            textRun('code', { inline_code: true }),
            textRun('linked', { link: { url: 'https%3A%2F%2Fexample.com' } }),
          ],
        },
      }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    const p = ast.children[0];
    if (p?.type !== 'paragraph') throw new Error();
    expect(p.children).toMatchObject([
      { type: 'bold' },
      { type: 'italic' },
      { type: 'strikethrough' },
      { type: 'underline' },
      { type: 'inlineCode', content: 'code' },
      { type: 'link', url: 'https://example.com' },
    ]);
  });

  it('parses combined inline styles (bold + italic + link)', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['p'] }),
      b({
        block_id: 'p',
        block_type: 2,
        parent_id: 'root',
        text: { elements: [textRun('x', { bold: true, italic: true, link: { url: 'http%3A%2F%2Fa' } })] },
      }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    const p = ast.children[0];
    if (p?.type !== 'paragraph') throw new Error();
    // 包裹顺序：link → italic → bold（最外层）
    expect(p.children[0]).toMatchObject({
      type: 'bold',
      children: [{ type: 'italic', children: [{ type: 'link', url: 'http://a' }] }],
    });
  });

  it('parses mention_user and mention_doc', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['p'] }),
      b({
        block_id: 'p',
        block_type: 2,
        parent_id: 'root',
        text: {
          elements: [
            { mention_user: { user_id: 'U123' } },
            { mention_doc: { title: 'Doc', url: 'https%3A%2F%2Fd.com' } },
          ],
        } as any,
      }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    const p = ast.children[0];
    if (p?.type !== 'paragraph') throw new Error();
    expect(p.children).toMatchObject([
      { type: 'mentionUser', userId: 'U123' },
      { type: 'mentionDoc', title: 'Doc', url: 'https://d.com' },
    ]);
  });

  it('parses equation (inline when among others, block when only element)', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['eq1', 'eq2'] }),
      b({
        block_id: 'eq1',
        block_type: 16,
        parent_id: 'root',
        equation: { elements: [{ equation: { content: 'x+1\n' } }] } as any,
      }),
      b({
        block_id: 'eq2',
        block_type: 16,
        parent_id: 'root',
        equation: { elements: [textRun('prefix '), { equation: { content: 'y' } }] } as any,
      }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    const p1 = ast.children[0];
    const p2 = ast.children[1];
    if (p1?.type !== 'paragraph' || p2?.type !== 'paragraph') throw new Error();
    // 单元素 → 块级公式
    expect(p1.children[0]).toMatchObject({ type: 'equation', content: 'x+1', inline: false });
    // 多元素 → inline
    expect(p2.children[1]).toMatchObject({ type: 'equation', content: 'y', inline: true });
  });

  it('parses bullet list with nested children', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['b1'] }),
      b({
        block_id: 'b1',
        block_type: 12,
        parent_id: 'root',
        bullet: { elements: [textRun('item1')] },
        children: ['b2'],
      }),
      b({
        block_id: 'b2',
        block_type: 12,
        parent_id: 'b1',
        bullet: { elements: [textRun('nested')] },
      }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    const bullet = ast.children[0];
    if (bullet?.type !== 'bullet') throw new Error();
    expect(bullet.text).toMatchObject([{ type: 'text', content: 'item1' }]);
    expect(bullet.children[0]).toMatchObject({ type: 'bullet' });
  });

  it('parses ordered list with correct auto-increment order', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['o1', 'o2', 'o3'] }),
      b({ block_id: 'o1', block_type: 13, parent_id: 'root', ordered: { elements: [textRun('a')] } }),
      b({ block_id: 'o2', block_type: 13, parent_id: 'root', ordered: { elements: [textRun('b')] } }),
      b({ block_id: 'o3', block_type: 13, parent_id: 'root', ordered: { elements: [textRun('c')] } }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    expect((ast.children[0] as any).order).toBe(1);
    expect((ast.children[1] as any).order).toBe(2);
    expect((ast.children[2] as any).order).toBe(3);
  });

  it('ordered list restarts counter when preceded by non-ordered', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['p1', 'o1', 'o2'] }),
      b({ block_id: 'p1', block_type: 2, parent_id: 'root', text: { elements: [textRun('p')] } }),
      b({ block_id: 'o1', block_type: 13, parent_id: 'root', ordered: { elements: [textRun('a')] } }),
      b({ block_id: 'o2', block_type: 13, parent_id: 'root', ordered: { elements: [textRun('b')] } }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    expect((ast.children[1] as any).order).toBe(1);
    expect((ast.children[2] as any).order).toBe(2);
  });

  it('parses code block with language', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['c'] }),
      b({
        block_id: 'c',
        block_type: 14,
        parent_id: 'root',
        code: {
          elements: [textRun('const x = 1;')],
          style: { language: 63 }, // typescript
        } as any,
      }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    expect(ast.children[0]).toMatchObject({ type: 'codeBlock', lang: 'typescript', content: 'const x = 1;' });
  });

  it('parses code block with unknown language falls back to ""', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['c'] }),
      b({
        block_id: 'c',
        block_type: 14,
        parent_id: 'root',
        code: { elements: [textRun('x')], style: { language: 9999 } } as any,
      }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    expect((ast.children[0] as any).lang).toBe('');
  });

  it('parses todo (checked / unchecked)', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['t1', 't2'] }),
      b({
        block_id: 't1',
        block_type: 17,
        parent_id: 'root',
        todo: { elements: [textRun('done')], style: { done: true } } as any,
      }),
      b({
        block_id: 't2',
        block_type: 17,
        parent_id: 'root',
        todo: { elements: [textRun('undone')] } as any,
      }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    expect(ast.children[0]).toMatchObject({ type: 'todo', checked: true });
    expect(ast.children[1]).toMatchObject({ type: 'todo', checked: false });
  });

  it('parses callout (container with children)', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['co'] }),
      b({ block_id: 'co', block_type: 19, parent_id: 'root', children: ['cp'] }),
      b({ block_id: 'cp', block_type: 2, parent_id: 'co', text: { elements: [textRun('tip')] } }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    const callout = ast.children[0];
    expect(callout?.type).toBe('callout');
    if (callout?.type !== 'callout') return;
    expect(callout.children).toHaveLength(1);
  });

  it('parses divider', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['d'] }),
      b({ block_id: 'd', block_type: 22, parent_id: 'root' }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    expect(ast.children[0]).toEqual({ type: 'divider' });
  });

  it('parses image, sheet, whiteboard (leaf tokens)', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['img', 'sh', 'wb'] }),
      b({ block_id: 'img', block_type: 27, parent_id: 'root', image: { token: 'IMG_T' } as any }),
      b({ block_id: 'sh', block_type: 30, parent_id: 'root', sheet: { token: 'SHEET_T' } as any }),
      b({ block_id: 'wb', block_type: 43, parent_id: 'root', board: { token: 'BOARD_T' } as any }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    expect(ast.children[0]).toEqual({ type: 'image', alt: '图片-IMG_T', src: 'IMG_T' });
    expect(ast.children[1]).toEqual({ type: 'sheet', token: 'SHEET_T' });
    expect(ast.children[2]).toEqual({ type: 'whiteboard', token: 'BOARD_T' });
  });

  it('parses quote (inline) and quoteContainer (block)', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['q1', 'qc'] }),
      b({
        block_id: 'q1',
        block_type: 15,
        parent_id: 'root',
        quote: { elements: [textRun('inline quote')] } as any,
      }),
      b({ block_id: 'qc', block_type: 34, parent_id: 'root', children: ['qcp'] }),
      b({ block_id: 'qcp', block_type: 2, parent_id: 'qc', text: { elements: [textRun('container')] } }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    expect(ast.children[0]).toMatchObject({ type: 'quote' });
    expect(ast.children[1]).toMatchObject({ type: 'quote' });
  });

  it('parses grid (2 columns with children each)', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['g'] }),
      b({ block_id: 'g', block_type: 24, parent_id: 'root', children: ['col1', 'col2'] }),
      b({ block_id: 'col1', block_type: 25, parent_id: 'g', children: ['pa'] }),
      b({ block_id: 'col2', block_type: 25, parent_id: 'g', children: ['pb'] }),
      b({ block_id: 'pa', block_type: 2, parent_id: 'col1', text: { elements: [textRun('A')] } }),
      b({ block_id: 'pb', block_type: 2, parent_id: 'col2', text: { elements: [textRun('B')] } }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    const grid = ast.children[0];
    if (grid?.type !== 'grid') throw new Error();
    expect(grid.children).toHaveLength(2);
  });

  it('parses simple 2x2 table', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['tbl'] }),
      b({
        block_id: 'tbl',
        block_type: 31,
        parent_id: 'root',
        table: {
          property: { column_size: 2, row_size: 2 },
          cells: ['c00', 'c01', 'c10', 'c11'],
        } as any,
      }),
      b({ block_id: 'c00', block_type: 32, parent_id: 'tbl', children: ['t00'] }),
      b({ block_id: 'c01', block_type: 32, parent_id: 'tbl', children: ['t01'] }),
      b({ block_id: 'c10', block_type: 32, parent_id: 'tbl', children: ['t10'] }),
      b({ block_id: 'c11', block_type: 32, parent_id: 'tbl', children: ['t11'] }),
      b({ block_id: 't00', block_type: 2, parent_id: 'c00', text: { elements: [textRun('A')] } }),
      b({ block_id: 't01', block_type: 2, parent_id: 'c01', text: { elements: [textRun('B')] } }),
      b({ block_id: 't10', block_type: 2, parent_id: 'c10', text: { elements: [textRun('C')] } }),
      b({ block_id: 't11', block_type: 2, parent_id: 'c11', text: { elements: [textRun('D')] } }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    const table = ast.children[0];
    if (table?.type !== 'table') throw new Error();
    expect(table.rows).toHaveLength(2);
    expect(table.rows[0]!.cells).toHaveLength(2);
    expect(table.rows[0]!.cells[0]!.content[0]).toMatchObject({ type: 'text', content: 'A' });
  });

  it('parses table with merge (covered cells are skipped)', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['tbl'] }),
      b({
        block_id: 'tbl',
        block_type: 31,
        parent_id: 'root',
        table: {
          property: {
            column_size: 2,
            row_size: 2,
            merge_info: [
              { row_span: 1, col_span: 2 },
              { row_span: 1, col_span: 1 }, // covered
              { row_span: 1, col_span: 1 },
              { row_span: 1, col_span: 1 },
            ],
          },
          cells: ['c00', 'c01', 'c10', 'c11'],
        } as any,
      }),
      b({ block_id: 'c00', block_type: 32, parent_id: 'tbl', children: ['t00'] }),
      b({ block_id: 'c01', block_type: 32, parent_id: 'tbl', children: [] }),
      b({ block_id: 'c10', block_type: 32, parent_id: 'tbl', children: ['t10'] }),
      b({ block_id: 'c11', block_type: 32, parent_id: 'tbl', children: ['t11'] }),
      b({ block_id: 't00', block_type: 2, parent_id: 'c00', text: { elements: [textRun('A')] } }),
      b({ block_id: 't10', block_type: 2, parent_id: 'c10', text: { elements: [textRun('C')] } }),
      b({ block_id: 't11', block_type: 2, parent_id: 'c11', text: { elements: [textRun('D')] } }),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    const table = ast.children[0];
    if (table?.type !== 'table') throw new Error();
    // Row 0 should only have 1 cell (colspan=2)
    expect(table.rows[0]!.cells).toHaveLength(1);
    expect(table.rows[0]!.cells[0]!.colSpan).toBe(2);
    // Row 1 still has 2 cells
    expect(table.rows[1]!.cells).toHaveLength(2);
  });

  it('falls back to root-level blocks when documentId is missing', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'p1', block_type: 2, text: { elements: [textRun('orphan')] } }),
    ];
    const ast = buildParser().parse(doc, blocks);
    expect(ast.type).toBe('page');
    if (ast.type !== 'page') return;
    expect(ast.title).toEqual([]);
    expect(ast.children).toHaveLength(1);
  });

  it('unknown block_type yields null and is skipped', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, children: ['x'] }),
      b({ block_id: 'x', block_type: 999, parent_id: 'root' } as any),
    ];
    const ast = buildParser().parse(doc, blocks);
    if (ast.type !== 'page') throw new Error();
    expect(ast.children).toHaveLength(0);
  });

  // ─── Parser + Serializer integration ──────────────────────────────────────
  it('end-to-end: parse → serialize produces expected markdown', () => {
    const blocks: DocxBlock[] = [
      b({ block_id: 'root', block_type: 1, page: { elements: [textRun('My')] }, children: ['h', 'p', 'd'] }),
      b({ block_id: 'h', block_type: 4, parent_id: 'root', heading2: { elements: [textRun('Sub')] } }),
      b({ block_id: 'p', block_type: 2, parent_id: 'root', text: { elements: [textRun('hi')] } }),
      b({ block_id: 'd', block_type: 22, parent_id: 'root' }),
    ];
    const ast = buildParser().parse(doc, blocks);
    const s = new MdSerializer();
    registerBuiltinSerializers(s);
    const md = s.serialize(ast);
    expect(md).toContain('# My');
    expect(md).toContain('## Sub');
    expect(md).toContain('hi');
    expect(md).toContain('---');
  });
});
