import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

export const bulletParser: BlockParser = {
  blockType: 12,
  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode {
    return {
      type: 'bullet',
      text: block.bullet ? ctx.parseText(block.bullet) : [],
      children: ctx.parseChildren(block),
    };
  },
};
