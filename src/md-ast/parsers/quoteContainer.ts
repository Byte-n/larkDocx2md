import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

export const quoteContainerParser: BlockParser = {
  blockType: 34,
  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode {
    return {
      type: 'quote',
      children: ctx.parseChildren(block),
    };
  },
};
