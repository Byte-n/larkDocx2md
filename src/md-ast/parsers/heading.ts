import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

function createHeadingParser (level: number, blockType: number): BlockParser {
  return {
    blockType,
    parse (block: DocxBlock, ctx: ParserContext): MdBlockNode {
      const headingKey = `heading${level}` as keyof DocxBlock;
      const body = block[headingKey] as DocxBlock['text'] | undefined;
      return {
        type: 'heading',
        level,
        children: body ? ctx.parseText(body) : [],
      };
    },
  };
}

export const heading1Parser = createHeadingParser(1, 3);
export const heading2Parser = createHeadingParser(2, 4);
export const heading3Parser = createHeadingParser(3, 5);
export const heading4Parser = createHeadingParser(4, 6);
export const heading5Parser = createHeadingParser(5, 7);
export const heading6Parser = createHeadingParser(6, 8);
export const heading7Parser = createHeadingParser(7, 9);
export const heading8Parser = createHeadingParser(8, 10);
export const heading9Parser = createHeadingParser(9, 11);
