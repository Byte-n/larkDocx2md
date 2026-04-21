import type { BlockParser } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

export const imageParser: BlockParser = {
  blockType: 27,
  parse (block: DocxBlock, _ctx): MdBlockNode {
    const token = block.image?.token ?? '';
    return {
      type: 'image',
      alt: `图片-${token}`,
      src: token,
    };
  },
};
