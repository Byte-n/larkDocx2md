import type { BlockParser, ParserContext } from '../parser.js';
import type { DocxBlock } from '../../types.js';
import type { MdBlockNode } from '../types.js';

const codeLangMap: Record<number, string> = {
  1: '', 2: 'abap', 3: 'ada', 4: 'apache', 5: 'apex', 6: 'assembly', 7: 'bash', 8: 'csharp',
  9: 'cpp', 10: 'c', 11: 'cobol', 12: 'css', 13: 'coffeescript', 14: 'd', 15: 'dart',
  16: 'delphi', 17: 'django', 18: 'dockerfile', 19: 'erlang', 20: 'fortran', 21: 'foxpro',
  22: 'go', 23: 'groovy', 24: 'html', 25: 'htmlbars', 26: 'http', 27: 'haskell', 28: 'json',
  29: 'java', 30: 'javascript', 31: 'julia', 32: 'kotlin', 33: 'latex', 34: 'lisp',
  35: 'logo', 36: 'lua', 37: 'matlab', 38: 'makefile', 39: 'markdown', 40: 'nginx',
  41: 'objectivec', 42: 'openedge-abl', 43: 'php', 44: 'perl', 45: 'postscript',
  46: 'powershell', 47: 'prolog', 48: 'protobuf', 49: 'python', 50: 'r', 51: 'rpg',
  52: 'ruby', 53: 'rust', 54: 'sas', 55: 'scss', 56: 'sql', 57: 'scala', 58: 'scheme',
  59: 'scratch', 60: 'shell', 61: 'swift', 62: 'thrift', 63: 'typescript', 64: 'vbscript',
  65: 'vbnet', 66: 'xml', 67: 'yaml',
};

export const codeParser: BlockParser = {
  blockType: 14,
  parse (block: DocxBlock, _ctx: ParserContext): MdBlockNode {
    const lang = codeLangMap[block.code?.style?.language ?? 1] ?? '';
    const content = block.code?.elements?.map(e => e.text_run?.content ?? '').join('') ?? '';
    return {
      type: 'codeBlock',
      lang,
      content,
    };
  },
};
