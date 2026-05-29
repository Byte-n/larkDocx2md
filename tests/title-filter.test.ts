import { describe, it, expect } from 'vitest';
import {
  createHeadingCollector,
  createTitleBlockIdFilter,
  createTitleFilter,
  extractHeadingText,
  getHeadingLevel,
} from '../src/lib/title-filter.js';
import type { DocxBlock } from '../src/lib/types.js';

// ─── Helper: 创建模拟 DocxBlock ─────────────────────────────────────────────

function makeHeadingBlock (level: number, text: string, id = 'blk'): DocxBlock {
  const headingKey = `heading${level}`;
  return {
    block_id: id,
    block_type: level + 2, // heading1=3, heading2=4, ...
    [headingKey]: { elements: [{ text_run: { content: text } }] },
  } as unknown as DocxBlock;
}

function makeTextBlock (id = 'txt'): DocxBlock {
  return {
    block_id: id,
    block_type: 2, // text block
    text: { elements: [{ text_run: { content: 'some text' } }] },
  } as unknown as DocxBlock;
}

function makePageBlock (id = 'page'): DocxBlock {
  return { block_id: id, block_type: 1 } as unknown as DocxBlock;
}

// ─── getHeadingLevel ────────────────────────────────────────────────────────

describe('getHeadingLevel', () => {
  it('returns level for heading blocks (block_type 3~11)', () => {
    expect(getHeadingLevel({ block_type: 3 } as DocxBlock)).toBe(1);
    expect(getHeadingLevel({ block_type: 5 } as DocxBlock)).toBe(3);
    expect(getHeadingLevel({ block_type: 11 } as DocxBlock)).toBe(9);
  });

  it('returns null for non-heading blocks', () => {
    expect(getHeadingLevel({ block_type: 1 } as DocxBlock)).toBeNull();
    expect(getHeadingLevel({ block_type: 2 } as DocxBlock)).toBeNull();
    expect(getHeadingLevel({ block_type: 12 } as DocxBlock)).toBeNull();
  });
});

// ─── extractHeadingText ─────────────────────────────────────────────────────

describe('extractHeadingText', () => {
  it('extracts and trims heading text', () => {
    expect(extractHeadingText(makeHeadingBlock(1, '  Hello World  '))).toBe('Hello World');
  });

  it('joins multiple elements', () => {
    const block = {
      block_id: 'b',
      block_type: 3,
      heading1: { elements: [{ text_run: { content: 'Hello ' } }, { text_run: { content: 'World' } }] },
    } as unknown as DocxBlock;
    expect(extractHeadingText(block)).toBe('Hello World');
  });

  it('returns null for non-heading block', () => {
    expect(extractHeadingText(makeTextBlock())).toBeNull();
  });
});

// ─── createTitleFilter ──────────────────────────────────────────────────────

