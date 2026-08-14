import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../lib/types.js';
import type { MdBlockNode } from '../types.js';

export const quoteContainerParser: BlockParser = {
  blockType: 34,
  consumesChildren: true,
  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode {
    return {
      type: 'quote',
      children: ctx.parseChildren(block),
    };
  },
};
