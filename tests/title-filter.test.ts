import { describe, it, expect } from 'vitest';
import { createTitleFilter, getHeadingLevel, extractHeadingText } from '../src/title-filter.js';
import type { DocxBlock } from '../src/types.js';

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
