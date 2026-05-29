import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../lib/types.js';
import type { MdBlockNode } from '../types.js';

export const sheetBlockParser: BlockParser = {
  blockType: 30,
  parse (block: DocxBlock, _ctx: ParserContext): MdBlockNode {
    const token = (block as any).sheet?.token ?? '';
    return { type: 'sheet', token };
  },
};