describe('createTitleFilter', () => {
  it('collects matching heading and its children', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'Target' });

    const blocks = [
      makeHeadingBlock(1, 'Intro'),
      makeTextBlock('t1'),
      makeHeadingBlock(1, 'Target'),
      makeTextBlock('t2'),
      makeTextBlock('t3'),
      makeHeadingBlock(1, 'Next Section'),
    ];

    pageHandler(blocks);
    const result = getResult();
    expect(result.matched).toBe(true);
    expect(result.blocks).toHaveLength(3); // heading + t2 + t3
    expect(result.blocks[0]).toBe(blocks[2]); // Target heading
  });

  it('stops collecting at same-level heading', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'A' });

    pageHandler([
      makeHeadingBlock(2, 'A'),
      makeTextBlock('child1'),
      makeHeadingBlock(2, 'B'), // same level → stop
      makeTextBlock('child2'),
    ]);

    const result = getResult();
    expect(result.matched).toBe(true);
    expect(result.blocks).toHaveLength(2); // A heading + child1
  });

  it('stops collecting at higher-level heading', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'Sub' });

    pageHandler([
      makeHeadingBlock(2, 'Sub'),
      makeTextBlock('c1'),
      makeHeadingBlock(1, 'Top'), // higher level → stop
    ]);

    const result = getResult();
    expect(result.blocks).toHaveLength(2);
  });

  it('includes lower-level headings as children', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'Parent' });

    pageHandler([
      makeHeadingBlock(1, 'Parent'),
      makeHeadingBlock(2, 'Child'),
      makeTextBlock('t1'),
      makeHeadingBlock(1, 'Sibling'),
    ]);

    const result = getResult();
    expect(result.blocks).toHaveLength(3); // Parent + Child heading + t1
  });

  it('always keeps page blocks', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'X' });

    pageHandler([makePageBlock(), makeHeadingBlock(1, 'X'), makeTextBlock()]);

    const result = getResult();
    expect(result.blocks[0]!.block_type).toBe(1); // page block
  });

  it('returns false from pageHandler when done', () => {
    const { pageHandler } = createTitleFilter({ title: 'A' });

    const cont = pageHandler([
      makeHeadingBlock(1, 'A'),
      makeHeadingBlock(1, 'B'),
    ]);
    expect(cont).toBe(false);
  });

  it('returns matched=false when title not found', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'Missing' });

    pageHandler([makeHeadingBlock(1, 'Something')]);
    expect(getResult().matched).toBe(false);
  });

  it('collects all scanned headings into availableHeadings when not matched (no dedupe, in order)', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'Missing' });

    pageHandler([
      makeHeadingBlock(1, 'Intro'),
      makeTextBlock('t1'),
      makeHeadingBlock(2, 'Section A'),
      makeHeadingBlock(3, 'Section A'), // 重复文本但 level 不同
      makeHeadingBlock(2, 'Section A'), // 完全重复
      makeHeadingBlock(1, 'Outro'),
    ]);

    const result = getResult();
    expect(result.matched).toBe(false);
    expect(result.availableHeadings).toEqual([
      { blockId: 'blk', level: 1, text: 'Intro' },
      { blockId: 'blk', level: 2, text: 'Section A' },
      { blockId: 'blk', level: 3, text: 'Section A' },
      { blockId: 'blk', level: 2, text: 'Section A' },
      { blockId: 'blk', level: 1, text: 'Outro' },
    ]);
  });

  it('availableHeadings only records headings scanned before match', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'Target' });

    pageHandler([
      makeHeadingBlock(1, 'Before'),
      makeHeadingBlock(2, 'Target'),
      makeHeadingBlock(3, 'Child'),     // collecting 阶段，不进 availableHeadings
      makeHeadingBlock(1, 'After'),     // 触发结束，不进 availableHeadings
    ]);

    const result = getResult();
    expect(result.matched).toBe(true);
    expect(result.availableHeadings).toEqual([
      { blockId: 'blk', level: 1, text: 'Before' },
      { blockId: 'blk', level: 2, text: 'Target' },
    ]);
  });

  it('availableHeadings is empty when document has no headings', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'Whatever' });

    pageHandler([makePageBlock(), makeTextBlock('t1'), makeTextBlock('t2')]);

    const result = getResult();
    expect(result.matched).toBe(false);
    expect(result.availableHeadings).toEqual([]);
  });

  it('subsequent pageHandler calls after done still return false (covers done state)', () => {
    const { pageHandler } = createTitleFilter({ title: 'A' });

    // 第一次调用：collecting 状态，遇到同级 heading 进入 done
    pageHandler([makeHeadingBlock(1, 'A'), makeHeadingBlock(1, 'B')]);

    // 第二次调用：state 已是 'done'，进入 switch 的 done 分支
    const cont = pageHandler([makeTextBlock('ignored')]);
    expect(cont).toBe(false);
  });

  it('handles multi-page scanning', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'Found' });

    // Page 1: not found
    const cont1 = pageHandler([makeHeadingBlock(1, 'Other')]);
    expect(cont1).toBe(true);

    // Page 2: found
    const cont2 = pageHandler([makeHeadingBlock(1, 'Found'), makeTextBlock()]);
    expect(cont2).toBe(true); // still collecting (no end marker)

    const result = getResult();
    expect(result.matched).toBe(true);
  });
});

// ─── createTitleFilter - ancestor injection ────────────────────────────────

