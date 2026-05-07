import { describe, it, expect } from 'vitest';
import { renderTextContent, renderCellText } from '../../src/whiteboard/text.js';
import type { WText } from '../../src/whiteboard/types.js';

// ─── renderTextContent: 基本分支 ─────────────────────────────────────────────

describe('renderTextContent - empty/defaults', () => {
  it('returns empty string when text is undefined', () => {
    expect(renderTextContent(undefined, 100, 50)).toBe('');
  });

  it('returns empty string when text.text is empty', () => {
    expect(renderTextContent({ text: '' } as WText, 100, 50)).toBe('');
  });

  it('uses default font-size 14 and color #333', () => {
    const out = renderTextContent({ text: 'hi' } as WText, 100, 50);
    expect(out).toContain('font-size="14"');
    expect(out).toContain('fill="#333"');
  });

  it('applies custom font-size, color, bold, italic', () => {
    const out = renderTextContent(
      { text: 'hi', font_size: 20, text_color: '#f00', font_weight: 'bold', italic: true } as WText,
      100, 50,
    );
    expect(out).toContain('font-size="20"');
    expect(out).toContain('fill="#f00"');
    expect(out).toContain('font-weight="bold"');
    expect(out).toContain('font-style="italic"');
  });

  it('applies underline + line_through decorations', () => {
    const out = renderTextContent(
      { text: 'hi', underline: true, line_through: true } as WText,
      100, 50,
    );
    expect(out).toContain('text-decoration="underline line-through"');
  });
});

// ─── horizontal/vertical alignment ────────────────────────────────────────

describe('renderTextContent - alignment', () => {
  it('horizontal center sets text-anchor=middle and x=w/2', () => {
    const out = renderTextContent({ text: 'x', horizontal_align: 'center' } as WText, 100, 40);
    expect(out).toContain('text-anchor="middle"');
    expect(out).toContain('x="50"');
  });

  it('horizontal right sets text-anchor=end and x=w', () => {
    const out = renderTextContent({ text: 'x', horizontal_align: 'right' } as WText, 120, 40);
    expect(out).toContain('text-anchor="end"');
    expect(out).toContain('x="120"');
  });

  it('vertical bottom places y near bottom', () => {
    const out = renderTextContent({ text: 'x', vertical_align: 'bottom' } as WText, 100, 100);
    expect(out).toMatch(/y="96"/);
  });

  it('vertical mid centers vertically', () => {
    const out = renderTextContent({ text: 'x', vertical_align: 'mid' } as WText, 100, 100);
    // mid 单行: h/2 + fontSize/3 ≈ 54.67 → "54.67" 或经 r() 格式化
    expect(out).toMatch(/y="5\d(\.\d+)?"/);
  });
});

// ─── text background color ────────────────────────────────────────────────

describe('renderTextContent - background rect', () => {
  it('emits <rect> before <text> when text_background_color set', () => {
    const out = renderTextContent(
      { text: 'bg', text_background_color: '#ffff00' } as WText,
      100, 40,
    );
    expect(out.indexOf('<rect')).toBeLessThan(out.indexOf('<text'));
    expect(out).toContain('fill="#ffff00"');
  });

  it('background rect position honors center anchor', () => {
    const out = renderTextContent(
      { text: 'abc', text_background_color: '#ff0', horizontal_align: 'center' } as WText,
      100, 40,
    );
    // anchor middle → bg rect x 应比 text x 小（减去半宽）
    const rectX = Number(out.match(/<rect[^>]*x="([\d.]+)"/)![1]);
    expect(rectX).toBeLessThan(50);
  });

  it('background rect position honors end anchor', () => {
    const out = renderTextContent(
      { text: 'abc', text_background_color: '#ff0', horizontal_align: 'right' } as WText,
      100, 40,
    );
    // anchor end → bg rect x 应 < w
    const rectX = Number(out.match(/<rect[^>]*x="([\d.]+)"/)![1]);
    expect(rectX).toBeLessThan(100);
  });
});

