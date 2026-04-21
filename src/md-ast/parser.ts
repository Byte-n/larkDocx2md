import { Registry } from '../core/registry.js';
import type { DocInfo, DocxBlock, TextBody, TextElement } from '../types.js';
import type { MdBlockNode, MdInlineNode } from './types.js';

export interface BlockParser {
  blockType: number;

  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode | null;
}

export interface ParserContext {
  blockMap: Map<string, DocxBlock>;

  parseBlock (block: DocxBlock): MdBlockNode | null;

  parseText (body: TextBody): MdInlineNode[];

  parseInline (e: TextElement): MdInlineNode[];

  parseChildren (block: DocxBlock): MdBlockNode[];
}

export class Parser {
  private registry = new Registry<number, BlockParser>();

  register (parser: BlockParser): void {
    this.registry.register(parser.blockType, parser);
  }

  parse (doc: DocInfo, blocks: DocxBlock[]): MdBlockNode {
    const blockMap = new Map<string, DocxBlock>();
    for (const b of blocks) {
      if (b.block_id) blockMap.set(b.block_id, b);
    }

    const ctx: ParserContext = {
      blockMap,
      parseBlock: (block: DocxBlock): MdBlockNode | null => {
        const bt = block.block_type;
        if (bt === undefined || bt === null) return null;
        const parser = this.registry.get(bt);
        if (parser) {
          return parser.parse(block, ctx);
        }
        // GridColumn(25) is handled inside Grid parser
        return null;
      },
      parseText: (body: TextBody): MdInlineNode[] => {
        const inline = body.elements.length > 1;
        return body.elements.flatMap(e => parseElement(e, inline));
      },
      parseInline: (e: TextElement): MdInlineNode[] => {
        return parseElement(e, true);
      },
      parseChildren: (block: DocxBlock): MdBlockNode[] => {
        const children: MdBlockNode[] = [];
        for (const id of block.children ?? []) {
          const child = blockMap.get(id);
          if (child) {
            const node = ctx.parseBlock(child);
            if (node) children.push(node);
          }
        }
        return children;
      },
    };

    const entry = blockMap.get(doc.documentId);
    if (entry) {
      const node = ctx.parseBlock(entry);
      if (node) return node;
    }

    // Fallback: create a page node with all root-level blocks
    const rootBlocks = blocks.filter(b => !b.parent_id);
    return {
      type: 'page',
      title: [],
      children: rootBlocks.map(b => ctx.parseBlock(b)).filter((n): n is MdBlockNode => n !== null),
    };
  }
}

function parseElement (e: TextElement, inline: boolean): MdInlineNode[] {
  if (e.text_run) {
    return [parseTextRun(e.text_run)];
  }
  if (e.mention_user) {
    return [{ type: 'mentionUser', userId: e.mention_user.user_id }];
  }
  if (e.mention_doc) {
    const url = e.mention_doc.url ? decodeURIComponent(e.mention_doc.url) : '';
    return [{ type: 'mentionDoc', title: e.mention_doc.title ?? '', url }];
  }
  if (e.equation) {
    return [{ type: 'equation', content: e.equation.content.replace(/\n$/, ''), inline }];
  }
  return [];
}

function parseTextRun (tr: NonNullable<TextElement['text_run']>): MdInlineNode {
  const s = tr.text_element_style;
  const textNode: MdInlineNode = { type: 'text', content: tr.content };

  if (!s) return textNode;

  if (s.bold) {
    return { type: 'bold', children: [textNode] };
  }
  if (s.italic) {
    return { type: 'italic', children: [textNode] };
  }
  if (s.strikethrough) {
    return { type: 'strikethrough', children: [textNode] };
  }
  if (s.underline) {
    return { type: 'underline', children: [textNode] };
  }
  if (s.inline_code) {
    return { type: 'inlineCode', content: tr.content };
  }
  if (s.link) {
    return { type: 'link', url: decodeURIComponent(s.link.url), children: [textNode] };
  }

  return textNode;
}
