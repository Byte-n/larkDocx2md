import { describe, it, expect } from 'vitest';
import { MdSerializer, registerBuiltinSerializers } from '../../src/md-ast/serializer.js';
import type { MdBlockNode, MdInlineNode } from '../../src/md-ast/types.js';

function createSerializer (): MdSerializer {
  const s = new MdSerializer();
  registerBuiltinSerializers(s);
  return s;
}

const text = (content: string): MdInlineNode => ({ type: 'text', content });
const bold = (content: string): MdInlineNode => ({ type: 'bold', children: [text(content)] });
const italic = (content: string): MdInlineNode => ({ type: 'italic', children: [text(content)] });
const code = (content: string): MdInlineNode => ({ type: 'inlineCode', content });
const link = (label: string, url: string): MdInlineNode => ({ type: 'link', url, children: [text(label)] });

describe('MdSerializer', () => {
  const s = createSerializer();

  describe('heading', () => {
    it('serializes h1~h6', () => {
      for (let level = 1; level <= 6; level++) {
        const node: MdBlockNode = { type: 'heading', level, children: [text('Title')] };
        expect(s.serialize(node)).toBe(`${'#'.repeat(level)} Title\n\n`);
      }
    });

    it('serializes inline marks in headings', () => {
      const node: MdBlockNode = { type: 'heading', level: 2, children: [bold('Important')] };
      expect(s.serialize(node)).toBe('## **Important**\n\n');
    });
  });

  describe('paragraph', () => {
    it('serializes plain text', () => {
      const node: MdBlockNode = { type: 'paragraph', children: [text('Hello world')] };
      expect(s.serialize(node)).toBe('Hello world\n\n');
    });

    it('serializes mixed inline nodes', () => {
      const node: MdBlockNode = {
        type: 'paragraph',
        children: [text('Use '), code('vitest'), text(' for testing')],
      };
      expect(s.serialize(node)).toBe('Use `vitest` for testing\n\n');
    });
  });

  describe('bullet list', () => {
    it('serializes simple bullet', () => {
      const node: MdBlockNode = { type: 'bullet', text: [text('item')], children: [] };
      expect(s.serialize(node)).toBe('- item\n');
    });

    it('serializes nested bullets', () => {
      const child: MdBlockNode = { type: 'bullet', text: [text('child')], children: [] };
      const node: MdBlockNode = { type: 'bullet', text: [text('parent')], children: [child] };
      const result = s.serialize(node);
      expect(result).toContain('- parent');
      expect(result).toContain('\t- child');
    });
  });

  describe('ordered list', () => {
    it('serializes with order number', () => {
      const node: MdBlockNode = { type: 'ordered', order: 1, text: [text('first')], children: [] };
      expect(s.serialize(node)).toBe('1. first\n');
    });
  });

  describe('code block', () => {
    it('serializes with language', () => {
      const node: MdBlockNode = { type: 'codeBlock', lang: 'ts', content: 'const x = 1;' };
      expect(s.serialize(node)).toBe('```ts\nconst x = 1;\n```\n\n');
    });
  });

  describe('todo', () => {
    it('serializes unchecked', () => {
      const node: MdBlockNode = { type: 'todo', checked: false, text: [text('task')] };
      expect(s.serialize(node)).toBe('- [ ] task\n');
    });

    it('serializes checked', () => {
      const node: MdBlockNode = { type: 'todo', checked: true, text: [text('done')] };
      expect(s.serialize(node)).toBe('- [x] done\n');
    });
  });

  describe('divider', () => {
    it('serializes as ---', () => {
      const node: MdBlockNode = { type: 'divider' };
      expect(s.serialize(node)).toBe('---\n\n');
    });
  });

  describe('image', () => {
    it('serializes as markdown image', () => {
      const node: MdBlockNode = { type: 'image', alt: 'pic', src: 'http://img.png' };
      expect(s.serialize(node)).toBe('![pic](http://img.png)\n');
    });
  });

  describe('quote', () => {
    it('serializes children with > prefix', () => {
      const node: MdBlockNode = {
        type: 'quote',
        children: [{ type: 'paragraph', children: [text('quoted')] }],
      };
      expect(s.serialize(node)).toContain('> quoted');
    });
  });

  describe('callout', () => {
    it('serializes with >[!TIP] prefix', () => {
      const node: MdBlockNode = {
        type: 'callout',
        children: [{ type: 'paragraph', children: [text('note')] }],
      };
      const result = s.serialize(node);
      expect(result).toContain('>[!TIP]');
      expect(result).toContain('> note');
    });
  });

  describe('table', () => {
    it('serializes as Markdown pipe table', () => {
      const node: MdBlockNode = {
        type: 'table',
        rows: [
          { cells: [{ content: [text('A')] }, { content: [text('B')] }] },
          { cells: [{ content: [text('C')] }, { content: [text('D')] }] },
        ],
      };
      const result = s.serialize(node);
      expect(result).toContain('| A | B |');
      expect(result).toContain('| --- | --- |');
      expect(result).toContain('| C | D |');
      expect(result).not.toContain('<table>');
      expect(result).not.toContain('<td>');
    });

    it('expands colspan/rowspan by duplicating the top-left value', () => {
      // 3x3 grid with top-left cell merged as 2x2
      const node: MdBlockNode = {
        type: 'table',
        rows: [
          { cells: [{ content: [text('X')], rowSpan: 2, colSpan: 2 }, { content: [text('c')] }] },
          { cells: [{ content: [text('f')] }] },
          { cells: [{ content: [text('g')] }, { content: [text('h')] }, { content: [text('i')] }] },
        ],
      };
      const result = s.serialize(node);
      expect(result).toContain('| X | X | c |');
      expect(result).toContain('| X | X | f |');
      expect(result).toContain('| g | h | i |');
    });

    it('escapes pipe and converts inline marks', () => {
      const node: MdBlockNode = {
        type: 'table',
        rows: [
          { cells: [{ content: [text('a|b')] }, { content: [bold('B')] }] },
          { cells: [{ content: [text('c')] }, { content: [link('d', 'http://x')] }] },
        ],
      };
      const result = s.serialize(node);
      expect(result).toContain('| a\\|b | **B** |');
      expect(result).toContain('| c | [d](http://x) |');
    });
  });

  describe('page', () => {
    it('serializes title as h1 + children', () => {
      const node: MdBlockNode = {
        type: 'page',
        title: [text('My Doc')],
        children: [{ type: 'paragraph', children: [text('content')] }],
      };
      const result = s.serialize(node);
      expect(result.startsWith('# My Doc\n\n')).toBe(true);
      expect(result).toContain('content');
    });

    it('omits title when empty', () => {
      const node: MdBlockNode = {
        type: 'page',
        title: [],
        children: [{ type: 'divider' }],
      };
      const result = s.serialize(node);
      expect(result).not.toContain('#');
      expect(result).toContain('---');
    });
  });

  describe('inline nodes', () => {
    it('bold', () => {
      const node: MdBlockNode = { type: 'paragraph', children: [bold('text')] };
      expect(s.serialize(node)).toContain('**text**');
    });

    it('italic', () => {
      const node: MdBlockNode = { type: 'paragraph', children: [italic('text')] };
      expect(s.serialize(node)).toContain('_text_');
    });

    it('strikethrough', () => {
      const node: MdBlockNode = {
        type: 'paragraph',
        children: [{ type: 'strikethrough', children: [text('del')] }],
      };
      expect(s.serialize(node)).toContain('~~del~~');
    });

    it('underline', () => {
      const node: MdBlockNode = {
        type: 'paragraph',
        children: [{ type: 'underline', children: [text('u')] }],
      };
      expect(s.serialize(node)).toContain('<u>u</u>');
    });

    it('link', () => {
      const node: MdBlockNode = { type: 'paragraph', children: [link('click', 'http://x')] };
      expect(s.serialize(node)).toContain('[click](http://x)');
    });

    it('equation inline', () => {
      const node: MdBlockNode = {
        type: 'paragraph',
        children: [{ type: 'equation', content: 'E=mc^2', inline: true }],
      };
      expect(s.serialize(node)).toContain('$E=mc^2$');
    });

    it('equation block', () => {
      const node: MdBlockNode = {
        type: 'paragraph',
        children: [{ type: 'equation', content: 'x^2', inline: false }],
      };
      expect(s.serialize(node)).toContain('$$x^2$$');
    });
  });
});