describe('createTitleFilter - ancestor injection', () => {
  it('injects direct parent heading (heading-only) when matching a deeper heading', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'X' });

    const blocks = [
      makeHeadingBlock(1, 'A', 'h-a'),
      makeTextBlock('a-text'),                  // 父级 A 的兄弟内容（不应注入）
      makeHeadingBlock(2, 'B', 'h-b'),
      makeTextBlock('b-text'),                  // 父级 B 的兄弟内容（不应注入）
      makeHeadingBlock(3, 'X', 'h-x'),
      makeTextBlock('x-content', ),
    ];
    pageHandler(blocks);
    const result = getResult();

    expect(result.matched).toBe(true);
    // 祖先 A、B + 命中 X + X 的内容（注意 a-text、b-text 因不在 blockMap 中会被 Parser 跳过，
    // 但本层 collected 不包含它们就足够保证「heading-only」语义）
    expect(result.blocks.map(b => b.block_id)).toEqual([
      'h-a', 'h-b', 'h-x', 'x-content',
    ]);
  });

  it('injects multi-level ancestors in document order', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'Deep' });

    pageHandler([
      makeHeadingBlock(1, 'L1', 'h1'),
      makeHeadingBlock(2, 'L2', 'h2'),
      makeHeadingBlock(3, 'L3', 'h3'),
      makeHeadingBlock(4, 'Deep', 'h-deep'),
    ]);

    const result = getResult();
    expect(result.matched).toBe(true);
    expect(result.blocks.map(b => b.block_id)).toEqual(['h1', 'h2', 'h3', 'h-deep']);
  });

  it('does not inject when match is top-level', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'Top' });

    pageHandler([
      makeHeadingBlock(1, 'Top', 'h-top'),
      makeTextBlock('c1'),
    ]);

    const result = getResult();
    expect(result.blocks.map(b => b.block_id)).toEqual(['h-top', 'c1']);
  });

  it('does not inject sibling headings that are not ancestors', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'X' });

    // 旁支：## B 在遇到下一个 ## B2 时已被弹出，不应作为 ### X 的祖先
    pageHandler([
      makeHeadingBlock(1, 'A', 'h-a'),
      makeHeadingBlock(2, 'B', 'h-b'),
      makeTextBlock('b-text'),
      makeHeadingBlock(2, 'B2', 'h-b2'),
      makeHeadingBlock(3, 'X', 'h-x'),
      makeTextBlock('x-content'),
    ]);

    const result = getResult();
    expect(result.matched).toBe(true);
    expect(result.blocks.map(b => b.block_id)).toEqual([
      'h-a', 'h-b2', 'h-x', 'x-content',
    ]);
    // 关键负断言：不能含有 h-b
    expect(result.blocks.some(b => b.block_id === 'h-b')).toBe(false);
  });

  it('handles skipped levels (H1 → H3) without fabricating H2', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'Skip' });

    pageHandler([
      makeHeadingBlock(1, 'A', 'h1'),
      makeHeadingBlock(3, 'Skip', 'h3'),
      makeTextBlock('t'),
    ]);

    const result = getResult();
    expect(result.blocks.map(b => b.block_id)).toEqual(['h1', 'h3', 't']);
  });

  it('keeps ancestor stack across multiple pageHandler calls (cross-page)', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'X' });

    // Page 1：仅祖先
    pageHandler([
      makeHeadingBlock(1, 'A', 'h-a'),
      makeHeadingBlock(2, 'B', 'h-b'),
    ]);
    // Page 2：命中
    pageHandler([
      makeHeadingBlock(3, 'X', 'h-x'),
      makeTextBlock('x-content'),
    ]);

    const result = getResult();
    expect(result.matched).toBe(true);
    expect(result.blocks.map(b => b.block_id)).toEqual([
      'h-a', 'h-b', 'h-x', 'x-content',
    ]);
  });

  it('availableHeadings is unaffected by ancestor injection', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'X' });

    pageHandler([
      makeHeadingBlock(1, 'A', 'h-a'),
      makeHeadingBlock(2, 'B', 'h-b'),
      makeHeadingBlock(3, 'X', 'h-x'),
      makeHeadingBlock(4, 'Child', 'h-child'), // collecting 阶段，不进 availableHeadings
    ]);

    const result = getResult();
    expect(result.availableHeadings).toEqual([
      { blockId: 'h-a', level: 1, text: 'A' },
      { blockId: 'h-b', level: 2, text: 'B' },
      { blockId: 'h-x', level: 3, text: 'X' },
    ]);
  });

  it('keeps page block before injected ancestors', () => {
    const { pageHandler, getResult } = createTitleFilter({ title: 'X' });

    pageHandler([
      makePageBlock('page'),
      makeHeadingBlock(1, 'A', 'h-a'),
      makeHeadingBlock(2, 'X', 'h-x'),
      makeTextBlock('c'),
    ]);

    const result = getResult();
    expect(result.blocks.map(b => b.block_id)).toEqual([
      'page', 'h-a', 'h-x', 'c',
    ]);
  });
});

