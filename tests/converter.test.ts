import { describe, it, expect } from 'vitest';
import { parseWikiUrl } from '../src/converter.js';
import { GET_TITLES_NON_DOCUMENT_HINT, buildTitleTree, getTitles } from '../src/get-titles.js';
import type { HeadingInfo } from '../src/title-filter.js';

describe('parseWikiUrl', () => {
  it('parses docx URL', () => {
    const result = parseWikiUrl('https://example.feishu.cn/docx/abc123');
    expect(result).toEqual({ docType: 'docx', docToken: 'abc123', sheetId: undefined });
  });

  it('parses wiki URL', () => {
    const result = parseWikiUrl('https://example.feishu.cn/wiki/XYZ789');
    expect(result).toEqual({ docType: 'wiki', docToken: 'XYZ789', sheetId: undefined });
  });

  it('parses docs URL', () => {
    const result = parseWikiUrl('https://example.feishu.cn/docs/token123');
    expect(result).toEqual({ docType: 'docs', docToken: 'token123', sheetId: undefined });
  });

  it('parses sheets URL with sheet query param', () => {
    const result = parseWikiUrl('https://example.feishu.cn/sheets/abc123?sheet=Sheet1');
    expect(result).toEqual({ docType: 'sheets', docToken: 'abc123', sheetId: 'Sheet1' });
  });

  it('parses sheets URL without sheet param', () => {
    const result = parseWikiUrl('https://example.feishu.cn/sheets/abc123');
    expect(result).toEqual({ docType: 'sheets', docToken: 'abc123', sheetId: undefined });
  });

  it('handles custom domain', () => {
    const result = parseWikiUrl('https://mycompany.larksuite.com/docx/TOKEN');
    expect(result).toEqual({ docType: 'docx', docToken: 'TOKEN', sheetId: undefined });
  });

  it('throws on invalid URL', () => {
    expect(() => parseWikiUrl('https://example.com/invalid/path')).toThrow('Invalid feishu document URL');
    expect(() => parseWikiUrl('not a url')).toThrow();
  });

  it('handles URL with path suffix', () => {
    const result = parseWikiUrl('https://a.feishu.cn/docx/abc123/extra');
    expect(result.docToken).toBe('abc123');
  });
});

// ─── buildTitleTree ──────────────────────────────────────────────────────────────────────────

function h (blockId: string, level: number, text: string): HeadingInfo {
  return { blockId, level, text };
}

describe('buildTitleTree', () => {
  it('builds tree from flat headings using level', () => {
    const flat: HeadingInfo[] = [
      h('h1', 1, 'A'),
      h('h2', 2, 'A.1'),
      h('h3', 2, 'A.2'),
      h('h4', 1, 'B'),
    ];
    const tree = buildTitleTree(flat);
    expect(tree).toHaveLength(2);
    expect(tree[0]!.text).toBe('A');
    expect(tree[0]!.children).toHaveLength(2);
    expect(tree[0]!.children![0]!.text).toBe('A.1');
    expect(tree[1]!.text).toBe('B');
    expect(tree[1]!.children).toBeUndefined();
  });

  it('handles skipped levels by attaching to nearest higher-level ancestor', () => {
    const flat: HeadingInfo[] = [
      h('h1', 1, 'A'),
      h('h3', 3, 'C'), // 跳过 H2，C 仍作为 A 的子节点
    ];
    const tree = buildTitleTree(flat);
    expect(tree).toHaveLength(1);
    expect(tree[0]!.children).toHaveLength(1);
    expect(tree[0]!.children![0]!.text).toBe('C');
  });

  it('returns empty array for empty input', () => {
    expect(buildTitleTree([])).toEqual([]);
  });

  it('multiple roots when first heading is not the lowest level', () => {
    const flat: HeadingInfo[] = [
      h('h2', 2, 'X'),
      h('h2b', 2, 'Y'),
    ];
    const tree = buildTitleTree(flat);
    expect(tree).toHaveLength(2);
  });
});

describe('getTitles', () => {
  it('tells users to call dl directly for sheets links', async () => {
    await expect(getTitles({
      appId: '',
      appSecret: '',
      url: 'https://example.feishu.cn/sheets/abc123',
    })).rejects.toThrow(GET_TITLES_NON_DOCUMENT_HINT);
  });
});
