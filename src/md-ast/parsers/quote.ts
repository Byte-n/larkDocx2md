import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

export const quoteParser: BlockParser = {
  blockType: 15,
  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode {
    return {
      type: 'quote',
      children: block.quote ? [{ type: 'paragraph', children: ctx.parseText(block.quote) }] : [],
    };
  },
};
