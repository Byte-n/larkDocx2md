import { describe, it, expect } from 'vitest';
import { parseWikiUrl } from '../src/converter.js';

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
