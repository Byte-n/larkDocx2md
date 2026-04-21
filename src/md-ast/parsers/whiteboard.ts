import type { BlockParser } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

export const whiteboardParser: BlockParser = {
  blockType: 43,
  parse (block: DocxBlock, _ctx): MdBlockNode {
    const token = block.board?.token ?? '';
    return {
      type: 'whiteboard',
      token,
    };
  },
};