// ─── createTitleBlockIdFilter - ancestor injection ─────────────────────────

describe('createTitleBlockIdFilter - ancestor injection', () => {
  it('injects multi-level ancestors when matching by block id', () => {
    const { pageHandler, getResult } = createTitleBlockIdFilter({ blockId: 'h-x' });

    pageHandler([
      makeHeadingBlock(1, 'A', 'h-a'),
      makeHeadingBlock(2, 'B', 'h-b'),
      makeHeadingBlock(3, 'Same', 'h-x'),
      makeTextBlock('c'),
    ]);

    const result = getResult();
    expect(result.matched).toBe(true);
    expect(result.blocks.map(b => b.block_id)).toEqual(['h-a', 'h-b', 'h-x', 'c']);
  });

  it('does not inject sibling headings that are not ancestors', () => {
    const { pageHandler, getResult } = createTitleBlockIdFilter({ blockId: 'h-x' });

    pageHandler([
      makeHeadingBlock(1, 'A', 'h-a'),
      makeHeadingBlock(2, 'B', 'h-b'),
      makeHeadingBlock(2, 'B2', 'h-b2'),
      makeHeadingBlock(3, 'X', 'h-x'),
      makeTextBlock('c'),
    ]);

    const result = getResult();
    expect(result.blocks.map(b => b.block_id)).toEqual(['h-a', 'h-b2', 'h-x', 'c']);
    expect(result.blocks.some(b => b.block_id === 'h-b')).toBe(false);
  });
});

// ─── createTitleBlockIdFilter ────────────────────────────────────────────────

describe('createTitleBlockIdFilter', () => {
  it('matches by block id rather than text (disambiguates same-name headings)', () => {
    const { pageHandler, getResult } = createTitleBlockIdFilter({ blockId: 'h-target' });

    pageHandler([
      makeHeadingBlock(2, 'Same Name', 'h-other'),
      makeTextBlock('a'),
      makeHeadingBlock(2, 'Same Name', 'h-target'),
      makeTextBlock('b'),
      makeHeadingBlock(2, 'Same Name', 'h-third'),
    ]);

    const result = getResult();
    expect(result.matched).toBe(true);
    // 命中的 heading + b，遇到同级标题停止
    expect(result.blocks).toHaveLength(2);
    expect(result.blocks[0]!.block_id).toBe('h-target');
    expect(result.blocks[1]!.block_id).toBe('b');
  });

  it('non-heading blocks with matching id never match', () => {
    const { pageHandler, getResult } = createTitleBlockIdFilter({ blockId: 'txt' });

    pageHandler([makeHeadingBlock(1, 'A', 'h1'), makeTextBlock('txt')]);

    const result = getResult();
    expect(result.matched).toBe(false);
  });

  it('trims whitespace from blockId option', () => {
    const { pageHandler, getResult } = createTitleBlockIdFilter({ blockId: '  h1  ' });

    pageHandler([makeHeadingBlock(1, 'A', 'h1'), makeTextBlock('c')]);

    const result = getResult();
    expect(result.matched).toBe(true);
  });

  it('always keeps page blocks', () => {
    const { pageHandler, getResult } = createTitleBlockIdFilter({ blockId: 'h1' });

    pageHandler([makePageBlock(), makeHeadingBlock(1, 'X', 'h1'), makeTextBlock()]);

    expect(getResult().blocks[0]!.block_type).toBe(1);
  });

  it('returns false from pageHandler after done', () => {
    const { pageHandler } = createTitleBlockIdFilter({ blockId: 'h1' });

    pageHandler([
      makeHeadingBlock(1, 'A', 'h1'),
      makeHeadingBlock(1, 'B', 'h2'), // 同级 → done
    ]);
    expect(pageHandler([makeTextBlock()])).toBe(false);
  });

  it('availableHeadings on miss carries blockId/level/text (yaml-shape)', () => {
    const { pageHandler, getResult } = createTitleBlockIdFilter({ blockId: 'never' });

    pageHandler([
      makeHeadingBlock(1, 'A', 'h1'),
      makeHeadingBlock(2, 'B', 'h2'),
      makeHeadingBlock(2, 'B', 'h3'), // 同名同父级
    ]);

    const result = getResult();
    expect(result.matched).toBe(false);
    expect(result.availableHeadings).toEqual([
      { blockId: 'h1', level: 1, text: 'A' },
      { blockId: 'h2', level: 2, text: 'B' },
      { blockId: 'h3', level: 2, text: 'B' },
    ]);
  });

  it('stops collecting at higher-level heading (level < matchedLevel)', () => {
    const { pageHandler, getResult } = createTitleBlockIdFilter({ blockId: 'h-sub' });

    pageHandler([
      makeHeadingBlock(2, 'Sub', 'h-sub'),
      makeTextBlock('c1'),
      makeHeadingBlock(1, 'Top', 'h-top'), // 更高级 → 停止
      makeTextBlock('after'),
    ]);

    const result = getResult();
    expect(result.blocks).toHaveLength(2); // Sub + c1
  });

  it('handles multi-page scanning before match', () => {
    const { pageHandler, getResult } = createTitleBlockIdFilter({ blockId: 'h-found' });

    expect(pageHandler([makeHeadingBlock(1, 'A', 'h1')])).toBe(true);
    expect(pageHandler([makeHeadingBlock(1, 'B', 'h-found'), makeTextBlock('c')])).toBe(true);

    const result = getResult();
    expect(result.matched).toBe(true);
    expect(result.blocks).toHaveLength(2);
  });
});

