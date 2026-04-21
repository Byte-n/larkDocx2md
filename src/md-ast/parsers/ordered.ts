import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

export const orderedParser: BlockParser = {
  blockType: 13,
  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode {
    const parent = block.parent_id ? ctx.blockMap.get(block.parent_id) : undefined;
    let order = 1;
    if (parent?.children) {
      const idx = parent.children.indexOf(block.block_id!);
      for (let i = idx - 1; i >= 0; i--) {
        const sib = ctx.blockMap.get(parent.children[i]!);
        if (sib?.block_type === 13) order++;
        else break;
      }
    }
    return {
      type: 'ordered',
      order,
      text: block.ordered ? ctx.parseText(block.ordered) : [],
      children: ctx.parseChildren(block),
    };
  },
};
