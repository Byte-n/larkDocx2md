import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

export const textParser: BlockParser = {
  blockType: 2,
  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode {
    return {
      type: 'paragraph',
      children: block.text ? ctx.parseText(block.text) : [],
    };
  },
};