// ─── createHeadingCollector ──────────────────────────────────────────────────

describe('createHeadingCollector', () => {
  it('collects flat HeadingInfo (blockId/level/text)', () => {
    const { pageHandler, getHeadings } = createHeadingCollector();

    pageHandler([
      makePageBlock(),
      makeHeadingBlock(1, 'A', 'h1'),
      makeTextBlock('t'),
      makeHeadingBlock(2, 'A.1', 'h2'),
      makeHeadingBlock(2, 'A.2', 'h3'),
      makeHeadingBlock(1, 'B', 'h4'),
    ]);

    expect(getHeadings()).toEqual([
      { blockId: 'h1', level: 1, text: 'A' },
      { blockId: 'h2', level: 2, text: 'A.1' },
      { blockId: 'h3', level: 2, text: 'A.2' },
      { blockId: 'h4', level: 1, text: 'B' },
    ]);
  });

  it('handles skipped levels (e.g. H1 then H3)', () => {
    const { pageHandler, getHeadings } = createHeadingCollector();

    pageHandler([
      makeHeadingBlock(1, 'A', 'h1'),
      makeHeadingBlock(3, 'C', 'h3'),
      makeHeadingBlock(2, 'B', 'h2'),
    ]);

    expect(getHeadings()).toEqual([
      { blockId: 'h1', level: 1, text: 'A' },
      { blockId: 'h3', level: 3, text: 'C' },
      { blockId: 'h2', level: 2, text: 'B' },
    ]);
  });

  it('returns empty array when no headings present', () => {
    const { pageHandler, getHeadings } = createHeadingCollector();
    pageHandler([makePageBlock(), makeTextBlock('t1'), makeTextBlock('t2')]);
    expect(getHeadings()).toEqual([]);
  });

  it('pageHandler always returns true to drain document', () => {
    const { pageHandler } = createHeadingCollector();
    expect(pageHandler([makeHeadingBlock(1, 'A', 'h1')])).toBe(true);
    expect(pageHandler([])).toBe(true);
  });

  it('accumulates across multiple page calls', () => {
    const { pageHandler, getHeadings } = createHeadingCollector();

    pageHandler([makeHeadingBlock(1, 'A', 'h1'), makeHeadingBlock(2, 'A.1', 'h2')]);
    pageHandler([makeHeadingBlock(1, 'B', 'h3')]);

    expect(getHeadings()).toHaveLength(3);
    expect(getHeadings()[2]).toEqual({
      blockId: 'h3', level: 1, text: 'B',
    });
  });

  it('falls back to empty blockId when block_id is missing', () => {
    const { pageHandler, getHeadings } = createHeadingCollector();

    pageHandler([{
      block_type: 3,
      heading1: { elements: [{ text_run: { content: 'NoId' } }] },
    } as unknown as DocxBlock]);

    expect(getHeadings()[0]!.blockId).toBe('');
  });
});
