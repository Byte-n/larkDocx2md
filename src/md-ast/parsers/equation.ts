import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

export const equationParser: BlockParser = {
  blockType: 16,
  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode {
    return {
      type: 'paragraph',
      children: block.equation ? ctx.parseText(block.equation) : [],
    };
  },
};
