import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

export const gridParser: BlockParser = {
  blockType: 24,
  parse (block: DocxBlock, ctx: ParserContext): MdBlockNode {
    const children: MdBlockNode[] = [];
    for (const colId of block.children ?? []) {
      const col = ctx.blockMap.get(colId);
      if (!col) continue;
      for (const id of col.children ?? []) {
        const child = ctx.blockMap.get(id);
        if (child) {
          const node = ctx.parseBlock(child);
          if (node) children.push(node);
        }
      }
    }
    return { type: 'grid', children };
  },
};
