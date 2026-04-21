import type { BlockParser } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

export const dividerParser: BlockParser = {
  blockType: 22,
  parse (_block: DocxBlock, _ctx): MdBlockNode {
    return { type: 'divider' };
  },
};
