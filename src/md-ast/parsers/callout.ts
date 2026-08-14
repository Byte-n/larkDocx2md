import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../lib/types.js';
import type { MdBlockNode } from '../types.js';

export const calloutParser: BlockParser = {
  blockType: 19,
  consumesChildren: true,
  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode {
    return {
      type: 'callout',
      children: ctx.parseChildren(block),
    };
  },
};
