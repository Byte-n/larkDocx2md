import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

export const todoParser: BlockParser = {
  blockType: 17,
  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode {
    return {
      type: 'todo',
      checked: block.todo?.style?.done ?? false,
      text: block.todo ? ctx.parseText(block.todo) : [],
    };
  },
};