// ─── rotation ─────────────────────────────────────────────────────────────

describe('renderTextContent - rotation', () => {
  it('emits transform=rotate(...) when angle set', () => {
    const out = renderTextContent({ text: 'r', angle: 45 } as WText, 100, 40);
    expect(out).toMatch(/transform="rotate\(45/);
  });

  it('no transform when angle = 0', () => {
    const out = renderTextContent({ text: 'r', angle: 0 } as WText, 100, 40);
    expect(out).not.toContain('transform=');
  });
});

// ─── wrapping (multi-line via tspan) ─────────────────────────────────────

describe('renderTextContent - auto-wrap & tspan', () => {
  it('splits on explicit \\n using tspans', () => {
    const out = renderTextContent({ text: 'line1\nline2' } as WText, 200, 80);
    const tspans = out.match(/<tspan/g)!;
    expect(tspans.length).toBe(2);
    expect(out).toContain('>line1<');
    expect(out).toContain('>line2<');
  });

  it('auto-wraps long ASCII text that exceeds maxWidth', () => {
    // 字符宽 ≈ fontSize * 0.55 = 7.7，maxWidth = 50-8=42 → ~5 chars/line
    const out = renderTextContent({ text: 'abcdefghijklmnop' } as WText, 50, 60);
    const tspans = out.match(/<tspan/g);
    expect(tspans).toBeTruthy();
    expect(tspans!.length).toBeGreaterThan(1);
  });

  it('auto-wraps CJK text (wider character estimate)', () => {
    // CJK 字符宽 ≈ fontSize * 0.9 = 12.6，maxWidth = 50-8=42 → ~3 chars/line
    const out = renderTextContent({ text: '一二三四五六七八九十' } as WText, 50, 60);
    const tspans = out.match(/<tspan/g);
    expect(tspans!.length).toBeGreaterThan(1);
  });

  it('multiline with vertical bottom align shifts startY upward', () => {
    const out = renderTextContent(
      { text: 'a\nb\nc', vertical_align: 'bottom' } as WText,
      200, 200,
    );
    const ys = [...out.matchAll(/y="(\d+(?:\.\d+)?)"/g)].map(m => Number(m[1]));
    // 至少 3 行，y 递增
    expect(ys.length).toBeGreaterThanOrEqual(3);
    expect(ys[1]!).toBeGreaterThan(ys[0]!);
  });

  it('multiline with vertical mid centers the block', () => {
    const out = renderTextContent(
      { text: 'a\nb\nc', vertical_align: 'mid' } as WText,
      200, 200,
    );
    expect(out).toMatch(/<tspan/);
  });

  it('zero maxWidth branch (w <= 8) skips wrapping', () => {
    // wrapTextLines 分支: maxWidth <= 0 时直接 push 整行
    const out = renderTextContent({ text: 'hello' } as WText, 5, 40);
    expect(out).toContain('hello');
  });
});

// ─── rich_text 路径 ───────────────────────────────────────────────────────

describe('renderTextContent - rich_text', () => {
  it('uses rich_text when paragraphs present', () => {
    const out = renderTextContent({
      text: 'plain',
      rich_text: {
        paragraphs: [{
          elements: [
            { element_type: 0, text_element: { text: 'Hello ', text_style: { font_weight: 'bold' } } },
            { element_type: 0, text_element: { text: 'World', text_style: { text_color: '#f00' } } },
          ],
        }],
      },
    } as WText, 300, 40);
    expect(out).toContain('Hello');
    expect(out).toContain('World');
    expect(out).toContain('font-weight="bold"');
    expect(out).toContain('fill="#f00"');
  });

  it('rich_text link_element wraps in <a href>', () => {
    const out = renderTextContent({
      rich_text: {
        paragraphs: [{
          elements: [
            { element_type: 1, link_element: { text: 'open', herf: 'https://example.com' } },
          ],
        }],
      },
    } as WText, 300, 40);
    expect(out).toContain('<a href="https://example.com">');
    expect(out).toContain('</a>');
    expect(out).toContain('>open<');
  });

  it('rich_text link_element without text falls back to href', () => {
    const out = renderTextContent({
      rich_text: {
        paragraphs: [{
          elements: [
            { element_type: 1, link_element: { herf: 'https://x.io' } },
          ],
        }],
      },
    } as WText, 300, 40);
    expect(out).toContain('>https://x.io<');
  });

  it('rich_text mention_doc_element wraps in <a> with [doc] text', () => {
    const out = renderTextContent({
      rich_text: {
        paragraphs: [{
          elements: [
            { element_type: 3, mention_doc_element: { doc_url: 'https://feishu/doc' } },
          ],
        }],
      },
    } as WText, 300, 40);
    expect(out).toContain('<a href="https://feishu/doc">');
    expect(out).toContain('[doc]');
  });

  it('rich_text wraps long segments across multiple visual lines', () => {
    const out = renderTextContent({
      rich_text: {
        paragraphs: [{
          elements: [
            { element_type: 0, text_element: { text: 'line-1\nline-2\nline-3' } },
          ],
        }],
      },
    } as WText, 200, 80);
    // 显式 \n 触发 flush，应分成多个 <text> 行
    const texts = out.match(/<text /g)!;
    expect(texts.length).toBeGreaterThan(1);
  });

  it('rich_text with empty elements emits a single empty <text>', () => {
    // flowSegmentsIntoLines 对空 segments 返回 ['']，产生一个空 text
    const out = renderTextContent({
      rich_text: { paragraphs: [{ elements: [] }] },
    } as unknown as WText, 300, 40);
    expect(out).toContain('<text');
    expect(out).toMatch(/<text[^>]*><\/text>/);
  });

  it('rich_text honors horizontal center alignment', () => {
    const out = renderTextContent({
      horizontal_align: 'center',
      rich_text: {
        paragraphs: [{ elements: [{ element_type: 0, text_element: { text: 'x' } }] }],
      },
    } as WText, 200, 40);
    expect(out).toContain('text-anchor="middle"');
  });

  it('rich_text inherits parent bold/italic/underline/line_through', () => {
    const out = renderTextContent({
      font_weight: 'bold',
      italic: true,
      underline: true,
      line_through: true,
      rich_text: {
        paragraphs: [{ elements: [{ element_type: 0, text_element: { text: 'x' } }] }],
      },
    } as WText, 300, 40);
    expect(out).toContain('font-weight="bold"');
    expect(out).toContain('font-style="italic"');
    expect(out).toContain('text-decoration="underline line-through"');
  });
});

// ─── renderCellText ───────────────────────────────────────────────────────

describe('renderCellText', () => {
  it('wraps rendered text in translate <g>', () => {
    const out = renderCellText(
      { text: 'cell' } as WText,
      undefined,
      10, 20, 80, 30,
    );
    expect(out).toContain('<g transform="translate(10,20)">');
    expect(out).toContain('cell');
    expect(out.endsWith('</g>')).toBe(true);
  });

  it('merges meta defaults when cell lacks fields', () => {
    const out = renderCellText(
      { text: 'txt' } as WText,
      { font_size: 18, text_color: '#00f', font_weight: 'bold' } as WText,
      0, 0, 100, 40,
    );
    expect(out).toContain('font-size="18"');
    expect(out).toContain('fill="#00f"');
    expect(out).toContain('font-weight="bold"');
  });

  it('cell fields take precedence over meta', () => {
    const out = renderCellText(
      { text: 't', font_size: 22 } as WText,
      { font_size: 10 } as WText,
      0, 0, 100, 40,
    );
    expect(out).toContain('font-size="22"');
  });

  it('returns empty string when cell text renders empty', () => {
    const out = renderCellText(
      { text: '' } as WText,
      undefined,
      0, 0, 100, 40,
    );
    expect(out).toBe('');
  });
});
