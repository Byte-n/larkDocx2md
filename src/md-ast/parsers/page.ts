import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

export const pageParser: BlockParser = {
  blockType: 1,
  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode {
    return {
      type: 'page',
      title: block.page ? ctx.parseText(block.page) : [],
      children: ctx.parseChildren(block),
    };
  },
};
