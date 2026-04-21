import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

export const calloutParser: BlockParser = {
  blockType: 19,
  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode {
    return {
      type: 'callout',
      children: ctx.parseChildren(block),
    };
  },
};
