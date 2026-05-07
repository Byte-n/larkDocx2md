import { describe, it, expect } from 'vitest';
import { extractPlainText } from '../../src/whiteboard/plain-text.js';

describe('extractPlainText', () => {
  it('returns empty string for undefined', () => {
    expect(extractPlainText(undefined)).toBe('');
  });

  it('returns plain text field when no rich_text', () => {
    expect(extractPlainText({ text: 'hello' } as any)).toBe('hello');
  });

  it('returns empty string when neither text nor rich_text present', () => {
    expect(extractPlainText({} as any)).toBe('');
  });

  it('prefers rich_text over plain text', () => {
    const input = {
      text: 'plain',
      rich_text: {
        paragraphs: [{ elements: [{ element_type: 0, text_element: { text: 'rich' } }] }],
      },
    };
    expect(extractPlainText(input as any)).toBe('rich');
  });

  it('joins multiple elements in a paragraph', () => {
    const input = {
      rich_text: {
        paragraphs: [
          {
            elements: [
              { element_type: 0, text_element: { text: 'Hello ' } },
              { element_type: 0, text_element: { text: 'World' } },
            ],
          },
        ],
      },
    };
    expect(extractPlainText(input as any)).toBe('Hello World');
  });

  it('joins multiple paragraphs with newlines', () => {
    const input = {
      rich_text: {
        paragraphs: [
          { elements: [{ element_type: 0, text_element: { text: 'line1' } }] },
          { elements: [{ element_type: 0, text_element: { text: 'line2' } }] },
        ],
      },
    };
    expect(extractPlainText(input as any)).toBe('line1\nline2');
  });

  it('handles link_element (element_type=1) preferring text, falling back to href', () => {
    const input1 = {
      rich_text: {
        paragraphs: [{ elements: [{ element_type: 1, link_element: { text: 'Click', herf: 'http://x' } }] }],
      },
    };
    expect(extractPlainText(input1 as any)).toBe('Click');

    const input2 = {
      rich_text: {
        paragraphs: [{ elements: [{ element_type: 1, link_element: { herf: 'http://x' } }] }],
      },
    };
    expect(extractPlainText(input2 as any)).toBe('http://x');
  });

  it('handles mention_doc_element (element_type=3)', () => {
    const input = {
      rich_text: {
        paragraphs: [{ elements: [{ element_type: 3, mention_doc_element: { doc_url: 'doc://abc' } }] }],
      },
    };
    expect(extractPlainText(input as any)).toBe('doc://abc');
  });

  it('falls back to [doc] when mention_doc has no url', () => {
    const input = {
      rich_text: {
        paragraphs: [{ elements: [{ element_type: 3, mention_doc_element: {} }] }],
      },
    };
    expect(extractPlainText(input as any)).toBe('[doc]');
  });

  it('ignores unknown element types', () => {
    const input = {
      rich_text: {
        paragraphs: [{ elements: [{ element_type: 99, text_element: { text: 'ignored' } }] }],
      },
    };
    expect(extractPlainText(input as any)).toBe('');
  });

  it('uses plain text when rich_text.paragraphs is empty', () => {
    const input = { text: 'fallback', rich_text: { paragraphs: [] } };
    expect(extractPlainText(input as any)).toBe('fallback');
  });
});
